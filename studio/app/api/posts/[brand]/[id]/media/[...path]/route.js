import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { postDir, mediaKey, supabaseEnabled } from '@/lib/store.mjs';
import { getObject } from '@/lib/blob-store.mjs';

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

// Serves uploaded originals from content/<brand>/<post>/media/, with Range support for video seeking.
export async function GET(req, { params }) {
  const { brand: brandId, id, path: parts } = await params;
  try {
    if (supabaseEnabled) {
      // Bucket mode: proxy the object, forwarding Range so video seeking keeps working.
      const rel = `media/${parts.map(decodeURIComponent).join('/')}`;
      const range = req.headers.get('range');
      const upstream = await getObject(mediaKey(brandId, id, rel), range ? { range } : {});
      if (!upstream.ok && upstream.status !== 206) return new Response('not found', { status: 404 });
      const pass = {};
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = upstream.headers.get(h);
        if (v) pass[h] = v;
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...pass },
      });
    }
    const base = path.join(postDir(brandId, id), 'media');
    const file = path.resolve(base, parts.map(decodeURIComponent).join('/'));
    if (!file.startsWith(base + path.sep)) return new Response('not found', { status: 404 });
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type) return new Response('unsupported', { status: 415 });
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
          'Cache-Control': 'no-store',
        },
      });
    }
    return new Response(Readable.toWeb(createReadStream(file)), {
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
