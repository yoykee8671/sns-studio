import { saveUpload } from '@/lib/store.mjs';

// Upload of an original photo/video (multipart field "file"). The returned fields go on a slide,
// already pinned by hash.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return Response.json({ error: '파일이 없어요.' }, { status: 400 });
    const fields = await saveUpload(brandId, id, file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json(fields);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
