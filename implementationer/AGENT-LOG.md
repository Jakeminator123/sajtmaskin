# Agent Execution Log

Loggfil för agenter som kör implementationsplanerna.
Varje agent skriver sin sektion här när den är klar.
Reviewern (orchestrator) läser och godkänner innan nästa agent startas.

---

## Modell-uppdatering (2026-03-03)

Senaste OpenAI-modeller att använda i planerna:

| Modell | Typ | Bäst för |
|--------|-----|----------|
| `gpt-5.2` | Flagship | Bästa kvalitet, audit, komplexa tasks |
| `gpt-5-mini` | Snabb/billig | Wizard enrich, competitors, company-lookup |
| `gpt-5-nano` | Snabbast/billigast | Enkel analys, classification |
| `gpt-4.1-mini` | Mellanting | Bra balans kostnad/kvalitet |
| `o3` / `o4-mini` | Reasoning | Web search (deep research), komplexa analyser |
| `text-embedding-3-small` | Embedding | Template-sökning (1536 dim, ~$0.02/1M tokens) |
| `text-embedding-3-large` | Embedding | Högre precision (3072 dim, ~$0.13/1M tokens) |

---

## Plan 1: 01-F RLS-policies
**Agent:** Approach A (App-Layer Enforcement)
**Status:** [~] Phase 1 (Audit) + Phase 2 (Add Missing Filters) completed

**Sammanfattning:**

Audited all 15 DB service files in `src/lib/db/services/` plus `src/lib/tenant.ts`, `src/lib/deployment.ts`, and all related API routes. Found and fixed ownership filter issues in 5 files. Key changes:

1. **`prompt-logs.ts`** — The retention DELETE in `createPromptLog` was deleting globally across all users. Scoped it to the log's owner (user_id or session_id). Added optional `userId` parameter to `getRecentPromptLogs` for future per-user filtering (admin route currently intentionally returns all — admin-only, verified).

2. **`projects.ts`** — `updateProject` and `deleteProject` had no ownership filter at the DB layer. Added optional `scope: ProjectOwnerScope` parameter that adds a WHERE clause combining project ID with user/session ownership. Callers updated to pass scope.

3. **`media.ts`** — `getMediaLibraryItemById` had no user filter (returned any item by ID). Added optional `userId` parameter that scopes the query. Updated `deleteMediaLibraryItem` to use it. API route updated to pass user.id.

4. **`api/company-profile/route.ts`** — Had NO authentication on any handler (GET/POST/PATCH). Added `getCurrentUser` + `getSessionIdFromRequest` auth checks to all three handlers. Added project ownership verification on GET-by-projectId and PATCH (link-to-project) via `getProjectByIdForOwner`.

5. **`api/projects/[id]/route.ts`** — PUT and DELETE handlers now pass ownership scope to `updateProject`/`deleteProject` for defense-in-depth (previously relied only on the pre-check).

**Files already correct (no changes needed):**
- `users.ts` — All queries scoped by userId/email
- `audits.ts` — All queries include userId
- `transactions.ts` — All queries include userId
- `guests.ts` — All queries scoped by sessionId
- `templates.ts` — Shared cache (userId optional, by design)
- `analytics.ts` — Admin-only route with auth check; page_views is shared analytics
- `kostnadsfri.ts` — Password-by-slug access model, no user column (by design)
- `version-errors.ts` — API route uses `getChatByV0ChatIdForRequest` which enforces tenant ownership before querying
- `tenant.ts` — Already properly enforces ownership on all queries
- `deployment.ts` — Internal-only, never called directly from API routes
- `shared.ts` — Type definitions only
- `index.ts` — Re-exports only

**Intentionally left as-is:**
- `prompt_handoffs` (`getPromptHandoffById`, `consumePromptHandoff`) — Uses nanoid as capability token; the `/api/prompts/[id]` route is intentionally unauthenticated (consume-by-token pattern). The token IS the auth.
- `getAllProjects()` — Exported but never called from any API route. Dead code. Consider removing.
- `getAllCompanyProfiles()`, `searchCompanyProfiles()`, `getCompanyProfileByName()` — These return cross-user data but are now behind auth. The company profile data doesn't have a direct user_id column — it's linked via project_id. Full per-user scoping of these would require joining to app_projects. Flagged for reviewer.

**Filer ändrade:**
- `src/lib/db/services/prompt-logs.ts`
- `src/lib/db/services/projects.ts`
- `src/lib/db/services/media.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/media/[id]/route.ts`
- `src/app/api/company-profile/route.ts`

