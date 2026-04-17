import { NextRequest, NextResponse } from 'next/server';
import { stackServerApp } from '@/stack';

const PROTECTED_PREFIXES = ['/dashboard', '/account', '/settings'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!isProtected) return NextResponse.next();

  const user = await stackServerApp.getUser();
  if (user) return NextResponse.next();

  const signInUrl = new URL('/handler/sign-in', request.url);
  signInUrl.searchParams.set('after_auth_return_to', pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*', '/settings/:path*'],
};
