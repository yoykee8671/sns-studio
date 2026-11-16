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
  // Secure on HTTPS (sns.gnuol.com via the tunnel); plain http is the direct Tailscale
  // address (http://macmini:3110), already encrypted by Tailscale, where a Secure cookie
  // would never be kept.
  const https = req.headers.get('x-forwarded-proto') === 'https' || new URL(req.url).protocol === 'https:';
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie':
          `studio-auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` +
          (https ? '; Secure' : ''),
      },
    },
  );
}
