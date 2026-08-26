# When to use

Use this dossier when the brief declares the `auth` capability — the site needs real user accounts (login, signup, password reset, gated content). Clerk is the CAPABILITY DEFAULT; the `supabase-auth` sibling wins only on an explicit Supabase ask. Triggers (Swedish + English): `auth`, `login`, `sign in`, `sign up`, `register`, `account`, `inloggning`, `registrering`, `logga in`, `konto`, `medlem`, `medlemssida`, `gated`, `protected route`, `dashboard requires login`.

Best fit:

- A SaaS landing page with a "Sign in" / "Get started" CTA that opens Clerk's hosted modal.
- A protected `/dashboard` (or `/app`) area that requires an authenticated user.
- A community / membership site where the public landing is open but `/medlem` is gated.

Do not use for:

- A pure marketing site with no logged-in surface (do not mount `<ClerkProvider>` "just in case" — it adds ~50KB to the client bundle).
- Custom OAuth flows where you control the IdP yourself (use `next-auth` / Auth.js with the `credentials` provider instead).
- B2B SSO with self-served SAML config (Clerk supports it but the setup is multi-step and beyond a generic dossier).

# How to integrate

The dossier ships three files. Drop each one in unchanged unless explicitly overridden:

1. **`components/middleware.ts` → `middleware.ts` at the project root** (verbatim). This dossier intentionally keeps the backward-compatible Next.js middleware convention; Next.js 16 still runs it on the Edge runtime, while a future `proxy.ts` migration must also remove/merge old generated middleware instead of creating both files. Keep it at the project root, not under `app/`. The `matcher` syntax is load-bearing — paraphrasing the regex breaks session resolution on dynamic routes. The file key-gates itself: with missing or placeholder keys (e.g. `pk_test_placeholder`) it returns `NextResponse.next()` instead of invoking Clerk, so an unconfigured preview never 500s.
2. **`components/clerk-provider-shell.tsx` → `components/clerk-provider-shell.tsx`** (verbatim). Wrap the entire `<body>…</body>` of `app/layout.tsx` in `<ClerkProviderShell>`. The shell adds an unconfigured-state fallback so the app does not crash when keys are missing in development.
3. **`components/auth-buttons.tsx` → `components/auth-buttons.tsx`** (verbatim). Use `<AuthButtons />` in the site header / nav; adapt labels via the `signInLabel`/`signUpLabel` props or wrap it in your own component. The file is verbatim because its key-gate is load-bearing (mock: visual): with missing/placeholder keys the same buttons render but open an honest "Inloggning i demoläge"-dialog instead of mounting Clerk components without a provider (which would crash), and no fake session is ever created.

Minimal `app/layout.tsx`:

```tsx
import { ClerkProviderShell } from "@/components/clerk-provider-shell";
import { AuthButtons } from "@/components/auth-buttons";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <ClerkProviderShell>
          <header className="flex items-center justify-between border-b px-4 py-3">
            <a href="/" className="font-semibold">Min sajt</a>
            <AuthButtons />
          </header>
          {children}
        </ClerkProviderShell>
      </body>
    </html>
  );
}
```

To gate a route (e.g. `/dashboard`), redirect unauthenticated users from the server component:

```tsx
import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { isAuthenticated, redirectToSignIn, userId } = await auth();
  if (!isAuthenticated) return redirectToSignIn();
  return <main className="p-6">Welcome, {userId}.</main>;
}
```

# UX rules

- Render `<SignInButton mode="modal">` for the primary CTA — modal mode keeps the user on-page and converts better than redirecting to `/sign-in`. Use redirect mode only when you need a deep-linked sign-in URL.
- Show `<UserButton afterSignOutUrl="/" />` (avatar + dropdown) in the top-right when signed in. It handles account management, switch-org, and sign-out without you writing menu code.
- Always pair `<SignedIn>` and `<SignedOut>` so the header does not flash the wrong state on first paint.
- For protected pages, gate in a Server Component with `auth()` + `redirectToSignIn()` (as above) or `await auth.protect()` — never in a `useEffect`. Client-side redirects flash the gated content for ~1 frame and leak it to scrapers.
- Localize Clerk's UI when the brief is Swedish: pass `localization={svSE}` to `<ClerkProvider>` (`import { svSE } from "@clerk/localizations"` — adds a small bundle). The shell already exposes a `localization` prop for this.

# Avoid

- Do not put `CLERK_SECRET_KEY` in a `NEXT_PUBLIC_*` variable. The secret key grants full backend access to your Clerk instance — exposing it in the client bundle is a critical leak.
- Do not move the dossier's backward-compatible `middleware.ts` inside `app/`, and do not add a parallel `proxy.ts` without migrating the existing network-boundary logic. The shipped file belongs at the project root.
- Do not call `auth()` inside a Client Component — it only works in Server Components, Route Handlers, and middleware. From the client, use the `useUser()` / `useAuth()` hooks instead.
- Do not wrap `<ClerkProvider>` around individual pages. Mount it once in the root layout; mounting per-page resets the session on every navigation.
- Do not invent your own "remember me" or "session refresh" logic. Clerk handles token refresh transparently via the middleware.

# Verification

- Visit the sign-in action — Clerk's hosted modal renders.
- Sign up with a throwaway email → land back on `/` with the avatar visible in the header.
- Reload the page — still signed in (session cookie survives).
- Visit a protected route (e.g. `/dashboard`) signed-out → redirected into Clerk's configured sign-in flow.
- Remove `CLERK_SECRET_KEY` from `.env.local` and restart `next dev` — the page renders the discreet "Inloggning i demoläge"-banner instead of a blank screen / 500, and the header buttons open the demo dialog on click.
- With placeholder keys (`pk_test_placeholder` / `sk_test_placeholder_preview`) every route still renders (middleware passes through, demo banner shows) — no "Publishable key not valid" 500, and clicking "Logga in"/"Skapa konto" opens the demo dialog (no fake session).
- Open the Network tab and confirm no request includes a `sk_…` token (the secret key must never reach the client).
