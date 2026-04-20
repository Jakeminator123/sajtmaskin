# When to use

Use this dossier when the site needs user authentication in a Next.js App Router app, with Google as the initial identity provider. It is a good fit for dashboards, member areas, account settings, and any app that needs a persistent signed-in session.

Use it with Plasmic only as the auth layer; Plasmic-specific targeting middleware and demo examples are not part of the auth integration.

# How to integrate

## 1) Install dependencies

```bash
npm install next-auth
```

If the app uses TypeScript, keep the config in a shared server file and export the helpers returned by `NextAuth()`.

## 2) Add environment variables

Configure Google OAuth in Google Cloud, then add:

```env
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

For production, also make sure the OAuth app has the correct callback URL:

```txt
https://your-domain.com/api/auth/callback/google
```

For local development:

```txt
http://localhost:3000/api/auth/callback/google
```

## 3) Create the Auth.js config

```ts
// components/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
});
```

Notes:
- Prefer `jwt` sessions unless the product explicitly needs a database-backed session store.
- Keep provider setup server-only.
- If the app needs roles, enrich the JWT/session in callbacks.

## 4) Wire the App Router auth route

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/components/auth";

export const { GET, POST } = handlers;
```

This route is mandatory. Without it, sign-in and callback handling will fail.

## 5) Build a sign-in page

```tsx
// app/signin/page.tsx
import { auth, signIn } from "@/components/auth";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <button type="submit">Continue with Google</button>
    </form>
  );
}
```

## 6) Protect routes

Use middleware for broad section protection:

```ts
// middleware.ts
export { auth as middleware } from "@/components/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*"],
};
```

Also protect sensitive pages at render time:

```tsx
import { auth } from "@/components/auth";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const session = await auth();

  if (!session) {
    redirect("/signin");
  }

  return <div>Private content</div>;
}
```

Use both patterns when possible:
- middleware for early blocking
- server checks for correctness and defense in depth

## 7) Read the session

### In server components

```ts
import { auth } from "@/components/auth";

const session = await auth();
```

### In client components

If a client component needs reactive session state, use `SessionProvider` and `useSession()` from `next-auth/react`. Only add this when needed; do not wrap the whole app unless there is a real client-side need.

```tsx
"use client";

import { SessionProvider, useSession } from "next-auth/react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

function UserBadge() {
  const { data: session, status } = useSession();
  if (status === "loading") return null;
  return <span>{session?.user?.email ?? "Guest"}</span>;
}
```

## 8) Sign out

Server action:

```tsx
import { signOut } from "@/components/auth";

<form
  action={async () => {
    "use server";
    await signOut({ redirectTo: "/" });
  }}
>
  <button type="submit">Sign out</button>
</form>
```

Or client-side:

```tsx
"use client";
import { signOut } from "next-auth/react";

<button onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
```

# UX rules

- Offer a single clear primary action like “Continue with Google”.
- Redirect authenticated users away from `/signin` to the app home or dashboard.
- After sign-in, send users to the page they intended to access or a sensible default like `/dashboard`.
- Show signed-in identity in the UI using name, email, or avatar.
- Keep protected pages inaccessible both in middleware and on the server.
- If auth gates a Plasmic-rendered page, gate access in Next.js before rendering the page shell.

# Avoid

- Do not keep Plasmic variation-targeting middleware as part of this auth dossier; it is unrelated.
- Do not expose provider secrets in client components.
- Do not rely only on client-side session checks for protected content.
- Do not assume `session.user.id` exists unless you add it in callbacks/types.
- Do not forget to register both local and production callback URLs in Google OAuth settings.
- Do not wrap the whole app in `SessionProvider` unless client-side session reactivity is actually needed.

# Verification

1. Start the app and visit `/signin`.
2. Click the Google sign-in button.
3. Complete OAuth consent and confirm redirect back to the app.
4. Verify `/api/auth/session` returns a valid session after sign-in.
5. Visit a protected route like `/dashboard` while signed in; confirm it renders.
6. Sign out and revisit `/dashboard`; confirm redirect to `/signin`.
7. Test production callback URLs before launch.

Quick checks:

```bash
curl http://localhost:3000/api/auth/session
```

Protected-page check:
- logged out => redirected away from protected route
- logged in => protected route renders with user identity
