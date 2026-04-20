import { NextRequest, NextResponse } from 'next/server';

const requiredEnv = [
  'BIGCOMMERCE_STORE_HASH',
  'BIGCOMMERCE_CHANNEL_ID',
  'BIGCOMMERCE_ACCESS_TOKEN',
  'BIGCOMMERCE_API_URL'
] as const;

function getEnv(name: (typeof requiredEnv)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export async function bigCommerceAdminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = getEnv('BIGCOMMERCE_API_URL');
  const storeHash = getEnv('BIGCOMMERCE_STORE_HASH');
  const token = getEnv('BIGCOMMERCE_ACCESS_TOKEN');

  const response = await fetch(`${apiUrl}/stores/${storeHash}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
      Accept: 'application/json',
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`BigCommerce Admin API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

type PageNode =
  | { __typename: 'Product'; entityId: number }
  | { __typename: 'Category'; entityId: number }
  | null;

export async function getProductIdBySlug(pathname: string): Promise<PageNode> {
  const normalized = pathname.replace(/^\//, '').replace(/\/$/, '');
  if (!normalized) return null;

  // Implement this against your storefront GraphQL route resolver.
  // This generic fallback returns null so middleware only rewrites when wired.
  return null;
}

export async function revalidate(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.BIGCOMMERCE_REVALIDATION_SECRET;
  if (secret) {
    const provided = req.headers.get('x-revalidate-secret') ?? req.nextUrl.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.json({ ok: true, revalidated: true, now: Date.now() });
}
