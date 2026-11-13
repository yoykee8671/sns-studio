import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { postDir } from '@/lib/store.mjs';
import { ensurePoster, ensurePreview, readyPreview } from '@/lib/video-proxy.mjs';

const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};
const VIDEO = new Set(['.mp4', '.m4v', '.mov', '.webm']);

// Uploaded files get unique names (timestamp prefix) and never change in place, so the
// browser may keep them: previews re-render often and must not re-download multi-MB photos.
const CACHE = 'private, max-age=31536000, immutable';

/** Streams a file, with Range support for video seeking. */
async function serve(req, file, type, cache) {
  const { size } = await stat(file);
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  if (range) {
    const start = range[1] ? +range[1] : Math.max(0, size - +range[2]);
    const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(Readable.toWeb(createReadStream(file, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cache,
      },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)), {
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Cache-Control': cache },
  });
}

// Serves uploaded originals from content/<brand>/<post>/media/. For videos the editor asks
// for light stand-ins: ?v=poster (first frame JPEG) and ?v=preview (small MP4; the
// original is served, uncached, until the preview is ready).
export async function GET(req, { params }) {
  const { brand: brandId, id, path: parts } = await params;
  try {
    const base = path.join(postDir(brandId, id), 'media');
    const file = path.resolve(base, parts.map(decodeURIComponent).join('/'));
    if (!file.startsWith(base + path.sep)) return new Response('not found', { status: 404 });
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext];
    if (!type) return new Response('unsupported', { status: 415 });
    await stat(file);
    const variant = new URL(req.url).searchParams.get('v');
    if (VIDEO.has(ext) && variant === 'poster') {
      return serve(req, await ensurePoster(file), 'image/jpeg', CACHE);
    }
    if (VIDEO.has(ext) && variant === 'preview') {
      const ready = await readyPreview(file);
      if (ready) return serve(req, ready, 'video/mp4', CACHE);
      ensurePreview(file).catch((e) => console.warn(`video preview ${path.basename(file)}: ${e.message}`));
      return serve(req, file, type, 'no-store');
    }
    return serve(req, file, type, CACHE);
  } catch {
    return new Response('not found', { status: 404 });
  }
}
