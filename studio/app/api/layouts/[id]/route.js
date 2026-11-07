import { readLayout, updateLayout, deleteLayout, layoutAsPost, isLayoutId } from '@/lib/layouts.mjs';
import { loadBrand, loadLogoSvg, imageStatus, closingImage, listBrands } from '@/lib/store.mjs';

// Same payload shape as GET /api/posts/<brand>/<id>, so the editor can open a template.
export async function GET(_req, { params }) {
  const { id } = await params;
  try {
    const layout = await readLayout(id);
    const brandId = layout.brand ?? (await listBrands())[0]?.id;
    const brand = await loadBrand(brandId);
    const post = layoutAsPost({ ...layout, brand: brandId });
    const [logoSvg, images, closing] = await Promise.all([
      loadLogoSvg(brand), imageStatus(brand, post), closingImage(brand),
    ]);
    return Response.json({ post, brand, logoSvg, images, closing, publish: { ready: false, missing: [] } });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 404 });
  }
}

// { post } (from the editor) and/or { name, desc } (rename).
export async function PUT(req, { params }) {
  const { id } = await params;
  const { post, name, desc } = await req.json();
  if (post && post.id !== id) return Response.json({ error: 'id mismatch' }, { status: 400 });
  try {
    const layout = await updateLayout(id, {
      post,
      name: name ?? post?.layoutName,
      desc: desc ?? post?.layoutDesc,
    });
    const brand = await loadBrand(layout.brand);
    const saved = layoutAsPost(layout);
    return Response.json({ layout, post: saved, images: await imageStatus(brand, saved) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err.code === 'ENOENT' ? 404 : 400 });
  }
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  if (!isLayoutId(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  await deleteLayout(id);
  return Response.json({ ok: true });
}
