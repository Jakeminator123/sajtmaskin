# Phase 2: Security Hardening

**Priority:** Complete within 1-2 weeks after production launch
**Estimated time:** 4-6 hours total
**Dependencies:** Phase 1 must be completed first
**Branch:** Continue on `tva22` or create a new branch from it

---

## Overview

These fixes address real weaknesses that aren't immediately exploitable but
create risk as the app gets more users and traffic. They also make the
security posture more consistent and production-grade.

---

## Task S1: Harden SSRF redirect chain validation

**Files to change:**
- `src/lib/ssrf-guard.ts`

**What to do:**
1. Modify `safeFetch` to handle ALL redirect hops manually:
   ```ts
   // Pseudocode:
   for (let hop = 0; hop <= maxRedirects; hop++) {
     validateSsrfTarget(url);  // check each hop
     const res = await fetch(url, { redirect: "manual", ... });
     if (!isRedirect(res)) return res;
     url = new URL(res.headers.get("location"), url);
   }
   ```
2. Set `maxRedirects = 5` (configurable).
3. Keep the existing total timeout (AbortController) wrapping the entire loop.
4. Add a test: redirect chain where hop 2 points to `localhost` — should fail.

**Acceptance criteria:**
- [ ] Every redirect hop is validated against SSRF rules
- [ ] More than 5 redirects returns an error
- [ ] Redirect to private IP at any hop is blocked
- [ ] Total timeout applies across all hops

---

## Task S2: Require Redis/Upstash for rate limiting in production

**Files to change:**
- `src/lib/rateLimit.ts`
- `src/lib/env.ts` (add vars to schema)

**What to do:**
1. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `env.ts` schema.
2. In `rateLimit.ts`, add a startup warning (or error in prod) if Redis is not configured:
   ```ts
   if (process.env.NODE_ENV === "production" && !process.env.UPSTASH_REDIS_REST_URL) {
     console.error("WARNING: Rate limiting is using in-memory fallback in production. " +
       "This is unreliable in serverless. Set UPSTASH_REDIS_REST_URL.");
   }
   ```
3. Cache the Upstash/Redis client at module level instead of creating per-request:
   ```ts
   let _cachedRedis: Redis | null = null;
   function getRedisClient(): Redis {
     if (!_cachedRedis) {
       _cachedRedis = new Redis({ url: ..., token: ... });
     }
     return _cachedRedis;
   }
   ```

**Cost note:**
- Sign up at https://upstash.com (free tier: 10K commands/day)
- Or use Vercel KV (same Upstash backend, tighter Vercel integration)
- Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel env vars

**Acceptance criteria:**
- [ ] Redis client is cached and reused
- [ ] Warning logged in production if Redis is not configured
- [ ] Rate limiting works with Upstash in production
- [ ] In-memory fallback still works in development

---

## Task S3: Add ownership checks to company profiles

**Files to change:**
- `src/lib/db/services/company-profiles.ts`
- `src/app/api/company-profile/route.ts` (if it exists)

**What to do:**
1. In `saveCompanyProfile`: require `userId` parameter, verify the caller
   owns the referenced `project_id` before saving.
2. In `searchCompanyProfiles` and `getAllCompanyProfiles`: either restrict
   to admin-only, or filter by the caller's projects.
3. In `linkCompanyProfileToProject`: verify project ownership in the service
   layer (not just the route), so future callers are also protected.

**Acceptance criteria:**
- [ ] Cannot save a company profile for a project you don't own
- [ ] Cannot list/search company profiles across other users (unless admin)
- [ ] Existing legitimate usage still works

---

## Task S4: Add CSP reporting endpoint

**Files to change:**
- `src/proxy.ts` (CSP header)
- Optionally: new route `src/app/api/csp-report/route.ts`

**What to do:**
1. Add `report-uri /api/csp-report` (or `report-to` directive) to the CSP header.
2. Create a simple endpoint that receives CSP violation reports and logs them:
   ```ts
   export async function POST(req: Request) {
     const report = await req.json();
     console.warn("[CSP Violation]", JSON.stringify(report));
     return new Response(null, { status: 204 });
   }
   ```
3. Run CSP in `Report-Only` mode in staging/preview.
4. After verifying no legitimate violations, switch to enforce in production.

**Acceptance criteria:**
- [ ] CSP violations are logged
- [ ] No legitimate scripts/styles are blocked
- [ ] Staging uses Report-Only, production uses enforce

---

## Task S5: Add `Vary: Origin` to CORS responses

**Files to change:**
- `src/proxy.ts`

**What to do:**
1. Wherever `Access-Control-Allow-Origin` is set dynamically, also set
   `Vary: Origin`:
   ```ts
   response.headers.set("Vary", "Origin");
   ```
2. This is a one-liner. If the `Vary` header already exists, append to it.

**Acceptance criteria:**
- [ ] All CORS responses include `Vary: Origin`
- [ ] CDN/edge caching doesn't serve wrong CORS headers to different origins

---

## Task S6: Cache Upstash Redis client per process

**Covered in S2** — the client caching is part of the Redis production setup.

---

## Post-completion checklist

After all S1-S5 are done:
- [ ] Run `npm run lint` — no new errors
- [ ] Run `npm run test:ci` — all tests pass
- [ ] Run `npm run build` — build succeeds
- [ ] Manual smoke test: rate limiting works, SSRF blocked, CSP no violations
- [ ] Update `bygglan_2/99-HANDOFF-LOG.md` with completion status
