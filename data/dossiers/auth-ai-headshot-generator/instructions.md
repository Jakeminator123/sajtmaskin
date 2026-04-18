# When to use

Use this dossier when the app needs **Supabase authentication** for a logged-in AI workflow such as uploading selfies, viewing generations, managing credits, or accessing a private dashboard.

This dossier is specifically useful when:
- users must sign in before using app features
- server components and route handlers need access to the authenticated session
- middleware must keep Supabase auth cookies fresh
- auth callback URLs must work correctly in production and local development
- the app also depends on a stable public deployment URL for webhooks

# How to integrate

## 1) Install and configure Supabase auth helpers

Required packages from this dossier:
- `@supabase/auth-helpers-nextjs`
- `@supabase/supabase-js`

Required env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEPLOYMENT_URL=your-production-domain-or-ngrok-host
```

If using magic links or OAuth, configure your Supabase redirect URLs to include:

```txt
https://your-domain.com/auth/callback
http://localhost:3000/auth/callback
https://your-ngrok-domain.ngrok-free.app/auth/callback
```

## 2) Add middleware for session refresh

Keep middleware at the app root so Supabase cookies are refreshed on navigation.

```ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Use a matcher unless the project already has one elsewhere.

## 3) Create server, route, and browser Supabase clients

### Server component helper

```ts
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export function createSupabaseServerClient() {
  return createServerComponentClient({ cookies });
}
```

### Route handler helper

```ts
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export function createSupabaseRouteClient() {
  return createRouteHandlerClient({ cookies });
}
```

### Client component helper

```ts
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function createSupabaseBrowserClient() {
  return createClientComponentClient();
}
```

## 4) Add auth callback handling

For magic-link or OAuth flows, add a callback route:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
```

## 5) Protect app routes on the server

Prefer server-side protection for dashboard and generation flows.

```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/components/lib/supabase/server';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  return <>{children}</>;
}
```

Use this on route groups like `(protected)` or directly in private pages.

## 6) Sign in from the client

For email magic links:

```tsx
'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/components/lib/supabase/client';

export function MagicLinkForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      console.error(error.message);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      <button disabled={loading}>{loading ? 'Sending...' : 'Send magic link'}</button>
    </form>
  );
}
```

## 7) Validate runtime config early

The source dossier includes a useful config validation pattern. Keep validation focused on integration-specific constraints:
- enum-like env vars should be validated at startup
- deployment URL used for webhooks must not be a Vercel preview URL
- avoid invalid public URLs for auth redirects and webhooks

Example:

```ts
export const config = {
  deploymentUrl: process.env.DEPLOYMENT_URL,
};

function isVercelPreviewUrl(url: string): boolean {
  return url.includes('.vercel.app') && (url.includes('-git-') || /-[a-f0-9]{8,}\.vercel\.app/i.test(url));
}

export function validateConfig() {
  if (config.deploymentUrl && isVercelPreviewUrl(config.deploymentUrl)) {
    throw new Error(
      'Invalid DEPLOYMENT_URL: use a production domain or an ngrok URL, not a preview deployment.'
    );
  }
}
```

Run this once during app startup from a server-only entry point.

# UX rules

- Gate generation, uploads, credits, and history behind authenticated routes.
- Use server redirects for protected pages; do not rely only on client-side guards.
- Make sign-in lightweight: magic link is a good default for consumer AI tools.
- After successful auth, redirect users back to the page they intended to visit when possible.
- Show clear auth states: sending link, signed in, signed out, session expired.
- If credits or purchases exist, always associate them with the authenticated Supabase user ID.
- For webhook-driven generation flows, ensure user records can be resolved from a stable authenticated identity.

# Avoid

- Do not keep template-specific navbar, footer, theme provider, announcement bar, or branded metadata as part of the auth dossier.
- Do not use `SUPABASE_SERVICE_ROLE_KEY` in client code.
- Do not protect sensitive pages only in React client components.
- Do not use Vercel preview URLs as `DEPLOYMENT_URL` if external services post webhooks there.
- Do not assume `NEXT_PUBLIC_*` values are trustworthy for authorization decisions.
- Do not skip the auth callback route when using magic links or OAuth.

# Verification

- Confirm unauthenticated access to a protected route redirects to `/login`.
- Confirm signing in via magic link creates a session and lands on `/auth/callback` successfully.
- Confirm subsequent navigation keeps the session alive via middleware.
- Confirm server components can read `supabase.auth.getSession()` or `getUser()`.
- Confirm sign-out clears the session and protected routes redirect again.
- Confirm Supabase redirect URLs exactly match the deployed origin.
- Confirm `DEPLOYMENT_URL` is a production domain or ngrok tunnel, not a preview deployment.
- If webhooks depend on authenticated user records, verify the callback/webhook flow can map incoming jobs back to the correct user.
