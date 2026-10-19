// Post storage: file-based (content/<brand>/<post>/post.json) by default, or Supabase
// Storage for everything under content/ when SUPABASE_URL is configured (see blob-store.mjs).
// Brand assets (logos, closing images) always come from the repo's brand folders.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { STICKER_TYPES, normalizeSticker } from './stickers.mjs';
import * as blob from './blob-store.mjs';

export const { supabaseEnabled } = blob;

// cwd is the studio folder locally and in Docker, but on Vercel the traced monorepo
// is mounted with the app under studio/ — probe for the brands folder to find ROOT.
function defaultRoot() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'brands'))) return cwd;
  const nested = path.join(cwd, 'studio');
  if (existsSync(path.join(nested, 'brands'))) return nested;
  return cwd;
}

export const ROOT = process.env.STUDIO_ROOT ?? defaultRoot();
// Posts/media live here. On a server deployment this points at the persistent disk
// (e.g. /data/content) so drafts survive deploys; brands/assets stay in the app image.
const CONTENT_ROOT = process.env.STUDIO_CONTENT_ROOT ?? path.join(ROOT, 'content');
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

const assertId = (id) => {
  if (!SAFE_ID.test(id ?? '')) throw new Error(`invalid id: ${id}`);
};

export async function loadBrand(brandId) {
  assertId(brandId);
  const brand = JSON.parse(await readFile(path.join(ROOT, 'brands', `${brandId}.json`), 'utf8'));
  return { ...brand, assetPath: path.resolve(ROOT, brand.assetDir) };
}

const escapeXml = (s) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

export async function loadLogoSvg(brand, variant = 'horizontal') {
  const rel = brand.logo?.[variant];
  if (rel) {
    try {
      return await readFile(path.join(brand.assetPath, rel), 'utf8');
    } catch {}
  }
  // Brands without logo files yet get a plain wordmark (currentColor follows the
  // template's text color). Drop real SVGs at the brand.logo paths to replace it.
  const name = escapeXml(brand.handle ?? brand.id);
  const font = escapeXml(brand.fonts?.headline ?? 'Pretendard');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 72"><text x="320" y="51" text-anchor="middle" font-family="'${font}', sans-serif" font-size="42" font-weight="700" letter-spacing="-1" fill="currentColor">${name}</text></svg>`;
}

/** Resolves a brand-relative asset path, refusing anything outside the brand folder. */
export function resolveAsset(brand, rel) {
  const file = path.resolve(brand.assetPath, rel);
  if (!file.startsWith(brand.assetPath + path.sep)) throw new Error(`asset outside brand dir: ${rel}`);
  return file;
}

export function postDir(brandId, postId) {
  assertId(brandId);
  assertId(postId);
  return path.join(CONTENT_ROOT, brandId, postId);
}

/** Bucket key prefix of a post (Supabase mode). */
function postKey(brandId, postId) {
  assertId(brandId);
  assertId(postId);
  return `${brandId}/${postId}`;
}

// Uploaded media live under media/<file>; anything else is rejected before touching the bucket.
const SAFE_MEDIA = /^media\/[^/\\]+$/;

