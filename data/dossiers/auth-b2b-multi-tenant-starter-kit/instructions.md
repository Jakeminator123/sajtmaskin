# When to use

Use this dossier when a Next.js App Router project needs production auth with Stack Auth, especially for apps with protected dashboard routes and account/settings areas. It is a good fit for SaaS apps, internal tools, and multi-tenant B2B products where auth must be enforced in server components and middleware.

# How to integrate

## 1) Install Stack Auth

```bash
npm install @stackframe/stack
```

## 2) Define the shared Stack server app

Create `stack.ts` and export a single `StackServerApp` instance:

```ts
import 'server-only';
import { StackServerApp } from '@stackframe/stack';

export const stackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
  urls: {
    signIn: '/handler/sign-in',
    signUp: '/handler/sign-up',
    afterSignIn: '/dashboard',
    afterSignUp: '/dashboard',
    afterSignOut: '/',
  },
});
```

Keep this file server-only. Reuse this instance everywhere.

## 3) Wrap the App Router layout

In `app/layout.tsx`, wrap the tree with `StackProvider` and `StackTheme`:

```tsx
import type { ReactNode } from 'react';
import { StackProvider, StackTheme } from '@stackframe/stack';
import { stackServerApp } from '@/stack';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StackProvider app={stackServerApp}>
          <StackTheme>{children}</StackTheme>
        </StackProvider>
      </body>
    </html>
  );
}
```

This is the core integration pattern shown across the source examples.

## 4) Protect routes in middleware

Use middleware for broad route protection and redirect unauthenticated users before rendering:

```ts
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
```

Do not copy docs-site middleware from the source repo; it contains unrelated analytics and rewrite logic.

## 5) Re-check auth inside protected server pages

Middleware is not enough by itself. In protected pages/layouts, check the user again:

```tsx
import { redirect } from 'next/navigation';
import { stackServerApp } from '@/stack';

export default async function DashboardPage() {
  const user = await stackServerApp.getUser();

  if (!user) redirect('/handler/sign-in');

  return <div>Welcome {user.primaryEmail ?? user.id}</div>;
}
```

## 6) Add auth entry points in UI

Link sign-in/sign-up actions to Stack handler routes:

```tsx
import Link from 'next/link';

export function AuthActions() {
  return (
    <div>
      <Link href="/handler/sign-in">Sign in</Link>
      <Link href="/handler/sign-up">Create account</Link>
    </div>
  );
}
```

## 7) Multi-tenant usage

This dossier is for Stack Auth integration, not a complete org-switcher implementation. If the product is multi-tenant:

- model tenant context explicitly in your app
- require a selected org/account in protected dashboard routes
- authorize access per tenant on every server read/write
- never rely on client-side tenant state for authorization

# UX rules

- Public marketing pages should render without auth checks.
- Dashboard, account, billing, and settings routes should redirect unauthenticated users immediately.
- After sign-in, return users to the originally requested protected page when possible.
- Always provide clear sign-in and sign-up entry points in headers, nav, or call-to-action sections.
- In server-rendered dashboard views, derive the current user on the server; do not flash protected content while client auth initializes.
- If the app is multi-tenant, make org/account context visible in the UI and require explicit switching when relevant.

# Avoid

- Do not keep template/example layouts from docs, Convex, Supabase, or CommonJS demos.
- Do not copy middleware that includes analytics, docs redirects, or LLM markdown rewrites.
- Do not protect routes only in client components.
- Do not trust tenant IDs from the browser without server-side authorization checks.
- Do not create multiple inconsistent `StackServerApp` instances across the app.

# Verification

- `app/layout.tsx` wraps the tree with both `StackProvider` and `StackTheme`.
- There is one shared `stack.ts` exporting `stackServerApp`.
- Visiting `/dashboard` while signed out redirects to `/handler/sign-in`.
- Visiting `/dashboard` while signed in renders server-side user data.
- Sign-in and sign-up links point to Stack handler routes.
- Protected pages still check auth on the server even if middleware is present.
- No docs-only or example-only source files remain in the integrated app.
