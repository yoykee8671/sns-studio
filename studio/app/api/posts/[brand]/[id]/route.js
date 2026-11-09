import { readPost, savePost, deletePost, loadBrand, loadLogoSvg, imageStatus, closingImage, clientBrand } from '@/lib/store.mjs';
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
    return Response.json({ post, brand: clientBrand(brand), logoSvg, images, closing, publish: await publishConfig(brand) });
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
  // The media may have been purged (7-day expiry) while this editor was open: keep the
  // purge record and drop references to the deleted files instead of reviving them.
  const existing = await readPost(brandId, id).catch(() => null);
  if (existing?.mediaPurged && !post.mediaPurged) {
    const gone = new Set(existing.purgedFiles ?? []);
    for (const s of post.slides ?? []) {
      if (s.media && gone.has(s.media.split('/').pop())) {
        delete s.media;
        delete s.mediaType;
        delete s.imageSha256;
      }
    }
    post.mediaPurged = true;
    post.purgedFiles = existing.purgedFiles;
  }
  // 예약 is changed only through /schedule, and a post the server already published
  // (예약 발행) stays published even if this editor still shows it as a draft.
  delete post.schedule;
  if (existing?.schedule) post.schedule = existing.schedule;
  // Marked as published by hand (올린 곳이 따로 있음): a pending 예약 is dropped.
  if (post.status === 'published' && post.schedule?.state !== 'publishing') delete post.schedule;
  if (existing?.status === 'published' && post.status !== 'published' && existing.instagram) {
    Object.assign(post, { status: 'published', publishedAt: existing.publishedAt, instagram: existing.instagram });
    if (existing.scheduledFor) post.scheduledFor = existing.scheduledFor;
  }
  const saved = await savePost(brandId, id, post);
  const images = await imageStatus(await loadBrand(brandId), saved);
  return Response.json({ post: saved, images });
}
