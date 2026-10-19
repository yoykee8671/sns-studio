import { signMediaUpload } from '@/lib/store.mjs';

// Issues a signed Supabase upload URL so the browser sends the file body directly
// to storage (Vercel functions cap request bodies at 4.5MB — too small for videos).
// Local file mode answers { url: null } and the client falls back to /media.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  try {
    const { filename } = await req.json();
    if (!filename) return Response.json({ error: '파일 이름이 없어요.' }, { status: 400 });
    const signed = await signMediaUpload(brandId, id, filename);
    return Response.json(signed ?? { url: null });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
