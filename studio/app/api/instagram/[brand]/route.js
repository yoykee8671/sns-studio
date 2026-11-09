import { loadBrand } from '@/lib/store.mjs';
import { saveAccount, removeAccount } from '@/lib/ig-accounts.mjs';
import { verifyToken } from '@/lib/instagram.mjs';

// Instagram 연결 for one account. PUT { token } checks the token with Instagram first and
// stores it server-side only; the response carries just the account name. DELETE disconnects.
export async function PUT(req, { params }) {
  const { brand: brandId } = await params;
  try {
    await loadBrand(brandId);
    const { token } = await req.json();
    const clean = String(token ?? '').trim();
    if (clean.length < 20) return Response.json({ error: '토큰을 붙여넣어 주세요.' }, { status: 400 });
    const { userId, username } = await verifyToken(clean).catch((e) => {
      throw new Error(`Instagram이 이 토큰을 받지 않았어요: ${e.message}`);
    });
    const now = new Date().toISOString();
    await saveAccount(brandId, { userId, token: clean, username, savedAt: now, refreshedAt: now });
    return Response.json({ username });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  const { brand: brandId } = await params;
  try {
    await loadBrand(brandId);
    await removeAccount(brandId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