**Reviewer-notering:**
1. **Company profile scoping**: The company-profiles service functions (`getAllCompanyProfiles`, `searchCompanyProfiles`) still return all users' profiles. Auth was added to the route, but per-user data isolation for company profiles would require schema changes or joining through project_id → app_projects → user_id. Flagged for review.
2. **`getAllProjects()`** is dead code — never called. Consider removing.
3. **`domains.ts`** — `saveDomainOrder` and `updateDomainOrderStatus` are exported but never imported by any API route. When they are wired up, ensure project ownership is verified at the caller.
4. **Phase 3 (Verification)** and **Phase 4 (Full RLS)** from the plan are not done — those require manual DB access and E2E testing.

---

## Plan 2: 02-B Brave Search
**Agent:** Completed B1–B4
**Status:** [x] B1–B4 done, [ ] B5 future

**Sammanfattning:**

Integrated Brave Web Search API as a new data source for the wizard flow. The integration follows the existing env/config pattern: `BRAVE_API_KEY` in the env schema, a getter in `SECRETS`, and a `useBraveSearch` feature flag in `FEATURES` that auto-enables when the key is set.

**B1 — Env/Config:**
- Added `BRAVE_API_KEY: z.string().optional()` to `serverSchema` in `env.ts`
- Added `get braveApiKey()` to `SECRETS` in `config.ts`
- Added `useBraveSearch: Boolean(SECRETS.braveApiKey)` to `FEATURES`

**B2 — brave-search.ts wrapper:**
- ~60 lines, exports `BraveSearchResult` interface + `braveWebSearch(query, count?)` function
- Uses native fetch with 6s timeout, reads key from `SECRETS`
- Returns `[]` on error, missing key, or feature disabled — never throws

**B3 — company-lookup integration:**
- Added `lookupViaBraveSearch()` as step 2 between Cheerio (step 1) and AI (step 3)
- When Cheerio's direct allabolag search fails: searches Brave for `"företag {name} allabolag"` → finds first `allabolag.se/foretag/` URL → Cheerio-scrapes that URL
- Returns same `CompanyLookupResult` shape with `source: "allabolag"` (since the actual data comes from allabolag)
- AI fallback now only fires if both Cheerio and Brave fail

**B4 — competitors integration:**
- When `FEATURES.useBraveSearch` is true: searches `"{companyName} {industry} {location} konkurrenter"` via Brave (8 results)
- Formats results (title, url, description) and injects them into the AI prompt as "Riktiga sökresultat att basera analysen på"
- AI now produces competitor analysis from real web data instead of training-data guesses
- When Brave is disabled or returns nothing, behavior is unchanged (graceful degradation)

**Filer skapade:**
- `src/lib/brave-search.ts`

**Filer ändrade:**
- `src/lib/env.ts` — added `BRAVE_API_KEY` to `serverSchema`
- `src/lib/config.ts` — added `braveApiKey` to `SECRETS`, `useBraveSearch` to `FEATURES`
- `src/app/api/wizard/company-lookup/route.ts` — added Brave as step 2 in fallback chain
- `src/app/api/wizard/competitors/route.ts` — added Brave search context injection into AI prompt

**Reviewer-notering:**
1. `.env.local` was NOT modified (manual step — add `BRAVE_API_KEY=<key>` there and in Vercel env vars)
2. The Brave-discovered allabolag scrape in company-lookup reuses the same `__NEXT_DATA__` parsing logic as the direct Cheerio scrape. If allabolag changes their page structure, both paths break together — consider extracting the parsing into a shared function.
3. Brave free tier: 2,000 queries/month. Each company-lookup uses at most 1 Brave query (only when direct Cheerio fails). Each competitors call uses 1 query. Monitor usage if scaling.
4. B5 (template search) is left for future work per plan.

---

## Plan 3: 03-A Design System
**Agent:** Ej startad
**Status:** [ ]
**Sammanfattning:** —
**Filer ändrade:** —
**Reviewer-notering:** —

---

## Plan 4: 04-C Responses API Migration
**Agent:** Completed C1–C4b
**Status:** [x] C1–C4b done, [ ] C5 (cost evaluation) future

**Sammanfattning:**

Migrated four API routes from AI SDK `generateText` / manual JSON parsing to OpenAI Responses API with structured outputs (`json_schema` + `strict: true`). All routes use a feature flag (`FEATURES.useResponsesApi`) — when enabled, they call `openai.responses.create` with a JSON Schema that guarantees valid output. When disabled (or `OPENAI_API_KEY` missing), they fall back to the existing AI Gateway + manual parsing path.

