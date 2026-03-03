# 05-D: Next.js Middleware — Centralized Auth, CORS & Security

**Implementation plan for adding Next.js middleware to the sajtmaskin project.**

**Reference:** [LLM/ROADMAP-next.txt](../LLM/ROADMAP-next.txt) — Section D  
**Roadmap:** `implementationer/README.md` — Steg 5 av 6  
**Status:** [ ] Ej påbörjad  
**Priority:** MEDIUM  
**Effort:** MEDIUM  
**Beroenden:** Inga — oberoende av andra planer

---

## 1. Overview

Today, auth and rate limiting are handled per-route in API handlers. Page-level protection is done in layout components or server components. This plan adds `src/middleware.ts` to centralize:

- **Page-level auth redirects** — redirect unauthenticated/unauthorized users before they hit protected pages
- **CORS headers** — consistent CORS for `/api/*` routes
- **Security headers** — CSP, X-Frame-Options, etc.
- **Rate-limit response headers** — pass-through of `X-RateLimit-*` from API responses (enforcement stays in routes)

**Constraint:** Middleware runs on **Edge Runtime**. No Node.js APIs, no DB queries. Use only Web APIs, env vars, and stateless logic.

---

## 2. What Middleware CAN and SHOULD Handle

| Responsibility | Description |
|----------------|-------------|
| **Page auth redirects** | `/admin/*` → must be admin (verify JWT, check email against ADMIN_EMAILS), redirect to `/` if not |
| | `/projects`, `/buy-credits`, `/inspector` → must be logged in (valid session cookie), redirect to `/` if not |
| | `/builder` → allow guests (no redirect) |
| **CORS headers** | Add `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, etc. for `/api/*` responses |
| **Security headers** | CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |
| **HTTP → HTTPS** | Optional redirect in production |
| **Rate-limit headers** | Middleware can add headers to responses, but **enforcement stays in API routes** — middleware does not call `withRateLimit` or Redis |

---

## 3. What Middleware Should NOT Handle

| Responsibility | Reason |
|----------------|--------|
| **API-level auth** | Too complex; needs DB access (`getCurrentUser` → `getUserById`). Keep auth in API routes via `getCurrentUser(request)`. |
| **Rate-limit enforcement** | Requires Redis/Upstash or in-memory store; Edge has no shared memory. Keep `withRateLimit` in routes. |
| **Business logic** | Middleware is for routing, headers, and redirects — not app logic. |
| **Heavy computation** | Edge is lightweight; keep it fast. |

---

## 4. Current State

- **No `src/middleware.ts`** — project-overview mentions it but it does not exist
- **Auth:** `getCurrentUser(request)` in `src/lib/auth/auth.ts` — reads JWT from cookie, verifies, fetches user from DB
- **Rate limiting:** `withRateLimit(req, "category", handler)` in `src/lib/rateLimit.ts` per route
- **Session:** JWT in `sajtmaskin_auth` cookie
- **Admin:** `isAdminEmail(email)` checks `ADMIN_EMAILS` env + `SUPERADMIN_EMAIL` / `TEST_USER_EMAIL`

---

## 5. Pages & API Routes Summary

### Pages requiring protection

| Path | Rule | Redirect target |
|------|------|-----------------|
| `/admin/*` | Must be admin (JWT valid + email in admin list) | `/` |
| `/projects` | Must be logged in (valid session cookie) | `/` |
| `/buy-credits` | Must be logged in | `/` |
| `/inspector` | Must be logged in | `/` |
| `/builder` | Allow guests (limited credits) | — |

### API routes

- `/api/auth/*` — public (login, register, etc.)
- `/api/admin/*` — must be admin → **auth stays in route** (middleware does not enforce API auth)
- `/api/v0/*`, `/api/ai/*`, `/api/wizard/*` — rate limited, some need auth → **auth in route**
- Other `/api/*` — mixed → **auth in route**

---

## 6. Step-by-Step Plan

- [ ] **D1.** Create `src/middleware.ts` with `config.matcher` to exclude static assets, `_next`, etc.
- [ ] **D2.** Page auth redirects — `/admin/*` (check admin via JWT + env-based admin list), `/projects`, `/buy-credits`, `/inspector` (check valid session cookie). Redirect to `/` if unauth.
- [ ] **D3.** CORS headers for `/api/*` — add appropriate `Access-Control-*` headers on API responses.
- [ ] **D4.** Security headers — CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- [ ] **D5.** Rate-limit headers — middleware does **not** enforce; API routes keep `withRateLimit`. Optionally document pattern for routes to set `X-RateLimit-*` (already done via `createRateLimitHeaders`).

---

## 7. Middleware Matcher Configuration

```typescript
export const config = {
  matcher: [
    // Page routes
    "/((?!_next/static|_next/image|favicon.ico|icons|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // API routes
    "/api/:path*",
  ],
};
```

Adjust as needed to avoid running middleware on static files, health checks, or other paths.

---

## 8. JWT Verification on Edge

`src/lib/auth/auth.ts` uses Node `crypto` and is not Edge-safe. For middleware we need Edge-compatible JWT verification:

**Option A:** Add `jose` (or similar) — lightweight, Web Crypto–based, works on Edge.

```bash
npm install jose
```

Create `src/lib/auth/edge-auth.ts` (or `edge-jwt.ts`) with a minimal `verifyTokenEdge(token: string): { userId: string; email: string } | null` that uses `jose` to verify and decode. Share `JWT_SECRET` and `AUTH_COOKIE_NAME` from config; keep admin check via `ADMIN_EMAILS` (env vars are available in Edge).

**Option B:** Extract a pure JWT verify using Web Crypto in middleware — more work, no new dep.

Recommend **Option A** for maintainability.

---

## 9. Files to Create / Modify

| Action | File | Description |
|--------|------|-------------|
| **Create** | `src/middleware.ts` | Main middleware: matcher, auth redirects, CORS, security headers |
| **Create** | `src/lib/auth/edge-auth.ts` | Edge-safe JWT verify + admin check (no DB, no Node crypto) |
| **Modify** | `package.json` | Add `jose` if Option A chosen |
| **No change** | `src/lib/auth/auth.ts` | Keep for API routes; `getCurrentUser` still used |
| **No change** | `src/lib/rateLimit.ts` | Keep `withRateLimit` in routes; no middleware enforcement |

---

## 10. Middleware Logic Sketch

```
1. If request is GET/HEAD for page route:
   - If path matches /admin/* and (no cookie OR invalid JWT OR not admin email) → redirect to /
   - If path matches /projects|/buy-credits|/inspector and (no cookie OR invalid JWT) → redirect to /
   - /builder → allow (guests OK)

2. If request is for /api/*:
   - Continue to route (no auth enforcement in middleware)

3. On response (NextResponse.next() or from handler):
   - For /api/*: add CORS headers
   - For all: add security headers (CSP, X-Frame-Options, etc.)

4. Optional: HTTP → HTTPS redirect in production
```

---

## 11. CORS Headers

Apply to `/api/*` responses. Example (tune origins as needed):

```
Access-Control-Allow-Origin: <allowed origins from config>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept
Access-Control-Max-Age: 86400
```

Handle `OPTIONS` preflight in middleware: return 204 with CORS headers, no further processing.

---

## 12. Security Headers

| Header | Example |
|--------|---------|
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | Configure per app needs (script-src, etc.) |

CSP may need iteration based on inline scripts, v0 embeds, etc.

---

## 13. Testing Plan

1. **Page redirects**
   - Logged out → `/admin` → redirect to `/`
   - Logged out → `/projects` → redirect to `/`
   - Logged in, non-admin → `/admin` → redirect to `/`
   - Logged in, admin → `/admin` → allow
   - Logged in → `/projects` → allow
   - Guest → `/builder` → allow

2. **CORS**
   - `OPTIONS /api/...` → 204 + CORS headers
   - Cross-origin `GET/POST` → response includes CORS headers

3. **Security headers**
   - Any page/API response includes `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`

4. **No regression**
   - Existing API auth (`getCurrentUser`) still works
   - Rate limiting (`withRateLimit`) still works in routes

---

## 14. Notes

- **Edge Runtime:** No `fs`, `path`, `crypto` (Node), or DB connections. Use Web APIs and env vars only.
- **Auth cookie name:** `sajtmaskin_auth` (from `auth.ts`).
- **Admin check:** JWT payload has `email`; compare against `ADMIN_EMAILS`, `SUPERADMIN_EMAIL`, `TEST_USER_EMAIL` (all from env).
- **Rate-limit headers:** Already set by `withRateLimit` via `createRateLimitHeaders`. Middleware does not add or enforce rate limits.
