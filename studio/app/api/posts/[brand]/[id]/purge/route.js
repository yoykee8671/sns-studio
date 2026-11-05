import { purgeMedia, imageStatus, loadBrand } from '@/lib/store.mjs';

// Deletes the post's uploaded media (storage cleanup after publishing elsewhere).
export async function POST(_req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    const post = await purgeMedia(brandId, id);
    const images = await imageStatus(await loadBrand(brandId), post);
    return Response.json({ post, images });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
