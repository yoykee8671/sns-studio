// 연재 (series) management: issues are numbered automatically and "다음 호" starts a
// new post from the latest issue's template composition (layout kept, content blank).
// Stored per brand at content/<brand>/series.json.
// Issue numbers are bookkeeping only — they never appear on the cards (user decision).
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { readPost, createPost, postDir } from './store.mjs';

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const seriesFile = (brandId) => path.join(path.dirname(postDir(brandId, 'x')), 'series.json');

export async function loadSeries(brandId) {
  if (!SAFE_ID.test(brandId)) throw new Error(`invalid brand: ${brandId}`);
  // Only a genuinely absent file means "no series yet". A read error or corrupted
  // JSON must throw — returning [] here would let the next save wipe every series.
  let raw;
  try {
    raw = await readFile(seriesFile(brandId), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    raw = null;
  }
  if (!raw) return { series: [] };
  const parsed = JSON.parse(raw);
  return { series: parsed.series ?? [] };
}

async function saveSeries(brandId, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.dirname(seriesFile(brandId));
  await mkdir(path.join(dir, '.series-history'), { recursive: true });
  await copyFile(seriesFile(brandId), path.join(dir, '.series-history', `${stamp}.json`))
    .catch(() => {});
  await writeFile(seriesFile(brandId), body);
}

export async function createSeries(brandId, title) {
  const name = (title ?? '').trim();
  if (!name) throw new Error('연재 이름을 입력해주세요.');
  const data = await loadSeries(brandId);
  const id = `s-${Date.now().toString(36)}`;
  data.series.push({ id, title: name, nextNo: 1, posts: [] });
  await saveSeries(brandId, data);
  return data.series.at(-1);
}

/** Registers an existing post as the next issue of a series. */
export async function attachPost(brandId, seriesId, postId, title) {
  const data = await loadSeries(brandId);
  const s = data.series.find((x) => x.id === seriesId);
  if (!s) throw new Error('연재를 찾지 못했어요.');
  if (s.posts.some((p) => p.postId === postId)) throw new Error('이미 이 연재에 들어간 게시물이에요.');
  const no = s.nextNo;
  s.posts.push({ postId, no, title: title ?? postId });
  s.nextNo = no + 1;
  await saveSeries(brandId, data);
  return { seriesId, no };
}

// Fields that carry content (emptied for the next issue); layout/options stay.
const CONTENT_KEYS = [
  'headline', 'body', 'title', 'intro', 'items', 'name', 'tagline', 'source', 'credit',
  'media', 'mediaType', 'image', 'imageSha256', 'focus', 'zoom',
];

/**
 * Starts the next issue: copies the latest existing issue's slide composition
 * (template, options, stickers, textStyle), blanks the content, numbers it.
 * @returns {Promise<{ post: object, no: number }>}
 */
export async function nextIssue(brandId, seriesId) {
  const data = await loadSeries(brandId);
  const s = data.series.find((x) => x.id === seriesId);
  if (!s) throw new Error('연재를 찾지 못했어요.');
  if (!s.posts.length) throw new Error('연재에 게시물이 없어요. 먼저 게시물을 연재에 넣어주세요.');

  // Latest issue whose post still exists (issues may have been deleted).
  let base = null;
  for (const entry of [...s.posts].sort((a, b) => b.no - a.no)) {
    try {
      base = await readPost(brandId, entry.postId);
      break;
    } catch {
      // deleted — try the next newest
    }
  }
  if (!base) throw new Error('연재의 기존 게시물을 찾지 못했어요. 게시물을 하나 연재에 넣어주세요.');

  const slides = base.slides.map((slide) => {
    const next = structuredClone(slide);
    for (const k of CONTENT_KEYS) delete next[k];
    for (const st of next.stickers ?? []) if ('text' in st) st.text = '';
    return next;
  });

  const no = s.nextNo;
  const post = await createPost({
    brand: brandId,
    template: base.template,
    format: base.format,
    ratio: base.ratio,
    contentType: base.contentType,
    source: base.source ? { ...base.source, url: '', permission: 'none', dm: '' } : undefined,
    slides,
  });
  s.posts.push({ postId: post.id, no, title: `${s.title} ${no}호` });
  s.nextNo = no + 1;
  await saveSeries(brandId, data);
  return { post, no };
}
