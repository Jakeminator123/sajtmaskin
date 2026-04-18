# When to use

Use this dossier when the site needs **NextAuth.js-based login** with:

- protected app areas such as `/dashboard` or `/editor`
- redirecting signed-in users away from `/login` and `/register`
- server-side authorization inside App Router route handlers
- a simple OAuth setup, typically GitHub first

This is a good fit for **app-shell**, **dashboard**, and **auth-pages** scaffolds.

# How to integrate

## 1) Install and configure NextAuth.js

This dossier assumes Next.js App Router and `next-auth`.

Required env vars for the auth core:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-long-random-string
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Avoid copying unrelated template env vars unless the build also needs them. For auth alone, `GITHUB_ACCESS_TOKEN`, Stripe, Postmark, and content env vars are not required.

Create a shared auth config:

```ts
// lib/auth.ts
import type { NextAuthOptions } from "next-auth"
import GitHubProvider from "next-auth/providers/github"

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        ;(session.user as { id?: string }).id = token.sub
      }
      return session
    },
  },
}
```

Create the auth route handler:

```ts
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
```

## 2) Protect routes with middleware

Use middleware to guard private areas and handle auth-page redirects.

```ts
// middleware.ts
import { getToken } from "next-auth/jwt"
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  async function middleware(req) {
    const token = await getToken({ req })
    const isAuth = !!token
    const isAuthPage =
      req.nextUrl.pathname.startsWith("/login") ||
      req.nextUrl.pathname.startsWith("/register")

    if (isAuthPage) {
      if (isAuth) {
        return NextResponse.redirect(new URL("/dashboard", req.url))
      }
      return null
    }

    if (!isAuth) {
      let from = req.nextUrl.pathname
      if (req.nextUrl.search) from += req.nextUrl.search

      return NextResponse.redirect(
        new URL(`/login?from=${encodeURIComponent(from)}`, req.url)
      )
    }
  },
  {
    callbacks: {
      async authorized() {
        return true
      },
    },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/editor/:path*", "/login", "/register"],
}
```

Important pattern: the `authorized()` callback returns `true` so the custom redirect logic always runs.

## 3) Enforce auth in route handlers

Middleware is not enough by itself. Every sensitive API route should verify the session server-side.

```ts
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return new Response("Unauthorized", { status: 403 })
  }

  return Response.json({ userId: session.user.id })
}
```

## 4) Enforce per-resource authorization

When a route edits or deletes a resource, verify ownership using the current session user.

```ts
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

async function verifyCurrentUserHasAccessToPost(postId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return false

  const count = await db.post.count({
    where: {
      id: postId,
      authorId: session.user.id,
    },
  })

  return count > 0
}
```

Then reject unauthorized access:

```ts
if (!(await verifyCurrentUserHasAccessToPost(params.postId))) {
  return new Response(null, { status: 403 })
}
```

## 5) Keep login UX compatible with middleware

If middleware sends users to `/login?from=...`, the login page should preserve and use that return target after successful sign-in.

Typical client-side sign-in pattern:

```tsx
"use client"

import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"

export function LoginButton() {
  const searchParams = useSearchParams()
  const from = searchParams.get("from") || "/dashboard"

  return (
    <button onClick={() => signIn("github", { callbackUrl: from })}>
      Continue with GitHub
    </button>
  )
}
```

# UX rules

- Protect private screens in **two places**: middleware for navigation flow, server checks for real security.
- Redirect authenticated users away from `/login` and `/register`.
- Preserve intended destination with a `from` query param when redirecting to login.
- Return **403** for unauthenticated or unauthorized API access unless the app has a stronger reason to use 401.
- For mutations, verify both:
  - user is signed in
  - user owns or may access the target resource
- Keep auth provider list small unless product requirements say otherwise.

# Avoid

- Do not keep template-only files like OG generators, analytics wrappers, fonts, theme shells, or branded metadata in an auth dossier.
- Do not rely on middleware alone to protect data.
- Do not expose private API data based only on client state.
- Do not copy unrelated env vars from the source template into a fresh auth-only build.
- Do not assume `session.user.id` exists unless you add it in the session callback.

# Verification

## Manual checks

1. Visit `/dashboard` while signed out.
   - Expect redirect to `/login?from=%2Fdashboard`

2. Visit `/login` while signed in.
   - Expect redirect to `/dashboard`

3. Call a protected API route while signed out.
   - Expect `403`

4. Call a protected API route while signed in.
   - Expect success only for the current user's records

5. Attempt to update or delete another user's resource.
   - Expect `403`

## Minimal server-side check

```ts
const session = await getServerSession(authOptions)
if (!session) {
  return new Response("Unauthorized", { status: 403 })
}
```

## Minimal ownership check

```ts
const count = await db.post.count({
  where: {
    id: postId,
    authorId: session.user.id,
  },
})

if (count === 0) {
  return new Response(null, { status: 403 })
}
```
