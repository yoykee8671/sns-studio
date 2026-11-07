// Post storage: file-based, content/<brand>/<post>/post.json + media/. On the Mac mini
// server CONTENT_ROOT points at a Docker volume so posts survive rebuilds.
// Brand assets (logos, closing images) always come from the repo's brand folders.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, copyFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { STICKER_TYPES, normalizeSticker } from './stickers.mjs';
import { resolveTemplate, TEMPLATES } from './templates/index.mjs';
import { stripMarkup } from './templates/markup.mjs';
import { isFontChoice } from './templates/fonts.mjs';

// cwd is normally the studio folder; probe for the brands folder so scripts run from
// the repo root resolve the same ROOT.
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
export const CONTENT_ROOT = process.env.STUDIO_CONTENT_ROOT ?? path.join(ROOT, 'content');
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

const assertId = (id) => {
  if (!SAFE_ID.test(id ?? '')) throw new Error(`invalid id: ${id}`);
};

export async function loadBrand(brandId) {
  assertId(brandId);
  const brand = JSON.parse(await readFile(path.join(ROOT, 'brands', `${brandId}.json`), 'utf8'));
  // 매거진 스타일: user-set point color / highlight / fonts override the brand JSON,
  // so every template picks them up without knowing the feature exists.
  const style = await readBrandStyle(brandId);
  const colors = { ...brand.colors };
  if (style.colors?.point) colors.blue = style.colors.point;
  if (style.colors?.highlight) colors.lime = style.colors.highlight;
  const fonts = { ...brand.fonts };
  if (style.fonts?.headline) fonts.headline = style.fonts.headline;
  if (style.fonts?.body) fonts.body = style.fonts.body;
  const avatar = await findBrandAvatar(brandId);
  return {
    ...brand, colors, fonts, style, assetPath: path.resolve(ROOT, brand.assetDir),
    ...(avatar ? { avatarFile: avatar.file, avatarVersion: avatar.version } : {}),
  };
}

/** The brand as sent to the browser: avatar as a versioned URL, no server paths. */
export function clientBrand(brand) {
  const { avatarFile, avatarVersion, assetPath, ...rest } = brand;
  return avatarFile ? { ...rest, avatarSrc: `/api/brand-style/${brand.id}/avatar?v=${avatarVersion}` } : rest;
}

// ---- 계정 프로필 사진 (팔로우 카드 등) — <CONTENT_ROOT>/_brand/<brand>/avatar.<ext> ----

const AVATAR_EXT = ['.jpg', '.png', '.webp'];
const avatarDir = (brandId) => path.join(CONTENT_ROOT, '_brand', brandId);

async function findBrandAvatar(brandId) {
  for (const ext of AVATAR_EXT) {
    const file = path.join(avatarDir(brandId), `avatar${ext}`);
    const st = await stat(file).catch(() => null);
    if (st) return { file, version: Math.round(st.mtimeMs) };
  }
  return null;
}

/** Saves the account's profile photo (uploaded, or fetched from Instagram). */
export async function saveBrandAvatar(brandId, data, ext) {
  assertId(brandId);
  if (!AVATAR_EXT.includes(ext)) throw new Error('JPG·PNG·WEBP 사진만 쓸 수 있어요.');
  await deleteBrandAvatar(brandId);
  await mkdir(avatarDir(brandId), { recursive: true });
  await writeFile(path.join(avatarDir(brandId), `avatar${ext}`), data);
}

export async function deleteBrandAvatar(brandId) {
  assertId(brandId);
  for (const ext of AVATAR_EXT) await rm(path.join(avatarDir(brandId), `avatar${ext}`), { force: true });
}

// ---- 매거진 스타일 (brand-wide style overrides, stored with the content) ----

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Keeps only valid keys/values; unknown fonts and non-hex colors are dropped. */
export function normalizeBrandStyle(input, { isFont = isFontChoice } = {}) {
  const out = {};
  const colors = {};
  if (HEX_COLOR.test(input?.colors?.point ?? '')) colors.point = input.colors.point;
  if (HEX_COLOR.test(input?.colors?.highlight ?? '')) colors.highlight = input.colors.highlight;
  if (Object.keys(colors).length) out.colors = colors;
  const fonts = {};
  if (isFont(input?.fonts?.headline)) fonts.headline = input.fonts.headline;
  if (isFont(input?.fonts?.body)) fonts.body = input.fonts.body;
  if (Object.keys(fonts).length) out.fonts = fonts;
  return out;
}

