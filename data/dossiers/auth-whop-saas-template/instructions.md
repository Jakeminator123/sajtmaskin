# When to use

Use this dossier when a Next.js app should:

- sign users in with **Whop OAuth**
- read the user's Whop access token on the server
- gate pages, APIs, or app areas based on **ownership of one or more Whop products**

This is a good fit for paid communities, member dashboards, SaaS tools sold through Whop, or any app where product ownership should control access.

# How to integrate

## 1) Install and configure env vars

Required env vars:

```env
NEXT_PUBLIC_WHOP_CLIENT_ID=
WHOP_CLIENT_SECRET=
WHOP_API_KEY=
NEXT_PUBLIC_REQUIRED_PRODUCT=
NEXT_PUBLIC_RECOMMENDED_PLAN_ID=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Notes:

- `NEXT_PUBLIC_WHOP_CLIENT_ID` and `WHOP_CLIENT_SECRET` are used by Auth.js OAuth.
- `WHOP_API_KEY` may be needed elsewhere in your app for server-to-server Whop calls, even though the core auth flow here uses the user OAuth token.
- `NEXT_PUBLIC_REQUIRED_PRODUCT` can be a single product ID or a comma-separated list.
- `NEXT_PUBLIC_RECOMMENDED_PLAN_ID` is useful for upgrade/purchase UI, but not required for auth itself.
- `NEXTAUTH_SECRET` is mandatory.

## 2) Add the Auth.js Whop provider

Keep a shared auth config like this:

```ts
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "whop",
      name: "Whop",
      type: "oauth",
      authorization: "https://whop.com/oauth",
      token: "https://api.whop.com/api/v5/oauth/token",
      userinfo: "https://api.whop.com/api/v5/me",
      clientId: process.env.NEXT_PUBLIC_WHOP_CLIENT_ID,
      clientSecret: process.env.WHOP_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile(profile: {
        id: string;
        username: string;
        email: string;
        profile_pic_url: string;
      }) {
        return {
          id: profile.id,
          name: profile.username,
          email: profile.email,
          image: profile.profile_pic_url,
        };
      },
    },
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.accessToken = token.accessToken as string;
      return session;
    },
    async jwt({ token, user, account }) {
      if (user) token.id = user.id;
      if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
  },
};
```

Then expose NextAuth in an App Router route:

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

## 3) Create a Whop SDK from the signed-in user's token

In middleware, use the JWT token injected by `withAuth`:

```ts
import { WhopSDK } from "@whop-sdk/core/browser";
import { NextRequestWithAuth } from "next-auth/middleware";

const getSdk = (req: NextRequestWithAuth) => {
  const token = req.nextauth.token?.accessToken as string | undefined;
  if (!token) return { sdk: null };
  return {
    sdk: new WhopSDK({ TOKEN: token }).userOAuth,
  };
};

export default getSdk;
```

For server components and route handlers, build from `getServerSession(authOptions)`:

```ts
import { WhopSDK } from "@whop-sdk/core";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getWhopServerSdk() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;

  if (!token) return { sdk: null, session: null };

  return {
    sdk: new WhopSDK({ TOKEN: token }).userOAuth,
    session,
  };
}
```

## 4) Gate routes by product ownership

Implement a reusable membership check helper and call it from middleware or route handlers.

```ts
export async function hasWhopProductAccess(
  sdk: { memberships?: { list?: () => Promise<any[]> } },
  allowedProducts: string | string[]
) {
  const allowed = Array.isArray(allowedProducts)
    ? allowedProducts
    : allowedProducts.split(",").map((v) => v.trim()).filter(Boolean);

  const memberships = (await sdk.memberships?.list?.()) ?? [];

  return (
    memberships.find((membership) => {
      const productId = membership.product?.id ?? membership.product_id;
      const status = membership.status?.toLowerCase?.() ?? "active";
      return allowed.includes(productId) && status !== "expired" && status !== "cancelled";
    }) ?? null
  );
}
```

Generic middleware pattern:

```ts
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import getSdk from "@/lib/get-user-sdk/middleware";
import { hasWhopProductAccess } from "@/lib/has-product";

const requiredProducts = (process.env.NEXT_PUBLIC_REQUIRED_PRODUCT || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

export default withAuth(
  async function middleware(req) {
    const { sdk } = getSdk(req);

    if (!sdk) {
      const signInUrl = new URL("/api/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", req.url);
      return NextResponse.redirect(signInUrl);
    }

    if (!requiredProducts.length) return NextResponse.next();

    const membership = await hasWhopProductAccess(sdk as never, requiredProducts);
    if (membership) return NextResponse.next();

    return NextResponse.redirect(new URL("/upgrade", req.url));
  },
  {
    callbacks: {
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: ["/app/:path*"],
};
```

## 5) Add a server endpoint for entitlement checks

Useful when client UI needs to ask the server whether the signed-in user owns a product.

```ts
import { NextRequest, NextResponse } from "next/server";
import { getWhopServerSdk } from "@/lib/get-user-sdk/server";
import { hasWhopProductAccess } from "@/lib/has-product";

export async function POST(req: NextRequest) {
  const { sdk } = await getWhopServerSdk();
  if (!sdk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const membership = await hasWhopProductAccess(
    sdk as never,
    body.allowedProducts ?? process.env.NEXT_PUBLIC_REQUIRED_PRODUCT ?? ""
  );

  return NextResponse.json({ membership });
}
```

## 6) Add sign-in / sign-out UI

Example client component:

```tsx
"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session) {
    return (
      <button onClick={() => signIn("whop")}>Continue with Whop</button>
    );
  }

  return <button onClick={() => signOut()}>Sign out</button>;
}
```

If you use `useSession`, wrap your app in `SessionProvider` in a client boundary.

# UX rules

- Treat **Whop sign-in** and **product access** as separate states. A user may be authenticated but still not own the required product.
- For protected routes, redirect unauthenticated users to sign-in and authenticated-but-ineligible users to an upgrade or purchase page.
- Explain why access is blocked: “You’re signed in, but this page requires Product X.”
- Preserve `callbackUrl` or the original pathname so users return to the intended page after sign-in or upgrade.
- Show a deterministic loading state while checking session or entitlement status.
- Prefer server-enforced gating for app routes and sensitive API endpoints; do not rely only on client-side checks.

# Avoid

- Do not keep template-specific route matchers like `/ssg/product-gated` unless the project actually uses those paths.
- Do not hardcode product IDs in code; read them from env or app config.
- Do not trust client-provided entitlement state for authorization.
- Do not expose `WHOP_CLIENT_SECRET` or server API keys to the client.
- Do not assume every membership object has identical fields; normalize `product.id` vs `product_id` and handle missing status defensively.
- Do not use Whop gating middleware on all asset or public marketing routes.

# Verification

- Confirm `/api/auth/signin` shows a Whop sign-in option and the OAuth flow completes.
- After sign-in, verify the session includes `session.user.id` and `session.accessToken`.
- Visit a protected route under `/app`:
  - signed out -> redirected to sign-in
  - signed in with required product -> allowed through
  - signed in without required product -> redirected to `/upgrade` or equivalent
- Call the entitlement endpoint and confirm it returns a membership object for eligible users and `null` for ineligible users.
- Remove or change `NEXT_PUBLIC_REQUIRED_PRODUCT` and verify gating behavior changes accordingly.
- In production, verify OAuth callback URLs and Auth.js secrets are set correctly for the deployed domain.
