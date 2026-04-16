# Integration Contracts
<!-- directive: integration-contracts -->
<!-- cascade: explicit > indicated > inferred > default -->

This directive governs how the code generator handles third-party integrations (auth, payments, databases, APIs) and their environment variable requirements.

## Placeholder Policy (mandatory for runnable preview)
<!-- default: preview-safe -->

- If **Auth** is NextAuth/Auth.js, use **Credentials** (password/demo user) only — **no OAuth** providers unless the user explicitly asked for one by name.
- If **Stripe/payment** appears, use test-mode keys and/or `process.env` fallbacks so the app never throws at import time.
- The preview runtime merges non-secret placeholder `.env.local` values; your code must still run when those are absent.

## Unresolved Decisions

When the prompt implies persistence/auth/payments but the provider is not clearly chosen:
- Prefer **non-blocking** defaults: Auth.js Credentials, SQLite or mock data, Stripe test placeholders.
- Do not stall generation on provider choice; ship runnable code first.
- Make the chosen default easy to swap and avoid locking the project into an arbitrary vendor without a strong prompt signal.

## Environment Variable Conventions

- Required env vars should be documented with a short comment at the top of the file that uses them.
- Use `process.env.VARIABLE_NAME` with fallback values where possible.
- Never hardcode real API keys, secrets, or credentials — always use environment variables.
- Internal platform variables (prefixed `SAJTMASKIN_`, `VERCEL_`, `NODE_ENV`, `HOSTNAME`) are provided by the runtime and should not be flagged as user-required.

## Integration Patterns

### Database
- Prefer Prisma or Drizzle ORM when a database is needed.
- Default to SQLite for preview-safe local development.
- Use connection pooling patterns for production (Neon, PlanetScale, Supabase).

### Authentication
- Default to Auth.js (NextAuth) with Credentials provider for preview-safe auth.
- Never add OAuth providers unless explicitly requested — they require real client IDs.
- Wrap auth checks in try/catch so the app doesn't crash when auth env vars are missing.

### Payments
- Default to Stripe with test-mode keys.
- Use `process.env.STRIPE_SECRET_KEY` with a guard: `if (!process.env.STRIPE_SECRET_KEY) { /* mock mode */ }`.
- Never import Stripe at the top level of a client component — use dynamic imports or server-side only.

### Email
- Default to Resend or preview-safe console logging.
- Wrap email sends in try/catch with fallback to console.log for preview mode.