// loadBrand runs on every asset/preview request; a short-lived cache keeps the style
// read off the disk for most of them. saveBrandStyle refreshes it.
const styleCache = new Map(); // brandId -> { style, at }
const STYLE_TTL_MS = 5000;

/**
 * Missing file = no overrides ({}). A corrupted file also degrades to {} (with a
 * warning) instead of throwing: style is cosmetic, and throwing here would take
 * down every page of the brand — including the home page where you'd fix it.
 * Values are re-normalized on read so only whitelisted colors/fonts reach CSS.
 */
export async function readBrandStyle(brandId) {
  assertId(brandId);
  const hit = styleCache.get(brandId);
  if (hit && Date.now() - hit.at < STYLE_TTL_MS) return hit.style;
  let style = {};
  try {
    const raw = await readFile(path.join(CONTENT_ROOT, brandId, 'brand-style.json'), 'utf8');
    style = normalizeBrandStyle(JSON.parse(raw));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`brand-style ${brandId}: ${e.message} — ignoring overrides`);
    style = {};
  }
  styleCache.set(brandId, { style, at: Date.now() });
  return style;
}

export async function saveBrandStyle(brandId, style) {
  assertId(brandId);
  const body = `${JSON.stringify(style, null, 2)}\n`;
  const dir = path.join(CONTENT_ROOT, brandId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'brand-style.json'), body);
  styleCache.set(brandId, { style, at: Date.now() });
  return style;
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

/** Unique safe object name, media type and MIME for an uploaded original. */
function uploadTarget(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!VIDEO_EXT.has(ext) && !IMAGE_EXT.has(ext)) throw new Error(`지원하지 않는 파일 형식이에요: ${ext}`);
  // ASCII-only names keep URLs and shell tools (ffmpeg) free of escaping surprises.
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const mime = VIDEO_EXT.has(ext)
    ? ({ '.mov': 'video/quicktime', '.webm': 'video/webm' }[ext] ?? 'video/mp4')
    : `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`;
  return {
    name: `${Date.now()}-${base || 'file'}${ext}`,
    mediaType: VIDEO_EXT.has(ext) ? 'video' : 'image',
    mime,
  };
}

