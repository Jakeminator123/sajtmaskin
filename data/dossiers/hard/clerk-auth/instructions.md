# When to use

Use for real accounts and protected app routes.

# How to integrate

Keep middleware security verbatim; edit `protectedRoutes` and mount the provider shell and buttons.

# UX rules

- Render `<SignInButton mode="modal">` for the primary CTA — modal mode keeps the user on-page and converts better than redirecting to `/sign-in`. Use redirect mode only when you need a deep-linked sign-in URL.
- Show `<UserButton afterSignOutUrl="/" />` (avatar + dropdown) in the top-right when signed in. It handles account management, switch-org, and sign-out without you writing menu code.
- Always pair `<SignedIn>` and `<SignedOut>` so the header does not flash the wrong state on first paint.
- For protected pages, gate in a Server Component with `auth()` + `redirectToSignIn()` (as above) or `await auth.protect()` — never in a `useEffect`. Client-side redirects flash the gated content for ~1 frame and leak it to scrapers.
- Localize Clerk's UI when the brief is Swedish: pass `localization={svSE}` to `<ClerkProvider>` (`import { svSE } from "@clerk/localizations"` — adds a small bundle). The shell already exposes a `localization` prop for this.

# Avoid

Never expose the secret or client-gate protected data; retain `auth.protect()`.

# Verification

- Visit the sign-in action — Clerk's hosted modal renders.
- Sign up with a throwaway email → land back on `/` with the avatar visible in the header.
- Reload the page — still signed in (session cookie survives).
- Visit a protected route (e.g. `/dashboard`) signed-out → redirected into Clerk's configured sign-in flow.
- Remove `CLERK_SECRET_KEY` from `.env.local` and restart `next dev` — the page renders the discreet "Inloggning i demoläge"-banner instead of a blank screen / 500, and the header buttons open the demo dialog on click.
- With placeholder keys (`pk_test_placeholder` / `sk_test_placeholder_preview`) every route still renders (middleware passes through, demo banner shows) — no "Publishable key not valid" 500, and clicking "Logga in"/"Skapa konto" opens the demo dialog (no fake session).
- Open the Network tab and confirm no request includes a `sk_…` token (the secret key must never reach the client).