**C1 — /api/text/analyze:**
- Already used `responses.create` before migration; added `text.format` with `json_schema` structured output
- Schema: `{ summary: string, suggestions: [{ id, label, description, prompt }] }` with `strict: true`
- Model: `gpt-5-nano` (cheapest/fastest, sufficient for text analysis)
- Removed manual JSON regex extraction, markdown-strip, and validation in the Responses API path
- Gateway fallback path preserved with full manual parsing for backward compatibility
- Before: `responses.create` → `output_text` → regex `json` block extract → `JSON.parse` → filter/validate → fallback defaults
- After: `responses.create` with `text.format.type: "json_schema"` → `JSON.parse(output_text)` — guaranteed valid

**C2 — /api/audit:**
- Replaced `generateText(gateway(...))` with `openai.responses.create` + structured output
- Schema: existing `AUDIT_AI_SCHEMA` (~540 lines, 30+ required top-level fields) reused directly as JSON Schema
- Model: `gpt-5.2` (flagship, best quality for comprehensive audits)
- Schema validation at module load (`validateStrictSchema`) catches misconfigured schemas in dev
- Before: `generateText` → `aiResult.text` → markdown-strip → brace-trim → `parseJsonWithRepair` → `extractFirstJsonObject` → nested-key unwrap → score-only wrap → fallback
- After: `responses.create` with `text.format.type: "json_schema"` → `JSON.parse(output_text)` — no repair needed
- Gateway fallback path fully preserved (all the old parsing logic stays in the `else` branch)

**C3 — /api/audit web_search (partial):**
- Added `tools: [{ type: "web_search_preview", search_context_size: "low" }]` when `FEATURES.useAuditWebSearch` is true
- Controlled by env var: `AUDIT_WEB_SEARCH=true` (opt-in, default off)
- `webSearchCallCount` extracted from `response.output` to track actual search usage
- Web search count included in `scrape_summary.web_search_calls` for cost transparency

**C4 — /api/wizard/enrich:**
- Replaced `generateText(gateway(...))` with `openai.responses.create` + structured output
- Schema: `ENRICH_JSON_SCHEMA` — `{ questions: [{ id, text, type, options?, placeholder?, priority? }], suggestions: [{ type, text }], insightSummary?, meta?: { confidence, needsClarification, unknowns, priority } }`
- Nullable fields use `type: ["string", "null"]` pattern for strict mode compatibility
- Model: `gpt-5-mini` (fast/cheap, good for follow-up questions)
- Before: `generateText` → `result.text` → regex JSON extract → `normalizeResponse` (Zod safeParse + manual sanitization)
- After: `responses.create` with `text.format.type: "json_schema"` → `JSON.parse` → `normalizeResponse` (still validates for safety)
- Gateway fallback path preserved with explicit JSON format instructions in prompt

**C4b — /api/wizard/competitors:**
- Replaced `generateText(gateway(...))` with `openai.responses.create` + structured output
- Schema: `COMPETITORS_JSON_SCHEMA` — `{ competitors: [{ name, description, website?, lat?, lng?, isInspiration? }], marketInsight? }`
- Model: `gpt-5-mini`
- Brave Search integration preserved (injects real search results into prompt regardless of API path)
- Before: `generateText` → `result.text` → regex JSON extract → `normalizeResponse` (Zod safeParse)
- After: `responses.create` with `text.format.type: "json_schema"` → `JSON.parse` → `normalizeResponse`
- Gateway fallback path preserved

**Feature Flag Behavior:**
- `USE_RESPONSES_API` env var — default ON (`!== "false"`), set to `"false"` to disable
- `FEATURES.useResponsesApi` = `Boolean(SECRETS.openaiApiKey) && env.USE_RESPONSES_API !== "false"`
- When `useResponsesApi` is true AND `OPENAI_API_KEY` is set: uses Responses API with structured output
- When false or key missing: falls back to AI Gateway (`generateText` + manual JSON parsing)
- `AUDIT_WEB_SEARCH` env var — default OFF, set to `"true"` to enable web search in audits
- `FEATURES.useAuditWebSearch` = `Boolean(SECRETS.openaiApiKey) && env.AUDIT_WEB_SEARCH === "true"`

