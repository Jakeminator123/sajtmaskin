# When to use

Use this dossier when the app needs **Supabase Auth** in a **Next.js App Router** project with:

- server-rendered auth state
- cookie-based sessions
- middleware-driven session refresh
- email/password, magic link, or OAuth sign-in flows

This is the right fit for dashboards, app shells, member areas, and any site that must know the current user inside **Server Components**, **Route Handlers**, and protected pages.

# How to integrate

## 1) Install and configure env vars

Required runtime env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Optional provider-specific vars depend on which OAuth providers are enabled in Supabase. Do **not** hardcode GitHub-specific env requirements unless GitHub OAuth is actually being added to the project.

## 2) Keep middleware for cookie refresh

Supabase SSR auth relies on middleware to refresh expired sessions and write updated cookies.

```ts
// middleware.ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
```

Use the provided helper pattern:

```ts
// utils/supabase/middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export const createClient = (request: NextRequest) => {
  let response = NextResponse.next({
    request: { headers: request.headers }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        }
      }
    }
  );

  return { supabase, response };
};

export const updateSession = async (request: NextRequest) => {
  const { supabase, response } = createClient(request);
  await supabase.auth.getUser();
  return response;
};
```

## 3) Add server and browser clients

Server client for Server Components / Route Handlers:

```ts
// utils/supabase/server.ts
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        }
      }
    }
  );
}
```

Browser client for client components:

```ts
// utils/supabase/client.ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

## 4) Read the current user on the server

In protected pages or layouts, always check auth state on the server.

```ts
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export default async function ProtectedPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return <div>Signed in as {user.email}</div>;
}
```

## 5) Add OAuth callback route

For OAuth providers, add a callback handler:

```ts
// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, origin));
}
```

## 6) Start sign-in from a client component

Example OAuth button:

```tsx
'use client';

import { createClient } from '@/utils/supabase/client';

export function SignInWithGitHubButton() {
  const handleSignIn = async () => {
    const supabase = createClient();

    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
  };

  return <button onClick={handleSignIn}>Continue with GitHub</button>;
}
```

Example email/password sign-in:

```ts
const supabase = createClient();
await supabase.auth.signInWithPassword({
  email,
  password
});
```

Example sign-out:

```ts
const supabase = createClient();
await supabase.auth.signOut();
```

# UX rules

- Gate private pages on the **server**, not only in client effects.
- Redirect unauthenticated users predictably, usually to `/login`.
- Keep auth actions explicit: loading state, disabled submit button, clear error message.
- After OAuth, redirect users back to the intended destination using a safe `next` param.
- Use middleware for session refresh, but use server checks for authorization decisions.
- Show signed-in state from server data where possible to avoid flicker.

# Avoid

- Do not keep unrelated Stripe billing files in an auth dossier.
- Do not depend on `supabase.auth.getSession()` alone for protected SSR decisions; use `getUser()` for authoritative user checks.
- Do not store access tokens manually in localStorage when using Supabase SSR cookies.
- Do not make auth protection client-only if the page contains private data.
- Do not require GitHub-specific env vars unless GitHub OAuth is intentionally configured.
- Do not import template-specific UI, navbar, footer, toasts, or theme helpers as part of the integration.

# Verification

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Start the app and confirm middleware runs without throwing.
3. From a server page, call `supabase.auth.getUser()` and confirm it returns `null` when signed out.
4. Complete a sign-in flow and confirm the user is available in a Server Component after redirect.
5. Refresh the page and confirm the session persists.
6. Sign out and confirm protected routes redirect back to `/login`.
7. If using OAuth, confirm `/auth/callback` exchanges the code and redirects successfully.
