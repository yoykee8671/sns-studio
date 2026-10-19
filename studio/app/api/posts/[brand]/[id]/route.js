import { readPost, savePost, deletePost, loadBrand, loadLogoSvg, imageStatus, closingImage } from '@/lib/store.mjs';
import { publishConfig } from '@/lib/instagram.mjs';

export async function GET(_req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    const [post, brand] = await Promise.all([readPost(brandId, id), loadBrand(brandId)]);
    const [logoSvg, images, closing] = await Promise.all([
      loadLogoSvg(brand),
      imageStatus(brand, post),
      closingImage(brand),
    ]);
    return Response.json({ post, brand, logoSvg, images, closing, publish: publishConfig(brand) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 404 });
  }
}

// Permanently removes the post (content, history, uploaded media). The published
// Instagram post, if any, is not touched — deletion is app-side only.
export async function DELETE(_req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    await readPost(brandId, id); // 404s before touching storage
  } catch (err) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  await deletePost(brandId, id);
  return Response.json({ ok: true });
}

export async function PUT(req, { params }) {
  const { brand: brandId, id } = await params;
  const { post } = await req.json();
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  const saved = await savePost(brandId, id, post);
  const images = await imageStatus(await loadBrand(brandId), saved);
  return Response.json({ post: saved, images });
}
