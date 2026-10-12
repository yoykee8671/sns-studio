import { createHash } from 'node:crypto';

// Issues the auth cookie when the password matches. See proxy.js for the gate.
export async function POST(req) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password) return Response.json({ ok: true }); // gate disabled

  const { password: given } = await req.json().catch(() => ({}));
  if (given !== password) {
    return Response.json({ error: '비밀번호가 달라요.' }, { status: 401 });
  }
  const token = createHash('sha256').update(password).digest('hex');
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie':
          `studio-auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` +
          (process.env.NODE_ENV === 'production' ? '; Secure' : ''),
      },
    },
  );
}
