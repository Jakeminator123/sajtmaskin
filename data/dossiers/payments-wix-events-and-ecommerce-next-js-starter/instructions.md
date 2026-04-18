# When to use

Use this dossier when a Next.js App Router project needs **Wix Headless checkout** for store products, especially:

- quick-buy flows from a product card or PDP
- redirecting users into Wix-hosted checkout
- anonymous visitor sessions via Wix visitor tokens
- a headless storefront that still uses Wix for cart/checkout completion

This dossier is for **server-side checkout initiation**, not for building the full storefront UI.

# How to integrate

## 1) Install the required Wix SDK packages

```bash
npm install @wix/sdk @wix/ecom @wix/stores @wix/redirects
```

## 2) Add environment variables

At minimum:

```env
NEXT_PUBLIC_WIX_CLIENT_ID=your_wix_oauth_client_id
```

If your broader app uses additional Wix APIs, add those separately, but this dossier specifically requires the public client ID so middleware can generate visitor tokens.

## 3) Add middleware to create anonymous visitor tokens

Create `middleware.ts` at the project root or adapt the dossier middleware logic there.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient, OAuthStrategy } from '@wix/sdk';

const WIX_REFRESH_TOKEN_COOKIE = 'wixRefreshToken';

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-middleware-request-url', request.url);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (request.cookies.get(WIX_REFRESH_TOKEN_COOKIE)) {
    return response;
  }

  const wixClient = createClient({
    auth: OAuthStrategy({
      clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID!,
    }),
  });

  const tokens = await wixClient.auth.generateVisitorTokens();

  response.cookies.set(WIX_REFRESH_TOKEN_COOKIE, JSON.stringify(tokens.refreshToken), {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return response;
}
```

Why this matters:

- Wix checkout and cart flows need a visitor identity.
- The middleware makes that identity available before users hit product/cart/checkout routes.
- The forwarded `x-middleware-request-url` header gives route handlers a stable absolute URL to build callback URLs from.

## 4) Add a reusable Wix server client helper

```ts
import { cookies } from 'next/headers';
import { createClient, OAuthStrategy } from '@wix/sdk';
import { redirects } from '@wix/redirects';
import { products } from '@wix/stores';
import { checkout } from '@wix/ecom';

const WIX_REFRESH_TOKEN_COOKIE = 'wixRefreshToken';

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
```

## 5) Add a route that redirects an existing checkout into Wix-hosted checkout

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getWixServerClient } from '@/app/lib/wix/server';

function getRequestUrl(request: NextRequest) {
  return request.headers.get('x-middleware-request-url') || request.url;
}

export async function GET(request: NextRequest) {
  const requestUrl = getRequestUrl(request);
  const baseUrl = new URL('/', requestUrl).toString();
  const checkoutId = new URL(requestUrl).searchParams.get('checkoutId');

  if (!checkoutId) {
    return NextResponse.json({ error: 'Missing checkoutId' }, { status: 400 });
  }

  const wixClient = await getWixServerClient();

  const { redirectSession } = await wixClient.redirects.createRedirectSession({
    ecomCheckout: { checkoutId },
    callbacks: {
      postFlowUrl: baseUrl,
      thankYouPageUrl: `${baseUrl}stores-success`,
      cartPageUrl: `${baseUrl}cart`,
    },
  });

  return NextResponse.redirect(redirectSession!.fullUrl!);
}
```

Use this route when you already have a `checkoutId` and need the Wix redirect session URL.

## 6) Add a quick-buy route for a product

```ts
import { NextRequest, NextResponse } from 'next/server';
import { checkout as checkoutTypes } from '@wix/ecom';
import { getWixServerClient } from '@/app/lib/wix/server';

const WIX_STORES_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';

function getRequestUrl(request: NextRequest) {
  return request.headers.get('x-middleware-request-url') || request.url;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const requestUrl = getRequestUrl(request);
  const baseUrl = new URL('/', requestUrl).toString();
  const { searchParams } = new URL(requestUrl);

  const quantity = parseInt(searchParams.get('quantity') || '1', 10);
  const productOptions = searchParams.get('productOptions');
  const parsedOptions = productOptions ? JSON.parse(productOptions) : null;

  const wixClient = await getWixServerClient();
  const { product } = await wixClient.products.getProduct(productId);

  if (!product) {
    return new NextResponse('Product not found', { status: 404 });
  }

  const selectedOptions =
    parsedOptions ??
    (product.manageVariants
      ? { variantId: product.variants?.[0]?._id }
      : product.productOptions?.length
        ? {
            options: Object.fromEntries(
              product.productOptions.map((option) => [
                option.name!,
                option.choices?.[0]?.description!,
              ])
            ),
          }
        : undefined);

  const item = {
    quantity,
    catalogReference: {
      appId: WIX_STORES_APP_ID,
      catalogItemId: product._id!,
      options: selectedOptions,
    },
  };

  const createdCheckout = await wixClient.ecomCheckout.createCheckout({
    lineItems: [item],
    channelType: checkoutTypes.ChannelType.WEB,
    overrideCheckoutUrl: `${baseUrl}api/redirect-to-checkout?checkoutId={checkoutId}`,
  });

  const { redirectSession } = await wixClient.redirects.createRedirectSession({
    ecomCheckout: { checkoutId: createdCheckout!._id! },
    callbacks: {
      postFlowUrl: baseUrl,
      thankYouPageUrl: `${baseUrl}stores-success`,
      cartPageUrl: `${baseUrl}cart`,
    },
  });

  return NextResponse.redirect(redirectSession!.fullUrl!);
}
```

This route supports links like:

```ts
<a href={`/api/quick-buy/${productId}?quantity=1`}>Buy now</a>
```

Or with selected options:

```ts
const productOptions = encodeURIComponent(JSON.stringify({
  options: { Size: 'M', Color: 'Black' }
}));

const href = `/api/quick-buy/${productId}?quantity=2&productOptions=${productOptions}`;
```

## 7) Wire the UI to server routes, not directly to Wix secrets

Client components should link to or submit to your own route handlers:

```tsx
export function QuickBuyButton({ productId }: { productId: string }) {
  return (
    <a href={`/api/quick-buy/${productId}?quantity=1`}>
      Buy now
    </a>
  );
}
```

Keep checkout creation on the server so cookies, callback URLs, and future auth changes stay centralized.

# UX rules

- Treat quick-buy as a **hard redirect** into Wix checkout; do not present it as an in-app modal checkout.
- Show clear button labels like **Buy now** or **Checkout**.
- If the product has variants or required options, collect them before sending the user to quick-buy.
- Disable or hide quick-buy until the user has selected required product options.
- Always provide a fallback path back to cart or product detail pages.
- Use stable thank-you and cart routes, and make sure those pages actually exist.

# Avoid

- Do not expose private Wix credentials in client components.
- Do not call Wix checkout APIs directly from the browser for this flow.
- Do not assume the first variant/option is always the right selection in a polished storefront; that fallback is only acceptable when no explicit user choice exists.
- Do not keep template-specific imports like `@app/hooks/useWixClientServer`, `@app/constants`, or branded layout components unless your app already defines them.
- Do not rely on layout-level env-var warning screens as part of the integration; validate env vars in deployment and fail fast in server code.
- Do not omit cookie security settings in production.

# Verification

1. Set `NEXT_PUBLIC_WIX_CLIENT_ID` in local env.
2. Start the app and load any route matched by middleware.
3. Confirm a `wixRefreshToken` cookie is set.
4. Hit a valid quick-buy URL:

```txt
/api/quick-buy/PRODUCT_ID?quantity=1
```

5. Confirm the route returns a redirect to a Wix checkout/session URL.
6. Complete checkout in Wix and verify the thank-you callback returns to your configured route.
7. Test a bad product ID and confirm you get a 404.
8. Test missing `checkoutId` on the redirect route and confirm you get a 400.
9. Test a variant product with explicit `productOptions` and verify the correct variant lands in checkout.
