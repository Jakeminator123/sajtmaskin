# Phase 1: Critical Security Fixes

**Priority:** MUST complete before production deployment
**Estimated time:** 2-4 hours total
**Dependencies:** None — all items are independent and can be done in any order
**Branch:** Continue on `tva22`

---

## Overview

These 6 fixes address real, exploitable vulnerabilities. An attacker reading
your source code or probing your API could exploit any of these today.

---

## Task M1: Remove dev fallback JWT secret

**Files to change:**
- `src/proxy.ts` (~line with `|| "dev-secret-change-in-production"`)
- `src/lib/config.ts` (same fallback pattern)

**What to do:**
1. In `src/proxy.ts`, change:
   ```ts
   const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-in-production";
   ```
   to:
   ```ts
   const jwtSecret = process.env.JWT_SECRET;
   if (!jwtSecret && process.env.NODE_ENV === "production") {
     throw new Error("JWT_SECRET is required in production");
   }
   ```
   For non-production, keep a fallback only in dev for convenience.

2. In `src/lib/config.ts`, apply the same pattern to the `jwtSecret` getter.
   The existing `validateRequiredSecrets()` already checks for this — verify
   it's actually called at startup.

3. Verify in Vercel dashboard that `JWT_SECRET` is set for production.

**Acceptance criteria:**
- [ ] App refuses to start in production without `JWT_SECRET`
- [ ] App still works in development with a dev fallback
- [ ] No hardcoded secret strings remain in source code

---

## Task M2: Add SSRF protection to webscraper

**Files to change:**
- `src/lib/webscraper.ts`

**What to do:**
1. Import `safeFetch` from `src/lib/ssrf-guard.ts`.
2. Replace `fetchWithTimeout` calls in `quickScrapeWebsite` and `scrapeWebsite`
   with `safeFetch` (which already has timeout support).
3. If `fetchAndParse` (Cheerio parsing) also fetches URLs, route those through
   `safeFetch` as well.
4. Remove the local `fetchWithTimeout` function if it's no longer needed,
   or keep it as a wrapper around `safeFetch`.

**Routes affected:**
- `/api/analyze-website`
- `/api/wizard/quick-scrape`
- `/api/wizard/enrich`
- `/api/audit`

**Acceptance criteria:**
- [ ] All webscraper HTTP requests go through SSRF validation
- [ ] Attempting to scrape `http://169.254.169.254/` returns an error
- [ ] Attempting to scrape `http://localhost:3000/` returns an error
- [ ] Normal URL scraping still works (test with a real public URL)

---

## Task M3: Enable DB TLS certificate verification

**Files to change:**
- `src/lib/db/client.ts`

**What to do:**
1. Change `ssl: { rejectUnauthorized: false }` to:
   ```ts
   ssl: {
     rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
   }
   ```
   This defaults to `true` (secure) but allows override via env var for
   local development with self-signed certs.

2. Test that the Supabase connection still works. Supabase uses valid
   certificates, so `rejectUnauthorized: true` should work without issues.

3. If the connection fails with `true`, the Supabase cert chain may need
   a CA certificate — check Supabase docs for "SSL mode".

**Acceptance criteria:**
- [ ] `rejectUnauthorized` defaults to `true`
- [ ] App connects to Supabase successfully in production
- [ ] Override via `DB_SSL_REJECT_UNAUTHORIZED=false` works for local dev if needed

---

## Task M4: Protect backoffice GET endpoints

**Files to change:**
- `src/lib/backoffice/template-generator.ts` (the code generator)

**What to do:**
1. Find the generated `content/route.ts` GET handler template.
2. Add session cookie verification (same as the PUT handler uses).
3. Find the generated `colors/route.ts` GET handler template.
4. Add session cookie verification there too.
5. If there's a "public read" use case (e.g., the live site reading its own
   content), create a separate public endpoint with limited fields, or use
   a different auth model (API key per site).

**Acceptance criteria:**
- [ ] GET `/api/backoffice/content` without session cookie returns 401
- [ ] GET `/api/backoffice/colors` without session cookie returns 401
- [ ] With valid session cookie, data loads correctly
- [ ] The live published site can still read its own content (if applicable)

---

## Task M5: Fix rate limit identity spoofing

**Files to change:**
- `src/lib/rateLimit.ts` (the `getClientId` function)

**What to do:**
1. Locate `getClientId()` in `rateLimit.ts`.
2. Remove trust of `x-user-id` from raw headers. Instead:
   - If the request has a verified auth session, use the authenticated user ID.
   - Otherwise, fall back to IP address.
3. For IP extraction, prefer `request.ip` (Vercel provides this) over
   `x-forwarded-for` (which can be spoofed in some setups).
4. The `withRateLimit` function should accept an optional `userId` parameter
   that callers pass after they've verified auth:
   ```ts
   export function withRateLimit(
     req: Request,
     key: string,
     options?: { userId?: string }
   )
   ```

**Acceptance criteria:**
- [ ] Rate limiting works by IP for unauthenticated requests
- [ ] Rate limiting works by user ID for authenticated requests (when passed)
- [ ] Sending fake `x-user-id` header doesn't bypass rate limits
- [ ] Rate limit headers (Retry-After, X-RateLimit-*) still work

---

## Task M6: Add auth to unprotected domain and download routes

**Files to change:**
- `src/app/api/domains/save/route.ts`
- `src/app/api/domains/link/route.ts`
- `src/app/api/domains/verify/route.ts`
- `src/app/api/domains/check/route.ts`
- `src/app/api/download/route.ts`

**What to do:**
1. For each route, add `getCurrentUser` or session verification at the top.
2. For domain routes: verify the user owns the project being referenced.
3. For the download route: verify the user owns the project/chat being downloaded.
4. Add rate limiting to domain routes (`domains:check`, `domains:save`, etc.).
5. For `domains/check` specifically, this might be acceptable without user auth
   but should at least have rate limiting (it calls external APIs).

**Acceptance criteria:**
- [ ] `POST /api/domains/save` without auth returns 401
- [ ] `POST /api/domains/link` without auth returns 401
- [ ] `GET /api/download` without auth (or without owning the project) returns 401/403
- [ ] `GET /api/domains/check` has rate limiting
- [ ] All domain routes have rate limiting

---

## Post-completion checklist

After all M1-M6 are done:
- [ ] Run `npm run lint` — no new errors
- [ ] Run `npm run test:ci` — all tests pass
- [ ] Run `npm run build` — build succeeds
- [ ] Manual smoke test: login, create project, generate site, download
- [ ] Update `bygglan_2/99-HANDOFF-LOG.md` with completion status
