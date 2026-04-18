# When to use

Use this dossier when the site is built with Next.js and Plasmic, and you need Plasmic page targeting, A/B tests, or personalized variants at the edge. This is most useful for marketing pages, onboarding flows, or app entry pages where Plasmic decides which variation to serve based on request traits.

This dossier is **not** a complete Supabase auth implementation by itself. Use it alongside a Supabase auth dossier if the site also needs login, session handling, protected routes, or user profile storage.

# How to integrate

## 1. Install the Plasmic loader package

Use the Next.js edge loader package:

```bash
npm install @plasmicapp/loader-nextjs
```

## 2. Add root middleware

Create `middleware.ts` at the app root using the generic pattern below:

```ts
import { getMiddlewareResponse } from "@plasmicapp/loader-nextjs/edge";
import { NextRequest, NextResponse, userAgent } from "next/server";

export const config = {
  matcher: ["/:path((?!_next/|api/|favicon\\.ico|plasmic-host).*)"],
};

export async function middleware(req: NextRequest) {
  if (req.method !== "GET") {
    return;
  }

  const ua = userAgent(req);
  const browser = ua.browser.name?.includes("Chrome")
    ? "Chrome"
    : ua.browser.name?.includes("Safari")
    ? "Safari"
    : "Other";

  const newUrl = req.nextUrl.clone();
  const plasmicSeed = req.cookies.get("plasmic_seed");

  const { pathname, cookies } = getMiddlewareResponse({
    path: newUrl.pathname,
    traits: {
      ...(req.nextUrl.searchParams.get("utm_source")
        ? { utm_source: req.nextUrl.searchParams.get("utm_source") ?? "" }
        : {}),
      browser,
    },
    cookies: {
      ...(plasmicSeed ? { plasmic_seed: plasmicSeed.value } : {}),
    },
  });

  newUrl.pathname = pathname;
  const res = NextResponse.rewrite(newUrl);

  cookies.forEach((cookie) => {
    res.cookies.set(cookie.key, cookie.value);
  });

  return res;
}
```

## 3. Pass only stable, low-cardinality traits

Plasmic targeting works best when traits are predictable and not highly unique per visitor. Good examples:

- browser family
- UTM source
- country or locale
- signed-in vs signed-out
- coarse plan tier

If Supabase auth is present, derive simple traits from the session state rather than passing full user data.

Example:

```ts
traits: {
  is_logged_in: true,
  plan: "pro",
  locale: "en",
}
```

## 4. If using Supabase auth, keep auth separate from targeting middleware

Do not put full Supabase token validation or heavy database reads inside this middleware unless absolutely necessary. Middleware runs on many requests and should stay fast.

If you need auth-aware targeting, prefer one of these patterns:

- read an existing lightweight cookie that indicates signed-in state or plan
- set coarse personalization cookies after login/server actions
- do full auth checks in server components, route handlers, or protected layouts

## 5. Match only page routes

Keep the matcher excluding `_next`, `api`, `favicon.ico`, and `plasmic-host`. Do not rewrite asset or API routes.

## 6. Preserve the `plasmic_seed` cookie

This cookie keeps bucket assignment stable across visits. Without it, users may bounce between variants.

# UX rules

- Keep experiment assignment stable for the same visitor.
- Do not personalize with sensitive Supabase fields like email, full name, or internal IDs.
- Prefer broad traits such as `is_logged_in`, `role`, or `plan`.
- If authenticated and unauthenticated users should see different experiences, make that split intentional and testable.
- Ensure protected app pages still enforce authorization outside of Plasmic targeting.

# Avoid

- Do not use template-specific path maps unless the app actually has codegen-generated split routes.
- Do not add Google Analytics-specific middleware logic unless analytics variation reporting is explicitly required.
- Do not fetch Supabase user records in middleware on every request.
- Do not rewrite POST, PUT, PATCH, or DELETE requests.
- Do not include high-cardinality or secret traits in Plasmic targeting.

# Verification

1. Start the app and load a Plasmic-managed page.
2. Confirm the middleware only runs on page requests, not `_next/*` or `/api/*`.
3. Visit with and without `?utm_source=...` and verify the pathname rewrite still resolves.
4. Refresh several times and confirm the same visitor stays in the same variant because `plasmic_seed` persists.
5. If using Supabase auth, sign in and out and confirm any auth-derived trait changes the intended experience without breaking route protection.
6. Check response cookies in the browser devtools to ensure `plasmic_seed` is being preserved/set.
