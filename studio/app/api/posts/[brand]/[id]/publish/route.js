import { savePost } from '@/lib/store.mjs';
import { renderPost, captionText, permissionError, ImageChangedError } from '@/lib/render-server.mjs';
import { publishConfig, uploadMedia, publish } from '@/lib/instagram.mjs';

export const maxDuration = 300;

// Saves the post, renders JPEGs/MP4s, uploads them to public URLs and publishes to Instagram.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  const config = publishConfig();
  if (!config.ready) return Response.json({ error: 'not configured', missing: config.missing }, { status: 412 });

  const { post } = await req.json();
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  const denied = permissionError(post);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  if (post.status === 'published') {
    return Response.json({ error: '이미 발행된 게시물이에요.' }, { status: 409 });
  }

  try {
    let saved = await savePost(brandId, id, post);
    const { files } = await renderPost(saved, { format: 'jpg', quality: 95 });
    const items = await uploadMedia(`${brandId}/${id}`, files);
    const result = await publish({ items, caption: captionText(saved).trim() });
    saved = await savePost(brandId, id, {
      ...saved,
      status: 'published',
      publishedAt: new Date().toISOString(),
      instagram: result,
    });
    return Response.json({ post: saved, ...result });
  } catch (err) {
    const status = err instanceof ImageChangedError ? 409 : 502;
    return Response.json({ error: err.message }, { status });
  }
}
