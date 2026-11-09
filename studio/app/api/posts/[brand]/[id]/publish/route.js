import { savePost, loadBrand } from '@/lib/store.mjs';
import { ImageChangedError } from '@/lib/render-server.mjs';
import { publishBlocker, publishSaved } from '@/lib/publish-post.mjs';

export const maxDuration = 300;

// 바로 발행: saves the post, renders JPEGs/MP4s, stages them at public URLs and publishes
// to Instagram. A pending 예약 on the post is replaced by publishing now.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  const brand = await loadBrand(brandId);
  const { post } = await req.json();
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  const blocked = await publishBlocker(brand, post);
  if (blocked) return Response.json({ error: blocked.error, missing: blocked.missing }, { status: blocked.status });
  if (post.schedule?.state === 'publishing') {
    return Response.json({ error: '예약 발행이 지금 진행 중이에요.' }, { status: 409 });
  }
  try {
    const { schedule, ...rest } = post;
    await savePost(brandId, id, rest);
    return Response.json(await publishSaved(brandId, id));
  } catch (err) {
    const status = err instanceof ImageChangedError ? 409 : err.status ?? 502;
    return Response.json({ error: err.message }, { status });
  }
}
