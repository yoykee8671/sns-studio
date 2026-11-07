// Short-lived public copies of rendered slides for Instagram publishing. The Graph API
// pulls media from public URLs, so each publish writes its files under
// <CONTENT_ROOT>/_public/<random token>/ (served by app/p/[token]/[file], outside the
// password gate) and removes them once Instagram has fetched them.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_ROOT } from './store.mjs';

// The leading underscore keeps this folder out of post/brand listings (ids must start
// with a letter or digit).
export const PUBLIC_ROOT = path.join(CONTENT_ROOT, '_public');
export const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FILE_RE = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|mp4)$/;
const STALE_MS = 6 * 60 * 60 * 1000;

/** Public base URL of this server (e.g. https://sns.gnuol.com), or null if unset. */
export const publicBaseUrl = () => process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '') || null;

/**
 * @param {{name: string, data: Buffer, type: string}[]} files
 * @returns {Promise<{ token: string, items: {url: string, kind: 'image'|'video'}[] }>}
 */
export async function stagePublic(files) {
  const base = publicBaseUrl();
  if (!base) throw new Error('PUBLIC_BASE_URL이 설정되지 않았어요.');
  const token = randomUUID();
  const dir = path.join(PUBLIC_ROOT, token);
  await mkdir(dir, { recursive: true });
  const items = [];
  for (const f of files) {
    if (!FILE_RE.test(f.name)) throw new Error(`invalid file name: ${f.name}`);
    await writeFile(path.join(dir, f.name), f.data);
    items.push({
      url: `${base}/p/${token}/${f.name}`,
      kind: f.type.startsWith('video/') ? 'video' : 'image',
    });
  }
  return { token, items };
}

export async function removeStaged(token) {
  if (!TOKEN_RE.test(token ?? '')) return;
  await rm(path.join(PUBLIC_ROOT, token), { recursive: true, force: true });
}

/** Deletes leftovers of publishes that crashed before cleaning up after themselves. */
export async function sweepStaged(maxAgeMs = STALE_MS) {
  const now = Date.now();
  for (const token of await readdir(PUBLIC_ROOT).catch(() => [])) {
    if (!TOKEN_RE.test(token)) continue;
    const st = await stat(path.join(PUBLIC_ROOT, token)).catch(() => null);
    if (st && now - st.mtimeMs > maxAgeMs) await removeStaged(token);
  }
}
