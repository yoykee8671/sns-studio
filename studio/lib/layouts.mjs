// 내 템플릿: saved layouts (slide line-up + per-slide template, options, sliders,
// typography and stickers) without any text or media. Stored as files under
// <CONTENT_ROOT>/_layouts/ (underscore = never listed as a brand). Also keeps the
// list of built-in templates the user has hidden from the pickers.
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_ROOT } from './store.mjs';
import { TEMPLATES } from './templates/index.mjs';
import { STICKER_TYPES } from './stickers.mjs';
import { renumberSlides } from './templates/sets.mjs';
import { isRatio, DEFAULT_RATIO } from './templates/sizes.mjs';

const DIR = path.join(CONTENT_ROOT, '_layouts');
const HIDDEN_FILE = path.join(DIR, '_hidden.json');
const LAYOUT_ID = /^l-[a-z0-9]{6,20}$/;
// Slide keys that carry content, never layout: media, plus every template's text fields
// (a slide switched between templates can still hold the old template's text).
const CONTENT_KEYS = new Set([
  'media', 'mediaType', 'imageSha256', 'image', 'focus', 'zoom',
  ...Object.values(TEMPLATES).flatMap((t) => t.meta.fields.map((f) => f.key)),
]);

export const isLayoutId = (id) => LAYOUT_ID.test(id ?? '');
const fileOf = (id) => {
  if (!isLayoutId(id)) throw new Error(`invalid template id: ${id}`);
  return path.join(DIR, `${id}.json`);
};

const cleanName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** Keeps the design of each slide and empties its text/media (template defaults refill them). */
export function stripSlides(post) {
  const slides = post.slides.map((slide) => {
    const key = slide.template && TEMPLATES[slide.template] ? slide.template : post.template;
    const meta = TEMPLATES[key]?.meta;
    if (!meta) throw new Error(`unknown template: ${key}`);
    const out = { ...meta.newSlide(post) };
    for (const [k, v] of Object.entries(slide)) {
      if (CONTENT_KEYS.has(k)) continue;
      out[k] = structuredClone(v);
    }
    // Stickers stay as design (type, place, size, color); their written text resets.
    if (Array.isArray(out.stickers)) {
      out.stickers = out.stickers.map((st) => {
        const text = STICKER_TYPES[st.type]?.defaults?.text;
        return 'text' in st ? { ...st, text: text ?? '' } : st;
      });
    }
    if (key !== post.template) out.template = key;
    else delete out.template;
    return out;
  });
  return renumberSlides(slides.map((s) => ({ ...s, template: s.template ?? post.template })))
    .map((s) => {
      if (s.template === post.template) delete s.template;
      return s;
    });
}

function toLayout({ id, name, desc, brand, post, createdAt }) {
  if (!TEMPLATES[post?.template]) throw new Error('unknown template');
  if (!Array.isArray(post.slides) || !post.slides.length) throw new Error('slides required');
  const now = new Date().toISOString();
  return {
    id,
    name: cleanName(name) || '이름 없는 템플릿',
    desc: String(desc ?? '').trim().slice(0, 120),
    brand,
    format: post.format,
    ratio: post.format === 'reel' ? undefined : (isRatio(post.ratio) ? post.ratio : DEFAULT_RATIO),
    contentType: post.contentType ?? TEMPLATES[post.template].meta.contentType,
    template: post.template,
    slides: stripSlides(post),
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

const write = async (layout) => {
  await mkdir(DIR, { recursive: true });
  await writeFile(fileOf(layout.id), `${JSON.stringify(layout, null, 2)}\n`);
  return layout;
};

export async function readLayout(id) {
  return JSON.parse(await readFile(fileOf(id), 'utf8'));
}

export async function listLayouts() {
  const out = [];
  for (const f of await readdir(DIR).catch(() => [])) {
    const id = f.replace(/\.json$/, '');
    if (!isLayoutId(id)) continue;
    try {
      const l = await readLayout(id);
      out.push({
        id: l.id, name: l.name, desc: l.desc, brand: l.brand, format: l.format,
        slides: l.slides.length, templates: l.slides.map((s) => s.template ?? l.template),
        // One-slide templates can be applied to a single slide from the editor's picker.
        slide: l.slides.length === 1 ? { ...l.slides[0], template: l.slides[0].template ?? l.template } : undefined,
        updatedAt: l.updatedAt,
      });
    } catch (e) {
      console.warn(`layout ${id}: ${e.message}`);
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

/** From a post (editor "내 템플릿으로 저장") or a single built-in template ("복사해서 수정"). */
export async function createLayout({ name, desc, brand, post, builtin }) {
  const id = `l-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  if (builtin) {
    const t = TEMPLATES[builtin];
    if (!t) throw new Error(`unknown template: ${builtin}`);
    const format = t.meta.formats.includes('carousel') ? 'carousel' : t.meta.formats[0];
    const draft = { format, template: builtin, slides: [] };
    post = { ...draft, ratio: DEFAULT_RATIO, contentType: t.meta.contentType, slides: [t.meta.newSlide(draft)] };
    name ||= `${t.meta.label} 복사본`;
  }
  return write(toLayout({ id, name, desc, brand, post }));
}

/** Rename/describe ({ name, desc }) and/or replace the design from an edited post. */
export async function updateLayout(id, { name, desc, post }) {
  const prev = await readLayout(id);
  const base = post
    ? { ...prev, ...post, slides: post.slides, template: post.template }
    : prev;
  return write(toLayout({
    id,
    name: name ?? prev.name,
    desc: desc ?? prev.desc,
    brand: prev.brand,
    post: base,
    createdAt: prev.createdAt,
  }));
}

export async function deleteLayout(id) {
  await rm(fileOf(id), { force: true });
}

/** The layout as a post-shaped object the editor (and createPost) can work with. */
export function layoutAsPost(layout) {
  return {
    id: layout.id,
    brand: layout.brand,
    format: layout.format,
    ...(layout.ratio ? { ratio: layout.ratio } : {}),
    contentType: layout.contentType,
    template: layout.template,
    status: 'draft',
    slides: structuredClone(layout.slides),
    caption: '',
    hashtags: [],
    layoutName: layout.name,
    layoutDesc: layout.desc,
  };
}

// ---- hidden built-in templates ----

export async function readHidden() {
  try {
    const { hidden } = JSON.parse(await readFile(HIDDEN_FILE, 'utf8'));
    return (hidden ?? []).filter((k) => TEMPLATES[k]);
  } catch {
    return [];
  }
}

export async function saveHidden(keys) {
  const hidden = [...new Set(keys)].filter((k) => TEMPLATES[k]);
  await mkdir(DIR, { recursive: true });
  await writeFile(HIDDEN_FILE, `${JSON.stringify({ hidden }, null, 2)}\n`);
  return hidden;
}