/** Saves an uploaded original into content/<brand>/<post>/media/ and returns its slide fields. */
export async function saveUpload(brandId, postId, filename, data) {
  const { name, mediaType } = uploadTarget(filename);
  const dir = path.join(postDir(brandId, postId), 'media');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), data);
  return {
    media: `media/${name}`,
    mediaType,
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

/** Folder name rule: <account>_<YYMMDD in Korea time>-<NN>, e.g. pickydoggyclub_261107-01. */
export async function newPostId(brandId, now = new Date()) {
  assertId(brandId);
  const kst = new Date(now.getTime() + 9 * 3600 * 1000).toISOString();
  const day = `${kst.slice(2, 4)}${kst.slice(5, 7)}${kst.slice(8, 10)}`;
  // The folder is claimed with a non-recursive mkdir: of two concurrent creates only one
  // can win a name, the other moves on to the next number.
  await mkdir(path.join(CONTENT_ROOT, brandId), { recursive: true });
  for (let n = 1; n < 1000; n++) {
    const id = `${brandId}_${day}-${String(n).padStart(2, '0')}`;
    try {
      await mkdir(postDir(brandId, id));
      return id;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('오늘 만든 게시물이 너무 많아요.');
}

/**
 * Carousels end on a last-page slide. When the line-up doesn't already end on one, the
 * brand's 끝장 이미지 is added as a regular (swappable, deletable) slide; closing-image
 * slides without a picture get the brand's closing image. Mutates and returns slides.
 */
export async function withClosingSlide(brandId, format, slides, template, { always = false } = {}) {
  if (format !== 'carousel') return true;
  const brand = await loadBrand(brandId).catch(() => null);
  if (!brand) return false; // unknown account (tests) or a failed read: nothing done
  const closing = await closingImage(brand);
  const roleOf = (s) => TEMPLATES[s.template ?? template]?.meta.role;
  if (closing && (always || roleOf(slides[slides.length - 1] ?? {}) !== 'last')) {
    slides.push({ ...TEMPLATES['closing-image'].meta.newSlide(), template: 'closing-image' });
  }
  return true;
}

/** Creates content/<brand>/<id>/post.json under an automatic folder name (newPostId). */
export async function createPost({ brand: brandId, template, format, ratio, contentType, slides, source }) {
  assertId(brandId);
  const id = await newPostId(brandId);
  await withClosingSlide(brandId, format, slides, template);
  const post = {
    id,
    brand: brandId,
    format,
    ...(ratio ? { ratio } : {}),
    contentType,
    template,
    status: 'draft',
    ...(source ? { source } : {}),
    slides,
    caption: '',
    hashtags: [],
    closingMigrated: true,
  };
  await mkdir(postDir(brandId, id), { recursive: true });
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
  const file = path.join(postDir(brandId, postId), 'post.json');
  const post = normalize(JSON.parse(await readFile(file, 'utf8')));
  // Carousels used to get the closing image appended at export time; it is a real slide
  // now. Older posts gain it once (kept on their next save).
  // Their export always ended on the closing image (also after a 팔로우 카드), so every old
  // carousel gets it; marked done only when the brand could be read.
  if (!post.closingMigrated) {
    const done = await withClosingSlide(brandId, post.format, post.slides, post.template, { always: true })
      .catch(() => false);
    if (done) post.closingMigrated = true;
  }
  // Drafts from the first version of this change stored a copy of the closing path;
  // the 끝장 slide now always follows the account's current closing file.
  for (const s of post.slides) {
    if (resolveTemplate(post, s).meta.brandClosing && !s.media && s.image?.startsWith('closing/')) delete s.image;
  }
  return post;
}

/**
 * Writes post.json, keeping the previous version in .history/ so nothing is lost.
 * publishedAt is stamped the first time a post is saved as 'published' and dropped
 * when it leaves that status (it drives the media expiry below).
 * touch: false keeps updatedAt (the "last saved" date) for housekeeping writes.
 */
export async function savePost(brandId, postId, post, { touch = true } = {}) {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, '-');
  const next = { ...post, updatedAt: touch ? now : (post.updatedAt ?? now) };
  if (next.status === 'published') next.publishedAt ??= now;
  else delete next.publishedAt;
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

/** Permanently removes a post: post.json, edit history and uploaded media. */
export async function deletePost(brandId, postId) {
  await rm(postDir(brandId, postId), { recursive: true, force: true });
}

/**
 * Deletes a post's uploaded media to free storage (발행 끝난 게시물 정리). The post
 * keeps rendering with media-missing placeholders; purged filenames stay on record.
 * Brand-asset references (slide.image) are not uploads and are left alone. Idempotent.
 */
export async function purgeMedia(brandId, postId, { touch = true } = {}) {
  const post = await readPost(brandId, postId);
  const removed = [...new Set(post.slides.map((s) => s.media).filter(Boolean))]
    .map((m) => m.split('/').pop());
  for (const s of post.slides) {
    if (s.media) {
      delete s.media;
      delete s.mediaType;
      delete s.imageSha256;
    }
  }
  post.mediaPurged = true;
  post.purgedFiles = [...new Set([...(post.purgedFiles ?? []), ...removed])];
  // Save the stripped post first: if the storage delete fails midway the post never
  // references half-deleted files, and re-running the purge cleans up the rest.
  const saved = await savePost(brandId, postId, post, { touch });
  // out/ holds the last export (rendered JPG/PNG/MP4) — the other big thing on disk.
  await rm(path.join(postDir(brandId, postId), 'media'), { recursive: true, force: true });
  await rm(path.join(postDir(brandId, postId), 'out'), { recursive: true, force: true });
  return saved;
}

// 발행 완료 후 이 기간이 지나면 사진·영상(원본 + 내보낸 파일)을 서버에서 지운다.
// 글과 레이아웃(post.json)은 남아서 목록·템플릿 저장에 계속 쓸 수 있다.
export const MEDIA_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a published post's media get deleted (ISO string), or null when not applicable. */
export function mediaExpiresAt(post) {
  if (post.status !== 'published' || post.mediaPurged || !post.publishedAt) return null;
  return new Date(Date.parse(post.publishedAt) + MEDIA_RETENTION_DAYS * DAY_MS).toISOString();
}

/** Purges media of every post whose retention ran out. Returns the purged ids. */
export async function expirePublishedMedia(now = Date.now()) {
  const purged = [];
  for (const brandId of await listDirNames('')) {
    if (!SAFE_ID.test(brandId)) continue;
    for (const postId of await listDirNames(brandId)) {
      if (!SAFE_ID.test(postId)) continue;
      try {
        const post = await readPost(brandId, postId);
        // Published before publish dates were recorded: start their 7 days now
        // (savePost stamps publishedAt) rather than purging them on first sight.
        if (post.status === 'published' && !post.publishedAt && !post.mediaPurged) {
          await savePost(brandId, postId, post, { touch: false });
          continue;
        }
        const at = mediaExpiresAt(post);
        if (!at || Date.parse(at) > now) continue;
        await purgeMedia(brandId, postId, { touch: false });
        purged.push(`${brandId}/${postId}`);
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn(`media expiry ${brandId}/${postId}: ${e.message}`);
      }
    }
  }
  return purged;
}

/** Uploaded-media bytes per brand. */
export async function mediaUsage() {
  const out = [];
  for (const brandId of await listDirNames('')) {
    if (!SAFE_ID.test(brandId)) continue;
    let bytes = 0;
    let files = 0;
    for (const postId of await listDirNames(brandId)) {
      if (!SAFE_ID.test(postId)) continue;
      const dir = path.join(postDir(brandId, postId), 'media');
      for (const f of await readdir(dir).catch(() => [])) {
        const st = await stat(path.join(dir, f)).catch(() => null);
        if (st?.isFile()) {
          bytes += st.size;
          files += 1;
        }
      }
    }
    out.push({ brand: brandId, bytes, files });
  }
  return out;
}

const listDirNames = (prefix) =>
  readdir(prefix ? path.join(CONTENT_ROOT, prefix) : CONTENT_ROOT).catch(() => []);

/** Display title: slide 1's headline, else its template's first filled text field. */
function postTitle(post) {
  const slide = post.slides[0];
  if (!slide) return null;
  let raw = slide.headline;
  if (!raw) {
    try {
      const { meta } = resolveTemplate(post, slide);
      raw = meta.fields.map((f) => slide[f.key]).find((v) => v && String(v).trim());
    } catch {
      raw = null;
    }
  }
  const text = stripMarkup(raw ?? '').replace(/\n/g, ' ').trim();
  return text || null;
}

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
          title: postTitle(post) ?? postId,
          slides: post.slides.length,
          series: post.series ?? null,
          updatedAt: post.updatedAt ?? null,
          publishedAt: post.status === 'published' ? (post.publishedAt ?? null) : null,
          mediaPurged: Boolean(post.mediaPurged),
          mediaExpiresAt: mediaExpiresAt(post),
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
        // Text-only templates (and optional-photo templates with the photo off) have no
        // media to pin; 'none' passes the export gate instead of blocking as 'missing'.
        // Purged posts also pass — they render the empty-photo placeholder by design.
        const t = resolveTemplate(post, slide).meta;
        if (!t.mediaTypes.length || t.usesMedia?.(slide) === false) return { state: 'none' };
        // 끝장 이미지 without its own photo uses the account's closing file: nothing to pin.
        if (t.brandClosing && !slide.media) return { state: 'none' };
        if (post.mediaPurged && !slide.media && !slide.image) return { state: 'none' };
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