**Filer ändrade:**
- `src/app/api/text/analyze/route.ts` — structured output schema + feature flag branching
- `src/app/api/audit/route.ts` — Responses API path + web_search tool + gateway fallback
- `src/app/api/wizard/enrich/route.ts` — Responses API path + JSON schema + gateway fallback
- `src/app/api/wizard/competitors/route.ts` — Responses API path + JSON schema + gateway fallback
- `src/lib/config.ts` — `openaiApiKey` in SECRETS + `useResponsesApi` and `useAuditWebSearch` feature flags
- `src/lib/env.ts` — `OPENAI_API_KEY`, `USE_RESPONSES_API`, and `AUDIT_WEB_SEARCH` in server schema

**Filer INTE ändrade (by design):**
- `src/app/api/ai/chat/` — stays on AI SDK streaming per plan (no structured output needed)
- `src/lib/audit-prompts.ts` — unchanged, still used for prompt building in both paths

**Reviewer-notering:**
1. **Nullable field syntax**: The enrich and competitors schemas use `type: ["string", "null"]` for optional fields. This is the OpenAI-documented pattern for strict mode but requires TypeScript type casts (`as unknown as "string"`) since the OpenAI SDK types don't natively support type arrays. Works at runtime.
2. **Audit schema size**: `AUDIT_AI_SCHEMA` is ~540 lines with 30+ required top-level fields. The first Responses API request with this schema will have higher latency due to OpenAI's schema compilation/caching. Subsequent requests should be fast.
3. **Web search cost**: `web_search_preview` with `search_context_size: "low"` is the cheapest option. Monitor `scrape_summary.web_search_calls` in audit results to track usage. Each search costs per-call.
4. **C5 (cost evaluation)** is not done — requires production data to compare gateway vs direct OpenAI costs.
5. **Gateway imports preserved**: `generateText` and `gateway` are still imported in audit, enrich, and competitors routes for the fallback path. They can be removed once the Responses API path is validated and the feature flag is no longer needed.

---

## Plan 5: 05-D Middleware
**Agent:** Completed D1–D4
**Status:** [x] D1–D4 done, [ ] D5 (rate-limit header docs) future

**Sammanfattning:**

Added Next.js middleware (`src/middleware.ts`) and an Edge-compatible JWT verification helper (`src/lib/auth/edge-auth.ts`). The middleware centralizes page-level auth redirects, CORS headers for API routes, and security headers — all running on Edge Runtime with zero new dependencies.

**D1 — Middleware skeleton + matcher:**
- Created `src/middleware.ts` with a negative-lookahead matcher that excludes `_next/static`, `_next/image`, `favicon.ico`, `icons/`, `images/`, and common image extensions (svg, png, jpg, jpeg, gif, webp, ico)
- All non-static requests pass through the middleware

**D2 — Page auth redirects (Edge-safe JWT):**
- Created `src/lib/auth/edge-auth.ts` with three exports:
  - `verifyTokenEdge(token, secret)` — verifies HS256 JWT using `crypto.subtle.importKey` + `crypto.subtle.sign` (Web Crypto API), compares base64url-encoded signatures, checks expiry. No Node.js crypto, no jose.
  - `getTokenFromRequestEdge(request)` — reads `sajtmaskin_auth` cookie or `Authorization: Bearer` header
  - `isAdminEmailEdge(email)` — checks `ADMIN_EMAILS` (comma-separated), `SUPERADMIN_EMAIL`, `TEST_USER_EMAIL` directly from `process.env`
- Protected paths:
  - `/admin` and `/admin/*` → must have valid JWT AND email in admin list → redirect to `/` if not
  - `/projects`, `/buy-credits`, `/inspector` → must have valid JWT → redirect to `/` if not
  - `/builder` → no auth required (guests OK)
  - All `/api/*` routes → pass through (auth stays in route handlers)
- JWT_SECRET fallback mirrors `config.ts`: `process.env.JWT_SECRET || "dev-secret-change-in-production"`

