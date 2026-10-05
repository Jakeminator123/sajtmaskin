# When to use

Use when the brief explicitly selects Supabase Auth.

# How to integrate

Keep middleware and callback bytes; use server `getUser()` for protected decisions.

# Mock/demo mode

`mock: visual` — the login SURFACE renders fully in demo mode, but no fake session is ever created (a fake session would misrepresent what the site does). Without real keys the dossier degrades:

- The env guard treats a missing value OR a preview stub (`..._placeholder_preview_not_real`, `dummy`, `changeme`, `your_...`) as NOT configured — on ALL keys, so a seeded F2 stub never reaches `createServerClient`/`createBrowserClient` as a real URL/key.
- Render the login/signup UI as usual; gate submission on `isSupabaseAuthConfigured()` — when `false`, submitting shows `<SupabaseAuthNotice />` (the honest "Auth ej konfigurerat" notice) instead of calling the client. Visitors SEE the auth flow; nobody gets a pretend session.
- Middleware passes through (`NextResponse.next()`), the callback skips the code exchange. Everything else on the site keeps working.
- Real sign-in activates only when both `NEXT_PUBLIC_SUPABASE_*` values are genuine (F3 / "Bygg integrationer").

# UX rules

- Gate private data on the server (`getUser()` in a Server Component / Route Handler), not only in client effects.
- Redirect signed-out users to a predictable login route.
- Show loading, disabled, and error states for auth form submissions.
- After OAuth, preserve the intended destination only via the validated, same-origin relative `next` path — the callback route already sanitizes it with `sanitizeNextPath`.
- Prefer server-rendered signed-in state where possible to avoid auth flicker.
- Keep user-facing copy in the site's language (Swedish sites: e.g. "Logga in", "Skapa konto", "Auth ej konfigurerat").

# Avoid

Do not use `getSession()` alone, expose service keys, or invent provider setup.

# Verification

- Start the app with both Supabase public env vars set.
- Confirm middleware runs without throwing on public pages.
- In a server page or route, call `supabase.auth.getUser()` and confirm signed-out state is handled.
- Complete a sign-in flow and confirm the user is available after redirect in server-rendered code.
- Refresh the page and confirm the session persists through cookies.
- Sign out and confirm protected routes redirect away from private content.
- For OAuth, confirm the callback exchanges the code and redirects only to safe same-origin paths (try `?next=https://evil.example` — it must fall back to `/`).
- Remove the Supabase env vars (or leave the preview stubs) and reload — the login UI still renders, submitting shows `<SupabaseAuthNotice />` ("Auth ej konfigurerat") instead of a 500, and no session is created (mock: visual).
