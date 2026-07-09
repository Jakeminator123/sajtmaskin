# When to use

- Use ONLY when the project EXPLICITLY chooses Supabase Auth (the user names Supabase for login/auth). A generic "login / inloggning / auth" ask is the `auth` capability (clerk-auth), not this dossier.
- Fit: Next.js App Router apps needing cookie-based sessions, SSR auth state, middleware session refresh, and server-side user checks.
- Appropriate for dashboards, member areas, app shells, and protected route groups.
- Supports email/password, magic link, and OAuth flows configured in Supabase.

# How to integrate

- Install `@supabase/ssr`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project API settings.
- Emit `components/middleware.ts` at the project ROOT as `middleware.ts`; it delegates to `updateSupabaseSession` for session refresh.
- Emit the Supabase helpers under `lib/supabase/` and import them as `@/lib/supabase/server`, `@/lib/supabase/client`, `@/lib/supabase/middleware`, `@/lib/supabase/config`.
- In Server Components, Route Handlers and Server Actions, call `createSupabaseServerClient()` then `supabase.auth.getUser()` for protected data.
- In client components, call `createSupabaseBrowserClient()` for sign-in, sign-up, OAuth start and sign-out actions.
- Register the emitted callback URL (`/api/auth/callback`) in Supabase OAuth settings and use the same path in `redirectTo`.
- Graceful degradation: before rendering auth UI or calling a factory, check `isSupabaseAuthConfigured()`. When it is `false`, render the shipped `<SupabaseAuthNotice />` (or an equivalent calm notice naming the two `NEXT_PUBLIC_SUPABASE_*` env vars) instead of calling the client — the factories throw `supabase-auth-not-configured` if called unconfigured, and the middleware already passes through so the site never crashes.

# Mock/demo mode

`mock: none` — login cannot be meaningfully mocked (a fake session would misrepresent what the site does). Without real keys the dossier degrades instead:

- The env guard treats a missing value OR a preview stub (`..._placeholder_preview_not_real`, `dummy`, `changeme`, `your_...`) as NOT configured — on ALL keys, so a seeded F2 stub never reaches `createServerClient`/`createBrowserClient` as a real URL/key.
- Middleware passes through (`NextResponse.next()`), the callback skips the code exchange, and `<SupabaseAuthNotice />` renders a discreet "Auth ej konfigurerat" banner next to the auth UI. Everything else on the site keeps working.
- Real sign-in activates only when both `NEXT_PUBLIC_SUPABASE_*` values are genuine (F3 / "Bygg integrationer").

# UX rules

- Gate private data on the server (`getUser()` in a Server Component / Route Handler), not only in client effects.
- Redirect signed-out users to a predictable login route.
- Show loading, disabled, and error states for auth form submissions.
- After OAuth, preserve the intended destination only via the validated, same-origin relative `next` path — the callback route already sanitizes it with `sanitizeNextPath`.
- Prefer server-rendered signed-in state where possible to avoid auth flicker.
- Keep user-facing copy in the site's language (Swedish sites: e.g. "Logga in", "Skapa konto", "Auth ej konfigurerat").

# Avoid

- Do not use this as the default generic auth dossier; it is Supabase-Auth-intent only.
- Do not include Stripe, pricing, navbar, toast, theme, or template layout files.
- Do not require GitHub-specific env vars unless the generated app explicitly adds GitHub OAuth.
- Do not rely on `getSession()` alone for protected SSR decisions; use `getUser()`.
- Do not store Supabase access tokens manually in localStorage when using SSR cookies.
- Do not allow absolute or cross-origin OAuth callback redirects from `next`; only same-origin relative paths that start with `/` are allowed (`sanitizeNextPath` falls back to `/`).
- Do not construct a Supabase client at module scope — always go through the lazy factories so a missing key degrades instead of crashing at import time.
- Do not revert the cookie adapter to the deprecated `get`/`set`/`remove` shape; use the modern `getAll`/`setAll` contract.

# Verification

- Start the app with both Supabase public env vars set.
- Confirm middleware runs without throwing on public pages.
- In a server page or route, call `supabase.auth.getUser()` and confirm signed-out state is handled.
- Complete a sign-in flow and confirm the user is available after redirect in server-rendered code.
- Refresh the page and confirm the session persists through cookies.
- Sign out and confirm protected routes redirect away from private content.
- For OAuth, confirm the callback exchanges the code and redirects only to safe same-origin paths (try `?next=https://evil.example` — it must fall back to `/`).
- Remove the Supabase env vars (or leave the preview stubs) and reload — the middleware passes through and `<SupabaseAuthNotice />` shows the "Auth ej konfigurerat" banner instead of a 500 (mock: none).