export function mediaKey(brandId, postId, rel) {
  if (!SAFE_MEDIA.test(rel)) throw new Error(`invalid media path: ${rel}`);
  return `${postKey(brandId, postId)}/${rel}`;
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export const mediaTypeOf = (slide) => {
  const rel = slide.media ?? slide.image;
  if (!rel) return null;
  return slide.mediaType ?? (VIDEO_EXT.has(path.extname(rel).toLowerCase()) ? 'video' : 'image');
};

/**
 * Absolute path of a slide's photo/video. `media` = uploaded into the post folder (media/...),
 * `image` = brand asset folder (older 지식형 posts). Both refuse paths outside their root.
 */
export function mediaFile(brand, post, slide) {
  if (slide.media) {
    const base = path.join(postDir(post.brand, post.id), 'media');
    const file = path.resolve(postDir(post.brand, post.id), slide.media);
    if (!file.startsWith(base + path.sep)) throw new Error(`media outside post dir: ${slide.media}`);
    return file;
  }
  if (slide.image) return resolveAsset(brand, slide.image);
  return null;
}

/**
 * Local file path of a slide's photo/video for rendering. In Supabase mode uploaded
 * media are fetched into `tmpDir` first (ffmpeg and poster frames need real files).
 */
export async function materializeMedia(brand, post, slide, tmpDir) {
  if (slide.media && supabaseEnabled) {
    const data = await blob.getBytes(mediaKey(post.brand, post.id, slide.media));
    if (!data) return null;
    const file = path.join(tmpDir, path.basename(slide.media));
    await writeFile(file, data);
    return file;
  }
  return mediaFile(brand, post, slide);
}

/** Saves an uploaded original into content/<brand>/<post>/media/ and returns its slide fields. */
export async function saveUpload(brandId, postId, filename, data) {
  const ext = path.extname(filename).toLowerCase();
  if (!VIDEO_EXT.has(ext) && !IMAGE_EXT.has(ext)) throw new Error(`지원하지 않는 파일 형식이에요: ${ext}`);
  const base = path.basename(filename, ext).normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);
  const name = `${Date.now()}-${base || 'file'}${ext}`;
  if (supabaseEnabled) {
    const mime = VIDEO_EXT.has(ext)
      ? ({ '.mov': 'video/quicktime', '.webm': 'video/webm' }[ext] ?? 'video/mp4')
      : `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`;
    await blob.putObject(mediaKey(brandId, postId, `media/${name}`), data, mime);
  } else {
    const dir = path.join(postDir(brandId, postId), 'media');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), data);
  }
  return {
    media: `media/${name}`,
    mediaType: VIDEO_EXT.has(ext) ? 'video' : 'image',
    imageSha256: createHash('sha256').update(data).digest('hex'),
  };
}

export async function listBrands() {
  const files = await readdir(path.join(ROOT, 'brands')).catch(() => []);
  const out = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const b = JSON.parse(await readFile(path.join(ROOT, 'brands', f), 'utf8'));
    out.push({ id: b.id, handle: b.handle, order: b.order ?? 99 });
  }
  // `order` in the brand JSON pins the main accounts to the top of pickers.
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Creates content/<brand>/<id>/post.json; `id` gets a numeric suffix if it already exists. */
export async function createPost({ brand: brandId, slug, template, format, contentType, slides, source }) {
  assertId(brandId);
  const date = new Date().toISOString().slice(0, 7);
  const clean = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'post';
  const exists = (pid) =>
    supabaseEnabled
      ? blob.objectExists(`${postKey(brandId, pid)}/post.json`)
      : stat(postDir(brandId, pid)).then(() => true, () => false);
  let id = `${date}-${clean}`;
  for (let n = 2; await exists(id); n++) id = `${date}-${clean}-${n}`;
  const post = {
    id,
    brand: brandId,
    format,
    contentType,
    template,
    status: 'draft',
    ...(source ? { source } : {}),
    slides,
    caption: '',
    hashtags: [],
  };
  if (!supabaseEnabled) await mkdir(postDir(brandId, id), { recursive: true });
  return savePost(brandId, id, post);
}

// Older drafts stored a single `postit` string per slide, and stickers as color-variant types;
// both are upgraded to the current sticker model on read.
function normalize(post) {
  for (const slide of post.slides) {
    slide.stickers ??= [];
    if (slide.postit) {
      const { defaults } = STICKER_TYPES.postit;
      slide.stickers.push({ id: 'postit-legacy', type: 'postit', ...defaults, text: slide.postit });
      delete slide.postit;
    }
    slide.stickers = slide.stickers.map((st) => normalizeSticker(st)).filter(Boolean);
    if (slide.shade === 'off') {
      slide.shadeLevel = 0;
      delete slide.shade;
    }
  }
  // The '출처 | ' prefix used to be added at render time; it is editable text now,
  // so older posts get it baked into their source fields once.
  if (!post.sourcePrefixMigrated) {
    for (const slide of post.slides) {
      if (slide.source && !slide.source.startsWith('출처')) slide.source = `출처 | ${slide.source}`;
    }
    post.sourcePrefixMigrated = true;
  }
  post.hashtags ??= [];
  post.caption ??= '';
  return post;
}

