import path from 'node:path';
import { saveUpload, postDir } from '@/lib/store.mjs';
import { ensurePoster, ensurePreview } from '@/lib/video-proxy.mjs';

// Upload of an original photo/video (multipart field "file"). The returned fields go on a slide,
// already pinned by hash.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return Response.json({ error: '파일이 없어요.' }, { status: 400 });
    const fields = await saveUpload(brandId, id, file.name, Buffer.from(await file.arrayBuffer()));
    if (fields.mediaType === 'video') {
      // Light stand-ins for the editor: the poster now (≈1s), the preview MP4 in the background.
      const saved = path.join(postDir(brandId, id), fields.media);
      await ensurePoster(saved).catch((e) => console.warn(`video poster: ${e.message}`));
      ensurePreview(saved).catch((e) => console.warn(`video preview: ${e.message}`));
    }
    return Response.json(fields);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
