import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getProductIdBySlug } from 'lib/bigcommerce';

export async function middleware(request: NextRequest) {
  const pageNode = await getProductIdBySlug(request.nextUrl.pathname);

  if (pageNode?.__typename === 'Product') {
    return NextResponse.rewrite(new URL(`/product/${pageNode.entityId}`, request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ]
};
