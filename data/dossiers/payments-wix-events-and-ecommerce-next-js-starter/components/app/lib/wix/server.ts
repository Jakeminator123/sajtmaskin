import { cookies } from 'next/headers';
import { createClient, OAuthStrategy } from '@wix/sdk';
import { redirects } from '@wix/redirects';
import { products } from '@wix/stores';
import { checkout } from '@wix/ecom';
import { WIX_REFRESH_TOKEN_COOKIE } from './constants';

export async function getWixServerClient() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(WIX_REFRESH_TOKEN_COOKIE)?.value;

  return createClient({
    modules: {
      products,
      redirects,
      ecomCheckout: checkout,
    },
    auth: OAuthStrategy({
      clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID!,
      tokens: refreshToken
        ? { refreshToken: JSON.parse(refreshToken) }
        : undefined,
    }),
  });
}
