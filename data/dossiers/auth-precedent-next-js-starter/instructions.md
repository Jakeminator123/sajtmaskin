# When to use

Use this dossier when the site needs user authentication in a Next.js App Router app using Clerk.

Typical fit:
- sign in / sign up pages
- protected dashboard or app-shell routes
- user menu with account controls
- middleware-based auth handling for pages and API routes

Do not use this dossier if the project does not need accounts, or if another auth provider is already selected.

# How to integrate

## 1) Install and configure env vars

Required env vars:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

At minimum, the publishable and secret keys must be present. The fallback redirect URLs should point to a safe post-auth destination such as `/`, `/app`, or `/dashboard`.

## 2) Wrap the root layout with `ClerkProvider`

Use `ClerkProvider` at the top of the App Router tree.

```tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

Notes:
- Keep existing site layout, fonts, analytics, and branding if needed.
- The Clerk provider should wrap all routes that need auth components or auth state.
- Do not keep template-specific metadata, nav, footer, or background effects unless the generated site actually needs them.

## 3) Add Clerk middleware

Create `middleware.ts` at the app root if it does not already exist.

```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

This matcher is the standard Clerk pattern for App Router projects. It avoids static assets and still runs on app routes and API routes.

## 4) Add auth pages

Provide explicit sign-in and sign-up routes.

`app/sign-in/[[...sign-in]]/page.tsx`

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return <SignIn />;
}
```

`app/sign-up/[[...sign-up]]/page.tsx`

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return <SignUp />;
}
```

## 5) Protect app areas

For protected sections such as `/app` or `/dashboard`, guard the segment in a server layout.

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <>{children}</>;
}
```

This is the safest default in App Router because it protects all nested pages consistently.

## 6) Read auth state in server components

```tsx
import { auth, currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await currentUser();

  return <div>Hello {user?.firstName ?? "there"}</div>;
}
```

Use server-side auth reads when rendering protected pages, loading user-specific data, or enforcing access control.

## 7) Render account controls in client or shared UI

```tsx
import { SignedIn, SignedOut, UserButton, SignInButton, SignUpButton } from "@clerk/nextjs";

export function AuthControls() {
  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton />
        <SignUpButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
```

Use this pattern in navbars, headers, or account menus.

## 8) Protect API routes if needed

```ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, userId });
}
```

Do not trust client state for authorization. Re-check auth in server routes.

# UX rules

- Always give unauthenticated users a clear path to sign in or sign up.
- Protected pages should redirect to `/sign-in` rather than rendering broken or partial UI.
- Use `UserButton` for account access/logout unless the project needs a fully custom account menu.
- Keep auth UI visually consistent with the site, but avoid over-customizing Clerk flows unless necessary.
- Choose one post-auth destination and use it consistently, typically `/app` or `/dashboard` for products and `/` for simple sites.
- If the site is mostly marketing pages plus an app area, keep public routes public and protect only the app segment.

# Avoid

- Do not keep template-branded metadata such as "Precedent" titles, descriptions, or deployment constants.
- Do not rely on middleware alone for authorization of sensitive data; verify auth again in server components and route handlers.
- Do not add generic utility files to the dossier unless auth depends on them.
- Do not gate the entire site behind auth unless the product explicitly requires it.
- Do not use client-only auth checks as the sole protection for private pages.
- Do not forget to create explicit sign-in/sign-up routes if links or redirects point to them.

# Verification

Check the integration with this checklist:

1. Env vars are set and the app starts without Clerk configuration errors.
2. Visiting a public page works normally.
3. Visiting a protected route while signed out redirects to `/sign-in`.
4. Sign up succeeds and redirects to the configured fallback destination.
5. Sign in succeeds and redirects to the configured fallback destination.
6. Signed-in UI shows `UserButton` or equivalent account controls.
7. A protected API route returns `401` when signed out and succeeds when signed in.
8. No template-specific branding or demo deployment constants remain in the auth integration.

Minimal smoke test for a protected page:

```tsx
import { auth } from "@clerk/nextjs/server";

export default async function Page() {
  const { userId } = await auth();
  return <pre>{JSON.stringify({ userId }, null, 2)}</pre>;
}
```

If `userId` is present when signed in and absent when signed out, the core integration is working.
