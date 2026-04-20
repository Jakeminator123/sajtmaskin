# When to use

Use this dossier when the project needs **email/password authentication owned by the app** rather than OAuth-only login or a hosted auth provider. It fits best for:

- dashboards and app-shell products
- internal tools with protected routes
- SaaS apps storing users in Postgres with Drizzle
- projects that want Next.js-native session handling via NextAuth/Auth.js

This dossier is **not** for Clerk, SuperTokens, magic links, social-only auth, or anonymous sessions.

# How to integrate

## 1) Add the core auth files

You need three integration points:

- `components/auth.ts` for the Auth.js configuration
- `components/app/api/auth/[...nextauth]/route.ts` for auth endpoints
- `components/middleware.ts` for route protection

Minimal shape:

```ts
// components/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Look up user in Postgres via Drizzle.
        // Verify hashed password with bcrypt/argon2.
        // Return a minimal user object if valid.
        return null;
      },
    }),
  ],
});
```

```ts
// components/app/api/auth/[...nextauth]/route.ts
import { handlers } from "../../../../auth";
export const { GET, POST } = handlers;
```

```ts
// components/middleware.ts
export { auth as middleware } from "./auth";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

## 2) Protect only the routes that should require login

Use the `authorized` callback in `NextAuth(...)` to define access rules. Typical pattern:

```ts
callbacks: {
  async authorized({ auth, request }) {
    const isLoggedIn = !!auth?.user;
    const pathname = request.nextUrl.pathname;

    const isProtectedRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/account");
    const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

    if (isProtectedRoute && !isLoggedIn) return false;

    if (isAuthPage && isLoggedIn) {
      return Response.redirect(new URL("/dashboard", request.nextUrl));
    }

    return true;
  },
}
```

Keep the policy explicit. Do not accidentally protect marketing pages unless the app truly requires full-site auth.

## 3) Query users with Drizzle in `authorize`

The credentials provider should:

1. normalize email
2. fetch user by email from Postgres using Drizzle
3. verify password hash
4. return a small user object

Example shape:

```ts
async authorize(credentials) {
  const email = credentials?.email?.toString().trim().toLowerCase();
  const password = credentials?.password?.toString();

  if (!email || !password) return null;

  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, email),
  });

  if (!user || !user.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
```

Use a strong password hash such as `bcrypt` or `argon2`. Never compare plaintext passwords.

## 4) Read the session on the server

For server components, layouts, and route handlers, use `auth()`:

```ts
import { auth } from "@/components/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <div>Protected dashboard</div>;
}
```

Middleware is useful for broad route gating; server checks are still important for sensitive pages and actions.

## 5) Implement login/logout actions

Server action example:

```ts
"use server";

import { signIn, signOut } from "@/components/auth";

export async function loginAction(formData: FormData) {
  await signIn("credentials", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: "/dashboard",
  });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
```

## 6) Expected environment and data model

The runtime app should define at least:

- database connection string for Postgres
- Auth.js secret

Typical env vars:

```env
POSTGRES_URL=postgres://...
AUTH_SECRET=replace-with-strong-random-secret
```

Typical user table fields:

- `id`
- `email` unique
- `passwordHash`
- `name` optional
- `createdAt`
- `updatedAt`

# UX rules

- Always provide dedicated `/login` and `/register` pages for credentials auth.
- Show a clear invalid-credentials error without revealing whether the email exists.
- Redirect authenticated users away from auth pages.
- Redirect unauthenticated users to login before protected app areas.
- Keep public marketing pages accessible unless the product is intentionally private.
- Require password confirmation and minimum strength on registration.
- Support logout from authenticated navigation areas.

# Avoid

- Do not include Clerk, SuperTokens, or other provider-specific middleware in this integration.
- Do not protect every route by default without checking whether the site has public pages.
- Do not store plaintext passwords.
- Do not expose full user records in the session token.
- Do not rely on middleware alone for authorization of sensitive server actions or data reads.
- Do not import template-only helpers, branding, or demo UI from the original starter.

# Verification

Check these before considering the integration complete:

1. Visiting `/dashboard` while signed out redirects or blocks access.
2. Visiting `/login` while signed in redirects to the app area.
3. `/api/auth/session` returns a valid session after login.
4. Invalid password attempts fail without leaking which field was wrong.
5. Passwords are verified against a hash in Postgres, not plaintext.
6. Server-rendered protected pages also check `auth()`.
7. Marketing/public routes still work without authentication.
8. Logout clears the session and removes access to protected routes.
