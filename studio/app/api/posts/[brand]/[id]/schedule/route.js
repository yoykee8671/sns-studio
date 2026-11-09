import { savePost, loadBrand, readPost } from '@/lib/store.mjs';
import { publishBlocker, checkScheduleTime } from '@/lib/publish-post.mjs';

// 예약 발행. PUT { post, at } saves the post and books (or moves) its publish time;
// the server publishes the saved post at that time (see instrumentation.js).
// DELETE cancels the booking; the post stays as it is.
export async function PUT(req, { params }) {
  const { brand: brandId, id } = await params;
  const brand = await loadBrand(brandId);
  const { post, at } = await req.json();
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  const blocked = await publishBlocker(brand, post);
  if (blocked) return Response.json({ error: blocked.error, missing: blocked.missing }, { status: blocked.status });
  const bad = checkScheduleTime(at);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  const current = await readPost(brandId, id).catch(() => null);
  if (current?.schedule?.state === 'publishing') {
    return Response.json({ error: '예약 발행이 지금 진행 중이라 바꿀 수 없어요.' }, { status: 409 });
  }
  const saved = await savePost(brandId, id, {
    ...post,
    schedule: { at: new Date(at).toISOString(), state: 'scheduled', bookedAt: new Date().toISOString() },
  });
  return Response.json({ post: saved });
}

export async function DELETE(_req, { params }) {
  const { brand: brandId, id } = await params;
  const current = await readPost(brandId, id);
  if (current.schedule?.state === 'publishing') {
    return Response.json({ error: '예약 발행이 지금 진행 중이라 취소할 수 없어요.' }, { status: 409 });
  }
  const { schedule, ...rest } = current;
  const saved = await savePost(brandId, id, rest, { touch: false });
  return Response.json({ post: saved });
}
