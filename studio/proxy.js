import { NextResponse } from 'next/server';

// Single-password gate for server deployments. Active only when STUDIO_PASSWORD is set
// (local dev stays open). The cookie stores a SHA-256 of the password, never the password.

const COOKIE = 'studio-auth';

async function tokenOf(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(req) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next();

  if (req.cookies.get(COOKIE)?.value === (await tokenOf(password))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|favicon\\.ico).*)'],
};
