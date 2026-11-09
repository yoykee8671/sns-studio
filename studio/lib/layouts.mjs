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

/**
 * The text written on the first slide, kept only for the template's preview card (the
 * thumbnail shows what the user made); picking the template still applies design only.
 */
function previewText(slide, fallback) {
  const t = TEMPLATES[slide?.template ?? fallback];
  if (!t) return undefined;
  const out = {};
  for (const f of t.meta.fields) {
    const v = slide[f.key];
    if (typeof v === 'string' && v.trim()) out[f.key] = v.slice(0, 2000);
  }
  return Object.keys(out).length ? out : undefined;
}

function toLayout({ id, name, desc, brand, post, createdAt, builtinKey, preview }) {
  if (builtinKey) {
    // A built-in's edited design: always exactly one slide of that very template.
    post = { ...post, template: builtinKey, slides: [{ ...(post.slides?.[0] ?? {}), template: builtinKey }] };
  }
  if (!TEMPLATES[post?.template]) throw new Error('unknown template');
  if (!Array.isArray(post.slides) || !post.slides.length) throw new Error('slides required');
  const now = new Date().toISOString();
  const text = preview ?? previewText(post.slides[0], post.template);
  return {
    id,
    ...(builtinKey ? { builtinKey } : {}),
    name: cleanName(name) || '이름 없는 템플릿',
    desc: String(desc ?? '').trim().slice(0, 120),
    brand,
    format: post.format,
    ratio: post.format === 'reel' ? undefined : (isRatio(post.ratio) ? post.ratio : DEFAULT_RATIO),
    contentType: post.contentType ?? TEMPLATES[post.template].meta.contentType,
    template: post.template,
    slides: stripSlides(post),
    ...(text ? { preview: text } : {}),
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
        ...(l.builtinKey ? { builtinKey: l.builtinKey } : {}),
        // One-slide templates can be applied to a single slide from the editor's picker.
        slide: l.slides.length === 1 ? { ...l.slides[0], template: l.slides[0].template ?? l.template } : undefined,
        // First slide, for the preview card of any template (one slide or many).
        first: { ...l.slides[0], template: l.slides[0].template ?? l.template },
        ...(l.preview ? { preview: l.preview } : {}),
        updatedAt: l.updatedAt,
      });
    } catch (e) {
      console.warn(`layout ${id}: ${e.message}`);
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

/**
 * From a post (editor "내 템플릿으로 저장") or a single built-in template ("복제").
 * override: true edits the built-in itself — one record per built-in (returned if it
 * exists), which the pickers then show and apply in place of the code default.
 */
export async function createLayout({ name, desc, brand, post, builtin, override = false }) {
  if (override) {
    if (!TEMPLATES[builtin]) throw new Error(`unknown template: ${builtin}`);
    const existing = (await listLayouts()).find((l) => l.builtinKey === builtin);
    if (existing) return readLayout(existing.id);
  }
  const id = `l-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  if (builtin) {
    const t = TEMPLATES[builtin];
    if (!t) throw new Error(`unknown template: ${builtin}`);
    const format = t.meta.formats.includes('carousel') ? 'carousel' : t.meta.formats[0];
    const draft = { format, template: builtin, slides: [] };
    post = { ...draft, ratio: DEFAULT_RATIO, contentType: t.meta.contentType, slides: [t.meta.newSlide(draft)] };
    name ||= override ? t.meta.label : `${t.meta.label} 복사본`;
  }
  return write(toLayout({ id, name, desc, brand, post, builtinKey: override ? builtin : undefined }));
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
    builtinKey: prev.builtinKey,
    // A rename keeps the card's text; a saved edit takes the text it now has.
    preview: post ? undefined : prev.preview,
  }));
}

export async function deleteLayout(id) {
  await rm(fileOf(id), { force: true });
}

/**
 * The layout as a post-shaped object the editor (and createPost) can work with.
 * withPreview: the template editor reopens with the text shown on its card.
 */
export function layoutAsPost(layout, { withPreview = false } = {}) {
  const slides = structuredClone(layout.slides);
  if (withPreview && layout.preview && slides[0]) Object.assign(slides[0], layout.preview);
  return {
    id: layout.id,
    brand: layout.brand,
    format: layout.format,
    ...(layout.ratio ? { ratio: layout.ratio } : {}),
    contentType: layout.contentType,
    template: layout.template,
    status: 'draft',
    slides,
    caption: '',
    hashtags: [],
    layoutName: layout.name,
    layoutDesc: layout.desc,
    ...(layout.builtinKey ? { builtinKey: layout.builtinKey } : {}),
  };
}

/** Edited built-ins: { [templateKey]: { id, name, slide } } from a listLayouts() result. */
export const overridesOf = (list) =>
  Object.fromEntries(list.filter((l) => l.builtinKey)
    .map((l) => [l.builtinKey, { id: l.id, name: l.name, slide: l.first, preview: l.preview }]));

/**
 * A new slide of a built-in template with its edited design (if any): the override's
 * design under the slide's own content (text the slide already carries wins).
 */
export function withOverride(slide, key, overrides) {
  const o = overrides?.[key];
  if (!o) return slide;
  const { template, ...design } = structuredClone(o.slide);
  const content = Object.fromEntries(Object.entries(slide).filter(([, v]) => v !== '' && v !== undefined));
  return { ...design, ...content };
}

// ---- 즐겨찾는 템플릿: 'builtin:<key>' or 'mine:<id>' ----

const FAV_FILE = path.join(DIR, '_favorites.json');
const FAV_RE = /^(builtin:[a-z0-9-]+|mine:l-[a-z0-9]{6,20})$/;

export async function readFavorites() {
  try {
    const { favorites } = JSON.parse(await readFile(FAV_FILE, 'utf8'));
    return (favorites ?? []).filter((f) => FAV_RE.test(f) && (!f.startsWith('builtin:') || TEMPLATES[f.slice(8)]));
  } catch {
    return [];
  }
}

export async function saveFavorites(list) {
  const favorites = [...new Set(list)].filter((f) => FAV_RE.test(f));
  await mkdir(DIR, { recursive: true });
  await writeFile(FAV_FILE, `${JSON.stringify({ favorites }, null, 2)}\n`);
  return favorites;
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
