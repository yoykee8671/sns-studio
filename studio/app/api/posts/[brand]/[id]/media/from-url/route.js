import { saveUpload, readPost } from '@/lib/store.mjs';
import { importFromUrl } from '@/lib/import-url.mjs';

export const maxDuration = 300;

// { url } → the Instagram post's video(s)/photos downloaded by the server straight into
// this post's media (like uploads). Returns their slide fields plus the original
// account, for the editor to place on slides.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    await readPost(brandId, id); // 404s before downloading anything
    const { url } = await req.json();
    const got = await importFromUrl(url);
    const items = [];
    for (const f of got.files.slice(0, 10)) items.push(await saveUpload(brandId, id, f.name, f.data));
    return Response.json({ items, handle: got.handle, url: got.url });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
