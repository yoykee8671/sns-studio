import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadBrand, saveBrandAvatar, deleteBrandAvatar } from '@/lib/store.mjs';
import { fetchProfilePicture } from '@/lib/instagram.mjs';

const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// The account's profile photo (팔로우 카드). GET serves it; POST takes a multipart
// "file" upload, or { source: 'instagram' } to fetch the current Instagram picture;
// DELETE removes it (templates fall back to the logo).
export async function GET(_req, { params }) {
  const { brand: brandId } = await params;
  try {
    const brand = await loadBrand(brandId);
    if (!brand.avatarFile) return new Response('not found', { status: 404 });
    return new Response(await readFile(brand.avatarFile), {
      headers: {
        'Content-Type': TYPES[path.extname(brand.avatarFile)] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=31536000, immutable', // URLs carry ?v=<mtime>
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

export async function POST(req, { params }) {
  const { brand: brandId } = await params;
  try {
    const brand = await loadBrand(brandId);
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      const { source } = await req.json();
      if (source !== 'instagram') return Response.json({ error: 'unknown source' }, { status: 400 });
      const { data, ext } = await fetchProfilePicture(brand);
      await saveBrandAvatar(brandId, data, ext);
    } else {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return Response.json({ error: '파일이 없어요.' }, { status: 400 });
      if (file.size > 5 * 1024 * 1024) return Response.json({ error: '5MB 이하 사진만 올릴 수 있어요.' }, { status: 413 });
      const ext = EXT[file.type] ?? path.extname(file.name).toLowerCase().replace('.jpeg', '.jpg');
      await saveBrandAvatar(brandId, Buffer.from(await file.arrayBuffer()), ext);
    }
    const fresh = await loadBrand(brandId);
    return Response.json({ avatarSrc: `/api/brand-style/${brandId}/avatar?v=${fresh.avatarVersion}` });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const { brand: brandId } = await params;
  try {
    await loadBrand(brandId);
    await deleteBrandAvatar(brandId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
