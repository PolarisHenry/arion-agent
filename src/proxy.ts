import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'better-auth.session_token';
// Over HTTPS Better Auth prefixes the cookie with `__Secure-`.
const SECURE_AUTH_COOKIE = '__Secure-better-auth.session_token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  // Protect /dashboard
  if (pathname.startsWith('/dashboard')) {
    // HTTP (localhost) uses the plain name; HTTPS (cloudflared tunnel / prod)
    // uses the `__Secure-` prefixed name. Check both so auth works in either.
    const hasSession = request.cookies.get(AUTH_COOKIE) || request.cookies.get(SECURE_AUTH_COOKIE);
    if (!hasSession) {
      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
};
