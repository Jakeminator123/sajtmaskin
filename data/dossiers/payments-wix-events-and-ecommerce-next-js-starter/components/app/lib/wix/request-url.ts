import { NextRequest } from 'next/server';

export function getRequestUrl(request: NextRequest) {
  return request.headers.get('x-middleware-request-url') || request.url;
}
