import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadBrand, resolveAsset } from '@/lib/store.mjs';

const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// Serves files from a brand's asset folder (photos, logos) to the editor preview.
export async function GET(_req, { params }) {
  const { brand: brandId, path: parts } = await params;
  try {
    const brand = await loadBrand(brandId);
    const file = resolveAsset(brand, parts.map(decodeURIComponent).join('/'));
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type) return new Response('unsupported', { status: 415 });
    return new Response(await readFile(file), {
      headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
