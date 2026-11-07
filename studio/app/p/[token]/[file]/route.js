import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { PUBLIC_ROOT, TOKEN_RE, FILE_RE } from '@/lib/public-media.mjs';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };

// Public (no password) download of a staged publish file — Instagram's servers fetch
// these while a publish is running. Tokens are random UUIDs and live only minutes.
export async function GET(_req, { params }) {
  const { token, file } = await params;
  if (!TOKEN_RE.test(token) || !FILE_RE.test(file)) return new Response('not found', { status: 404 });
  const full = path.join(PUBLIC_ROOT, token, file);
  try {
    const { size } = await stat(full);
    return new Response(Readable.toWeb(createReadStream(full)), {
      headers: {
        'Content-Type': TYPES[path.extname(file).toLowerCase()],
        'Content-Length': String(size),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