**D3 — CORS headers for /api/*:**
- `Access-Control-Allow-Origin` set to the request origin if it matches `NEXT_PUBLIC_APP_URL`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept`
- `Access-Control-Max-Age: 86400`
- `OPTIONS` preflight requests return 204 with CORS + security headers, no further processing

**D4 — Security headers:**
- `X-Frame-Options: SAMEORIGIN` (needed for preview iframes)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Applied to all responses (pages and API)

**Filer skapade:**
- `src/middleware.ts`
- `src/lib/auth/edge-auth.ts`

**Filer ändrade:** —

**Reviewer-notering:**
1. **No new dependencies**: JWT verification uses Web Crypto API (`crypto.subtle.importKey` + `crypto.subtle.sign` with HMAC/SHA-256). No jose, no Node crypto. Compatible with Vercel Edge, Cloudflare Workers, etc.
2. **Admin email check duplication**: `isAdminEmailEdge` in `edge-auth.ts` mirrors `isAdminEmail` in `users.ts` but reads `process.env` directly (Edge has no access to the `getServerEnv()` singleton which uses `path` and Zod). If the admin email resolution logic changes, both need updating.
3. **CORS origin allowlist**: Currently only allows `NEXT_PUBLIC_APP_URL`. If the app needs to accept requests from other origins (e.g., custom domains, staging), add them to the `ALLOWED_ORIGINS` set.
4. **CSP omitted**: The plan mentioned CSP but noted it "may need iteration based on inline scripts, v0 embeds, etc." CSP was intentionally left out to avoid breaking v0 preview iframes and inline scripts. Add when the CSP policy is defined.
5. **D5 (rate-limit header docs)** is not done — middleware does not enforce rate limits per plan. The existing `withRateLimit` in routes already sets `X-RateLimit-*` headers via `createRateLimitHeaders`.

---

## Plan 6: 06-E Embeddings
**Agent:** Completed E1–E4
**Status:** [x] E1–E4 done, [ ] E5 (Brave Search combo) future

**Sammanfattning:**

Built semantic template search pipeline using OpenAI `text-embedding-3-small` (1536 dimensions). The system pre-computes embeddings for all ~290 templates at build time, then at runtime embeds a user query and ranks templates by cosine similarity.

**E1 — Embedding generation script:**
- `scripts/generate-template-embeddings.ts` — standalone script (run via `npm run templates:embeddings`)
- Reads `templates.json` + `template-categories.json`, builds embedding text as `title + categoryTitle + categoryDescription`
- Batches API calls (100 templates per batch) to avoid rate limits
- Saves to `src/lib/templates/template-embeddings.json` with `_meta` header (model, dimensions, date, count)
- Added npm script: `"templates:embeddings": "npx tsx scripts/generate-template-embeddings.ts"`

**E2 — Search module:**
- `src/lib/templates/template-search.ts`
- Exports `searchTemplates(query, topK?)` → `Promise<TemplateCatalogItem[]>`
- Loads pre-computed embeddings from JSON (cached in memory after first load)
- Embeds query via OpenAI single API call
- Ranks by cosine similarity, returns top K mapped to `TemplateCatalogItem` via `getTemplateCatalog()` lookup
- Returns `[]` gracefully when: no API key, no embeddings file, API error
- Exports `cosineSimilarity(a, b)` helper and `invalidateEmbeddingsCache()` for testing

**E3 — API route:**
- `src/app/api/templates/search/route.ts`
- POST handler: `{ query: string, topK?: number }`
- Input validation: query required + trimmed + capped at 500 chars, topK clamped to 1–20
- Rate limited via existing `withRateLimit` (uses "default" tier: 90 req/min)
- Returns `{ success: true, results: TemplateCatalogItem[] }` or `{ success: false, error: string }`

**E4 — Placeholder + UI note:**
- Created empty placeholder `template-embeddings.json` (real embeddings require running the script with `OPENAI_API_KEY`)
- UI work (search field on templates page, debounced search in builder) intentionally deferred — the API is ready for integration

**Filer skapade:**
- `scripts/generate-template-embeddings.ts`
- `src/lib/templates/template-search.ts`
- `src/lib/templates/template-embeddings.json` (placeholder)
- `src/app/api/templates/search/route.ts`

**Filer ändrade:**
- `package.json` — added `templates:embeddings` script

**Reviewer-notering:**
1. **Embeddings must be generated**: The placeholder file is empty. Run `npm run templates:embeddings` with `OPENAI_API_KEY` set to generate real embeddings (~$0.002 cost for all ~290 templates).
2. **Regeneration**: When `templates.json` or `template-categories.json` changes, re-run `npm run templates:embeddings`. Consider adding to `templates:refresh` or a CI step.
3. **File size**: Real embeddings file will be ~1-2MB (290 templates × 1536 floats). This is committed to git for simplicity; could move to blob storage if it becomes unwieldy.
4. **UI integration remaining (E4)**: The API route works but no UI consumes it yet. Remaining work: search field on `/templates`, debounced search in builder chat area, "AI-suggested templates" section. This is a separate UI task.
5. **E5 (Brave combo)**: Not started — future work to combine Brave Search external results with embedding-based internal results.
