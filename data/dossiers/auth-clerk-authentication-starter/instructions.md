# When to use

- User mentions auth, login, signup, "användarkonton", "inloggning", "registrera konto"
- User wants users to log in with email + password OR social providers (Google, GitHub, etc.)
- User says "use Clerk" — or no auth provider chosen yet (Clerk is a strong default for SaaS/dashboards)
- User needs organizations / teams / multi-tenancy out of the box

# How to integrate

1. **Install Clerk:**
   ```bash
   npm install @clerk/nextjs
   ```

2. **Wrap root layout in `<ClerkProvider>`** — copy `components/app/layout.tsx` into `app/layout.tsx`. The whole app must be inside the provider so `useUser`, `useSession`, `auth()` etc. work.

3. **Add middleware** — copy `components/middleware.ts` into the project root. Adjust the `isProtectedRoute` matcher to match the user's actual protected paths (default: `/dashboard`, `/account`, `/api/protected`).

4. **Add env vars** — copy `.env.example` into the user's `.env.local`:
   - `CLERK_SECRET_KEY` (server-only, never expose)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (client, safe)
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (default `/sign-in`)
   - `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` (where to land after login, e.g. `/dashboard`)
   - `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` (where to land after signup)
   - User must create a free account at https://clerk.com and copy keys from dashboard.clerk.com

5. **Add sign-in / sign-up pages** — Clerk provides drop-in components:
   ```tsx
   // app/sign-in/[[...sign-in]]/page.tsx
   import { SignIn } from "@clerk/nextjs";
   export default function Page() {
     return <SignIn />;
   }
   ```
   Same pattern for `app/sign-up/[[...sign-up]]/page.tsx` with `<SignUp />`.

6. **Show user state in header** — use `<UserButton />` for logged-in users + `<SignInButton />` for logged-out:
   ```tsx
   "use client";
   import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

   <SignedOut>
     <SignInButton />
   </SignedOut>
   <SignedIn>
     <UserButton />
   </SignedIn>
   ```

7. **Protected API routes** — see `components/app/api/protected/route.ts`. Use `auth.protect()` server-side to require auth before returning data.

# UX rules

- **Redirect after login should land on a useful page** — default `/dashboard` works for SaaS, but a portfolio site might prefer `/` or `/profile`.
- **Show loading state during auth check** — use `<ClerkLoading>` and `<ClerkLoaded>` components in layout to avoid flash-of-unauthenticated-content.
- **Sign-in page should match brand** — adjust `appearance.variables.colorPrimary` in layout.tsx to match the user's primary color.
- **Mobile**: Clerk's components are responsive by default. Don't wrap in narrow containers.
- **Error feedback**: Clerk handles its own error UI. Don't try to override unless necessary.

# Avoid

- **Don't roll your own session** — Clerk handles cookies + JWT + refresh. Custom session logic breaks middleware protection.
- **Don't expose `CLERK_SECRET_KEY` to the client** — only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is safe in browser code.
- **Don't put `<ClerkProvider>` inside a route group** — it must wrap the entire `<html>` in root layout, otherwise hooks fail.
- **Don't combine with NextAuth.js or Auth0** — pick one auth provider per app to avoid session conflicts.
- **Don't use `auth()` from a Client Component** — `auth()` is server-only. Use `useUser()` / `useSession()` on client side.

# Verification

- [ ] Click "Sign up" in preview → completes Clerk-hosted flow → returns to `/dashboard`
- [ ] After login: `<UserButton />` shows user's avatar + sign-out option
- [ ] Visiting `/dashboard` while logged out → redirected to sign-in (middleware works)
- [ ] `GET /api/protected` returns 401 if not logged in, 200 with `{message, timestamp}` if logged in
- [ ] Sign out → redirected to `/`, protected routes again locked

---

**Source template:** https://vercel.com/templates/next.js/clerk-authentication-starter
**Repo:** https://github.com/clerk/nextjs-auth-starter-template
**Demo:** https://nextjs-auth-starter-template-kit.vercel.app
**Clerk docs:** https://clerk.com/docs/quickstarts/nextjs
