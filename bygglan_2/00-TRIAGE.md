# Security Triage: Agent Feedback vs Reality

**Date:** 2026-03-04
**Source:** `utokad_deepresearch_openai.md` (25 items from AI security agent)
**Reviewed by:** Human + second-opinion AI agent
**Branch:** `tva22` (14 commits ahead of `main`)

---

## How to read this

The original security agent produced 25 recommendations. Some are genuinely
critical. Some are exaggerated or academic. This document sorts them into
three buckets so you know what to actually do before going to production.

**Verdict scale:**
- **MUST FIX** — Real vulnerability. Exploitable. Fix before production.
- **SHOULD FIX** — Real improvement. Not immediately exploitable but creates
  risk over time. Fix within first 1-2 weeks after launch.
- **DEFER** — Theoretical, academic, or low-impact. Safe to ignore for now.

---

## Glossary of terms and abbreviations

Since the security report uses many technical terms, here they are explained:

| Term | What it means in plain language |
|------|-------------------------------|
| **SSRF** (Server-Side Request Forgery) | An attacker tricks your server into making HTTP requests to internal/private services (like cloud metadata endpoints or localhost). If your app fetches a URL the user provides, the user could supply `http://169.254.169.254/` to read AWS/cloud secrets. |
| **RLS** (Row-Level Security) | A database feature where the DB itself enforces "user A can only see user A's rows." Your app uses Drizzle ORM with direct Postgres, so RLS would need custom session variables. |
| **CSP** (Content Security Policy) | An HTTP header that tells browsers which scripts/styles/images are allowed to load. Prevents XSS by blocking injected scripts. A "nonce" is a random value generated per request — only scripts with that nonce are allowed to run. |
| **HSTS** (HTTP Strict Transport Security) | An HTTP header that tells browsers "always use HTTPS for this site, never HTTP." Prevents downgrade attacks. |
| **CORS** (Cross-Origin Resource Sharing) | Rules for which other websites can make API requests to your site. Without it, any website could call your API from a user's browser. |
| **CSRF** (Cross-Site Request Forgery) | An attack where a malicious website tricks a logged-in user's browser into making requests to your site. `SameSite=Lax` cookies already prevent most CSRF. |
| **HMAC** (Hash-based Message Authentication Code) | A way to sign data (like cookies) so you can verify they haven't been tampered with. Uses a secret key + SHA-256 hash. |
| **JWT** (JSON Web Token) | A signed token containing user info (like user ID, expiry). Your app creates JWTs for auth. If someone gets the signing secret, they can forge any user's token. |
| **XSS** (Cross-Site Scripting) | An attacker injects JavaScript into your page that runs in other users' browsers. `HttpOnly` cookies can't be read by JS, protecting them from XSS. |
| **DNS rebinding** | An attack where a hostname resolves to a public IP first (passes your check), then switches to a private IP (bypasses your SSRF block). Requires attacker-controlled DNS. |
| **`timingSafeEqual`** | A comparison function that takes the same amount of time regardless of how many characters match. Prevents attackers from guessing a secret one character at a time by measuring response speed. |
| **`rejectUnauthorized`** | A TLS/SSL setting. When `true`, your app verifies the database server's certificate is valid. When `false`, anyone can pretend to be your database (man-in-the-middle attack). |
| **Serverless** | Your code runs in short-lived containers (Vercel Functions). Each request might hit a different container, so in-memory data (like rate limit counters) isn't shared between them. |
| **Redis/Upstash** | Redis is an in-memory database, often used for rate limiting and caching. Upstash is a serverless Redis provider that works well with Vercel. Needed so rate limit counters are shared across all serverless instances. |
| **OWASP** | Open Web Application Security Project — the standard reference for web security best practices. |
| **RPO/RTO** | Recovery Point Objective (how much data you can afford to lose) / Recovery Time Objective (how long downtime is acceptable). Used when planning backups. |
| **GDPR art. 30** | EU regulation requiring companies that handle personal data to maintain a register of processing activities. Relevant for Swedish companies. |
| **SAST** (Static Application Security Testing) | Automated tools that scan source code for vulnerabilities without running it (e.g., CodeQL). |
| **PII** (Personally Identifiable Information) | Data that can identify a person: name, email, phone number, etc. |

---

## MUST FIX before production (6 items)

### M1. Dev fallback JWT secret can be used in production
**Original item:** #4
**Severity:** CRITICAL
**The problem:** `src/proxy.ts` and `src/lib/config.ts` both have
`process.env.JWT_SECRET || "dev-secret-change-in-production"`. If `JWT_SECRET`
isn't set in your Vercel env, anyone who reads the source code can forge JWTs
and log in as any user.
**The fix:** Remove the fallback. Throw an error at startup if `JWT_SECRET`
is missing in production. Takes ~15 minutes.

