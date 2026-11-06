import { readBrandStyle, saveBrandStyle, normalizeBrandStyle } from '@/lib/store.mjs';

export async function GET(_req, { params }) {
  const { brand } = await params;
  try {
    return Response.json({ style: await readBrandStyle(brand) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req, { params }) {
  const { brand } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '잘못된 요청이에요.' }, { status: 400 });
  }
  try {
    const style = normalizeBrandStyle(body?.style ?? {});
    await saveBrandStyle(brand, style);
    return Response.json({ style });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
