import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadBrand, saveBrandAvatar, deleteBrandAvatar } from '@/lib/store.mjs';
import { fetchProfilePicture } from '@/lib/instagram.mjs';

const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// The real type comes from the file's first bytes, not from its name or claimed MIME.
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

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
        'X-Content-Type-Options': 'nosniff',
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
      const { data } = await fetchProfilePicture(brand);
      const ext = sniff(data);
      if (!ext) throw new Error('Instagram이 준 프로필 사진 형식을 알 수 없어요.');
      await saveBrandAvatar(brandId, data, ext);
    } else {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return Response.json({ error: '파일이 없어요.' }, { status: 400 });
      if (file.size > 5 * 1024 * 1024) return Response.json({ error: '5MB 이하 사진만 올릴 수 있어요.' }, { status: 413 });
      const data = Buffer.from(await file.arrayBuffer());
      const ext = sniff(data);
      if (!ext) return Response.json({ error: 'JPG·PNG·WEBP 사진만 쓸 수 있어요.' }, { status: 400 });
      await saveBrandAvatar(brandId, data, ext);
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
