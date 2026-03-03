# 02-B: Brave Search API Integration

**Implementation plan for integrating the Brave Search API into sajtmaskin.**

**Reference:** [LLM/ROADMAP-next.txt](../LLM/ROADMAP-next.txt) — Section B  
**Roadmap:** `implementationer/README.md` — Steg 2 av 6  
**Status:** [ ] Ej påbörjad  
**Priority:** HIGH  
**Effort:** LOW–MEDIUM  
**Beroenden:** Inga — kan köras parallellt med 01-F

---

## Overview

Brave Search provides real web search results to replace the current AI "guesswork" fallbacks in company-lookup and competitors. Today, the AI fallback has no actual web search—it fabricates data from training. Brave gives us structured search results we can parse and use.

---

## Step-by-Step Plan

- [ ] **B1.** Add `BRAVE_API_KEY` to `src/lib/env.ts`, `src/lib/config.ts` (SECRETS + FEATURES), and `.env.local`
  - Env schema: add `BRAVE_API_KEY: z.string().optional()` to `serverSchema`
  - Config: add `get braveApiKey() { return env.BRAVE_API_KEY ?? ""; }` to SECRETS
  - Config: add `useBraveSearch: Boolean(SECRETS.braveApiKey)` to FEATURES
  - Add `BRAVE_API_KEY=` to `.env.local` (value local only—never commit)

- [ ] **B2.** Create `src/lib/brave-search.ts` — thin wrapper (~30–40 lines)
  - Interface and async function:
  ```typescript
  export interface BraveSearchResult {
    title: string;
    url: string;
    description: string;
  }

  export async function braveWebSearch(
    query: string,
    count?: number
  ): Promise<BraveSearchResult[]>
  ```
  - Call `GET https://api.search.brave.com/res/v1/web/search?q=...&count=...`
  - Header: `X-Subscription-Token: <BRAVE_API_KEY>`
  - Return `web.results` mapped to `BraveSearchResult[]`, or `[]` on error/missing key

- [ ] **B3.** Integrate in `company-lookup` as step 2 (between Cheerio and AI fallback)
  - When Cheerio fails: search `"företag {companyName} allabolag"`
  - Parse results → extract first allabolag.se company page URL (`/foretag/` or similar)
  - Cheerio-scrape that URL and return same `CompanyLookupResult` shape
  - Only if Brave also fails → fall back to existing AI search

- [ ] **B4.** Integrate in `competitors` route
  - Search `"{industry} {location} företag"` via Brave (when `FEATURES.useBraveSearch`)
  - Feed top results (title, url, description) as context to the AI prompt
  - AI produces structured competitor analysis from real search results instead of training data

- [ ] **B5.** (FUTURE) Template search
  - Search `"restaurang hemsida mall"` etc.
  - Show results in templates UI; can later rank with embeddings (see ROADMAP E)

---

## Files to Create / Modify

| Action | Path |
|--------|------|
| Modify | `src/lib/env.ts` — add BRAVE_API_KEY to serverSchema |
| Modify | `src/lib/config.ts` — add braveApiKey to SECRETS, useBraveSearch to FEATURES |
| Create | `src/lib/brave-search.ts` |
| Modify | `src/app/api/wizard/company-lookup/route.ts` — add Brave step between Cheerio and AI |
| Modify | `src/app/api/wizard/competitors/route.ts` — add Brave search → AI context |

---

## Testing Plan

### Manual
1. **Company-lookup:** Use a company name that doesn’t surface on allabolag search (or mock Cheerio failure) → verify Brave finds a result → verify Cheerio scrape of that URL returns correct data.
2. **Competitors:** Call `/api/wizard/competitors` with industry + location → verify response includes real competitors from search results.

### Unit test (optional)
- `src/lib/brave-search.test.ts`: mock `fetch` for Brave API response, assert `braveWebSearch()` returns correct shape. Skip if no key configured.

---

## Cost Estimate

- **Brave Search free tier:** 2,000 queries/month
- **Usage:** ~1–2 searches per company-lookup (only when Cheerio fails), ~1 per competitors call
- Estimated: well under 2,000/month for typical wizard usage; monitor if scaling

---

## Security Note

**BRAVE_API_KEY must never be committed to git.** Store only in:
- `.env.local` (local development)
- Vercel environment variables (production)

Ensure `.env.local` and any `.env*` files containing secrets are in `.gitignore`.