/**
 * The fixed closing slide: the first image inside <brand assets>/closing/ is appended
 * automatically to every carousel (plain, no gradient/text). Swap the file to change it.
 */
export async function closingImage(brand) {
  const files = await readdir(path.join(brand.assetPath, 'closing')).catch(() => []);
  const img = files.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase())).sort()[0];
  return img ? `closing/${img}` : null;
}

export async function readPost(brandId, postId) {
  if (supabaseEnabled) {
    const data = await blob.getBytes(`${postKey(brandId, postId)}/post.json`);
    if (!data) throw new Error(`post not found: ${brandId}/${postId}`);
    return normalize(JSON.parse(data.toString('utf8')));
  }
  const file = path.join(postDir(brandId, postId), 'post.json');
  return normalize(JSON.parse(await readFile(file, 'utf8')));
}

/** Writes post.json, keeping the previous version in .history/ so nothing is lost. */
export async function savePost(brandId, postId, post) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const next = { ...post, updatedAt: new Date().toISOString() };
  if (supabaseEnabled) {
    const key = `${postKey(brandId, postId)}/post.json`;
    await blob.copyObject(key, `${postKey(brandId, postId)}/.history/${stamp}.json`);
    await blob.putObject(key, `${JSON.stringify(next, null, 2)}\n`, 'application/json');
    return next;
  }
  const dir = postDir(brandId, postId);
  const file = path.join(dir, 'post.json');
  const history = path.join(dir, '.history');
  await mkdir(history, { recursive: true });
  try {
    await stat(file);
    await copyFile(file, path.join(history, `${stamp}.json`));
  } catch {
    // first save
  }
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

const listDirNames = async (prefix) =>
  supabaseEnabled
    ? (await blob.listDir(prefix)).filter((e) => e.folder).map((e) => e.name)
    : readdir(prefix ? path.join(CONTENT_ROOT, prefix) : CONTENT_ROOT).catch(() => []);

export async function listPosts() {
  const out = [];
  for (const brandId of await listDirNames('')) {
    if (!SAFE_ID.test(brandId)) continue;
    for (const postId of await listDirNames(brandId)) {
      if (!SAFE_ID.test(postId)) continue;
      try {
        const post = await readPost(brandId, postId);
        out.push({
          brand: brandId,
          id: postId,
          status: post.status,
          format: post.format,
          contentType: post.contentType,
          title: post.slides[0]?.headline?.replace(/\n/g, ' ') ?? postId,
          slides: post.slides.length,
          updatedAt: post.updatedAt ?? null,
        });
      } catch {
        // not a post folder
      }
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

/** Compares each slide's photo/video with its pinned hash so a swapped file is caught before export. */
export async function imageStatus(brand, post) {
  return Promise.all(
    post.slides.map(async (slide) => {
      try {
        if (slide.media && supabaseEnabled) {
          // Bucket uploads get unique names and are pinned at upload time, so a cheap
          // existence probe replaces re-hashing (videos would be costly to re-download).
          const key = mediaKey(post.brand, post.id, slide.media);
          if (!(await blob.objectExists(key))) return { state: 'missing' };
          if (slide.imageSha256) return { state: 'ok', sha: slide.imageSha256 };
          const buf = await blob.getBytes(key);
          return { state: 'unpinned', sha: createHash('sha256').update(buf).digest('hex') };
        }
        const file = mediaFile(brand, post, slide);
        if (!file) return { state: 'missing' };
        const buf = await readFile(file);
        const sha = createHash('sha256').update(buf).digest('hex');
        if (!slide.imageSha256) return { state: 'unpinned', sha };
        return { state: slide.imageSha256 === sha ? 'ok' : 'changed', sha };
      } catch {
        return { state: 'missing' };
      }
    }),
  );
}