### M2. Webscraper bypasses SSRF protection entirely
**Original item:** Not in the 25 (discovered during code review)
**Severity:** CRITICAL
**The problem:** `src/lib/webscraper.ts` has its own `fetchWithTimeout` that
does NOT use `ssrf-guard.ts`. Routes using it (`/api/analyze-website`,
`/api/wizard/quick-scrape`, `/api/wizard/enrich`, `/api/audit`) are vulnerable
to SSRF — an attacker can make your server fetch internal endpoints.
**The fix:** Route webscraper fetches through `safeFetch` from `ssrf-guard.ts`.

### M3. Database connection has TLS verification disabled
**Original item:** Not in the 25 (discovered during code review)
**Severity:** HIGH
**The problem:** `src/lib/db/client.ts` sets `ssl: { rejectUnauthorized: false }`.
This means your app doesn't verify it's actually talking to Supabase — a
man-in-the-middle could intercept all database traffic.
**The fix:** Set `rejectUnauthorized: true` (or honor the existing
`DB_SSL_REJECT_UNAUTHORIZED` env var that `config.ts` already references).

### M4. Backoffice GET endpoints leak data without auth
**Original item:** #1
**Severity:** HIGH
**The problem:** The template generator creates `content/route.ts` and
`colors/route.ts` where GET handlers don't check the session cookie. Anyone
who knows the URL can read the backoffice data model.
**The fix:** Add session verification to GET handlers in the generator.

### M5. Rate limit identity is spoofable via `x-user-id` header
**Original item:** #5
**Severity:** HIGH
**The problem:** `rateLimit.ts` `getClientId()` trusts the `x-user-id` header
from the client. An attacker can send a different `x-user-id` with each request
to get a fresh rate limit window every time, making rate limiting useless.
**The fix:** Only use `x-user-id` from authenticated sessions (after JWT
verification), never from raw headers. Fall back to IP for unauthenticated.

### M6. Domain and download routes have no auth at all
**Original item:** Not in the 25 (discovered during code review)
**Severity:** HIGH
**The problem:** `/api/domains/save`, `/api/domains/link`, `/api/domains/verify`,
and `/api/download` accept requests without any authentication or rate limiting.
An attacker could link domains to other people's deployments or generate
downloads for any project.
**The fix:** Add `getCurrentUser` checks (or at minimum session checks) and
rate limiting to these routes.

---

## SHOULD FIX within first 1-2 weeks (6 items)

### S1. SSRF redirect chain not fully validated
**Original item:** #2
**Severity:** MEDIUM
**The problem:** `safeFetch` in `ssrf-guard.ts` validates the first redirect
target but then uses `redirect: "follow"` for subsequent hops. An attacker
could chain redirects: public URL → public URL → private IP.
**The fix:** Use manual redirect loop with validation per hop (max 5 hops).
The report includes a good code example for this.

### S2. In-memory rate limiting won't work in serverless production
**Original item:** #7
**Severity:** MEDIUM
**The problem:** Without Redis/Upstash configured, rate limiting falls back
to in-memory counters. On Vercel, each function invocation can be a different
container, so counters are never shared. Rate limiting is effectively disabled.
**What this means for you:** You need an Upstash account. The free tier gives
10,000 requests/day. The pay-as-you-go plan costs ~$0.20 per 100K requests.
For a small SaaS, this will cost less than $5/month.
**The fix:** Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to
Vercel env vars. Add a startup check that warns/fails if they're missing in prod.

### S3. Company profiles service has no ownership checks
**Original item:** Not in the 25 (discovered during code review)
**Severity:** MEDIUM
**The problem:** `saveCompanyProfile` accepts any `project_id` from the request
body without verifying the caller owns that project. `searchCompanyProfiles`
and `getAllCompanyProfiles` return data across all users.
**The fix:** Add ownership verification before saving profiles. Restrict
search/list to admin or to projects the user owns.

### S4. CSP should use report-only mode first, then enforce
**Original item:** #8
**Severity:** MEDIUM
**The problem:** CSP is controlled by `CSP_ENFORCE` env var but there's no
reporting endpoint configured. Without reporting, you won't know if CSP breaks
legitimate functionality.
**The fix:** Add `report-uri` or `report-to` directive. Run in Report-Only in
staging. Switch to enforce when violation count is acceptable.

### S5. CORS responses should include `Vary: Origin`
**Original item:** #9
**Severity:** LOW-MEDIUM
**The problem:** When `Access-Control-Allow-Origin` is set dynamically based
on the request's `Origin` header, CDN caches might serve a response with the
wrong origin to a different client.
**The fix:** Add `Vary: Origin` header. One-line change in `proxy.ts`.

### S6. Cache and reuse Redis/Upstash client per process
**Original item:** #6
**Severity:** LOW-MEDIUM
**The problem:** `rateLimit.ts` creates a new Upstash client per request,
which adds unnecessary latency and may leak connections.
**The fix:** Lazily create and cache the client at module level.

