import { purgeMedia, imageStatus, loadBrand, readPost } from '@/lib/store.mjs';

// Deletes the post's uploaded media (storage cleanup after publishing elsewhere).
export async function POST(_req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    const existing = await readPost(brandId, id);
    if (existing.status !== 'published') {
      return Response.json(
        { error: '발행됨 상태의 게시물만 정리할 수 있어요.' },
        { status: 409 },
      );
    }
    const post = await purgeMedia(brandId, id);
    const images = await imageStatus(await loadBrand(brandId), post);
    return Response.json({ post, images });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