---

## DEFER — safe to ignore for now (13 items)

### D1. DNS resolution in SSRF guard (#3)
**Why defer:** Requires `dns.lookup()` calls which add latency and complexity.
The current IP-range blocking handles 95% of real-world SSRF. DNS rebinding
requires an attacker to control a DNS server — extremely unlikely for a small
Swedish SaaS.

### D2. CSRF token for cookie-auth routes (#10)
**Why defer:** `SameSite=Lax` cookies already prevent CSRF for state-changing
requests (POST/PUT/DELETE). Origin-check is also in place for backoffice.
Adding a CSRF token is belt-and-suspenders — good eventually, not needed now.

### D3. JWT signature timing-safe compare (#11)
**Why defer:** The theoretical timing attack on JWT verification requires
thousands of precisely timed requests. In practice, network jitter makes this
attack impossible over the internet. Your backoffice already uses
`timingSafeEqual` where it matters.

### D4. JWT token revocation/versioning (#12)
**Why defer:** Requires adding a `tokenVersion` column to the users table and
checking it on every request. JWTs already expire. For a small app, forcing
re-login on password reset is sufficient without this infrastructure.

### D5. Prompt snippet PII redaction (#13)
**Why defer:** File logging is opt-in via env var. In production you likely
won't enable it. If you do, the risk is in your own logs, not exposed to users.

### D6. Refresh-token script security (#14)
**Why defer:** `scripts/refresh-token.mjs` is a dev tool. It writes to
`.env.local` which is gitignored. Not a production risk.

### D7. Proxy runtime latency (#15)
**Why defer:** Not a security issue at all. The proxy runs on Node.js runtime,
which is what Next.js 16 recommends. Performance is fine.

### D8. Blob storage public vs private (#16, #17)
**Why defer:** Depends on whether backoffice data is sensitive. If it's just
colors and content text, public blobs are fine. Revisit if you store
user-uploaded sensitive documents.

### D9. DB migrations instead of db-init.mjs (#18)
**Why defer:** Important for long-term maintenance but not a security risk.
`db-init.mjs` uses `CREATE TABLE IF NOT EXISTS` which is safe. Migrate to
Drizzle Kit migrations when convenient, not urgent.

### D10. Schema parity healthcheck (#19)
**Why defer:** Nice-to-have for ops. Not a security vulnerability.

### D11. Backup/restore runbook (#20)
**Why defer:** Important for disaster recovery but not code. Supabase has
built-in backups. Document the restore procedure when you have time.

### D12. Observability / correlation IDs (#21)
**Why defer:** Improves debugging, not security. Add when you start seeing
real traffic patterns you need to trace.

### D13. CodeQL/SAST in CI (#22), Node LTS upgrade (#23), LICENSE (#24), GDPR (#25)
**Why defer:** All good practices. None are exploitable vulnerabilities.
- CodeQL: Add when you have time. Dependabot is already configured.
- Node 22→24: Node 22 is maintained until April 2027. No rush.
- LICENSE: Only matters if repo is public.
- GDPR: Important for a Swedish company but is a business/legal task, not code.

---

## Summary matrix

| ID | Item | Verdict | Effort | Cost |
|----|------|---------|--------|------|
| M1 | Dev fallback JWT secret | MUST FIX | Small (15 min) | Free |
| M2 | Webscraper SSRF bypass | MUST FIX | Small (30 min) | Free |
| M3 | DB SSL disabled | MUST FIX | Small (15 min) | Free |
| M4 | Backoffice GET no auth | MUST FIX | Small (30 min) | Free |
| M5 | Rate limit ID spoofable | MUST FIX | Small (30 min) | Free |
| M6 | Domain/download no auth | MUST FIX | Medium (1-2 hr) | Free |
| S1 | SSRF redirect chain | SHOULD FIX | Medium (1 hr) | Free |
| S2 | Redis for rate limiting | SHOULD FIX | Small (30 min) | ~$0-5/mo Upstash |
| S3 | Company profiles no owner | SHOULD FIX | Medium (1 hr) | Free |
| S4 | CSP reporting | SHOULD FIX | Medium (1 hr) | Free |
| S5 | CORS Vary: Origin | SHOULD FIX | Tiny (5 min) | Free |
| S6 | Cache Redis client | SHOULD FIX | Small (20 min) | Free |
| D1-D13 | Deferred items | DEFER | — | — |

---

## Cost considerations

**Upstash Redis (for rate limiting in production):**
- Free tier: 10,000 commands/day (~300K/month)
- Pay-as-you-go: $0.20 per 100K commands
- For a small SaaS with rate limiting: likely $0-5/month
- Recommended: Start with free tier, upgrade if needed
- Alternative: Vercel KV (built on Upstash, same pricing, tighter integration)

**No other paid services needed** for these security fixes. Everything else
is code changes using existing infrastructure.
