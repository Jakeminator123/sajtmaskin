# Playwright (repo-root)

## TL;DR — `SAJTMASKIN_E2E_*` är **inte** v0-mallar

| Miljövariabler | Vad de gör |
|----------------|------------|
| **`SAJTMASKIN_E2E_BASE_URL`**, `…_SESSION_COOKIE`, `…_DEPLOY_CHAT_ID`, `…_DEPLOY_VERSION_ID` | Endast för **`e2e/deploy/deploy-api-precheck.smoke.spec.ts`**: Playwright anropar **din körda Sajtmaskin** (`POST /api/v0/deployments`, `precheckOnly`). **Ingen** koppling till v0:s mall-API eller en «mallmapp». |

**v0 / builder-scaffolds:** synkas och versioneras via **`npm run templates:*`**, `src/lib/gen/scaffolds/`, template-library-pipelinen — se `docs/architecture/`-dokument om templates.

**Den här `e2e/`-mappen** har två spår: (1) **Vercel.com**-katalog-skapning → `research/external-templates/`, (2) **valfri deploy-API-smoke** ovan. Förtydligande: [`docs/plans/active/queue/FRAGOR-SVAR-FAQ.md`](../docs/plans/active/queue/FRAGOR-SVAR-FAQ.md) § *I1*.

### V0-templates vs Vercel-templates (produkt)

| Spår | Syfte i Sajtmaskin |
|------|-------------------|
| **V0 / v0-templates** | Plattforms-API, SDK, legacy-projekt — **separat** arkitekturspår (Plan 17 F1). **Inte** samma data som Vercel-katalogen. |
| **Vercel-templates** | Upptäcks här (`vercel-templates/scrape-catalog.spec.ts`) → `research/external-templates/` → **template-library** → **`src/lib/gen/scaffolds/`**. **Primär källa för scaffolds** som **OwnEngine** / LLM ska använda. |

---

## Vercel.com Templates discovery

**Spec (tracked):** [`vercel-templates/scrape-catalog.spec.ts`](vercel-templates/scrape-catalog.spec.ts)

**Npm:** `references:discover`, `references:discover:second-pass`, `references:discover:full` — aliases `scaffolds:discover`, `scaffolds:discover:full`.

Output: `research/external-templates/raw-discovery/current/` (see spec header). This is the **external-template research** lane, not v0 gallery templates (`templates:*`).

**Scaffolds:** this spec does **not** edit `src/lib/gen/scaffolds/` or `scaffold-embeddings.json`. After discovery you run the **template-library** pipeline (`template-library:import`, hydrate, `template-library:build`, `template-library:embeddings`) before promoted scaffolds / runtime enrichment see new data. See arkiv `docs/architecture/archive/pre-2026-03-consolidation/vercel-templates-playwright-scaffold-integration.txt`.

**OpenClaw app e2e:** `npm run test:openclaw:e2e` uses `playwright.openclaw.config.ts` and `tests/openclaw/` — unrelated to this spec.

## Builder & deploy API (regression idag)

Kontraktstester (mockad DB/version, inga riktiga Vercel-anrop): `src/app/api/v0/deployments/route.test.ts`. Preflight, `precheckOnly`, `skipAutoFix` och canonical path: `docs/architecture/archive/pre-2026-03-consolidation/deploy-precheck.md` (översikt: `docs/architecture/preview-deploy.md`).

En full **HTTP- eller Playwright-`request`-smoke mot `POST /api/v0/deployments`** kräver autentiserad session och ägarskap till chat/version — det är ett separat spår om produkten vill lägga e2e här (progress § *Återstår*).

Den här `e2e/`-mappen är i praktiken **mall-/research-lanet** ovan; byggaren/deploy täcks primärt av **Vitest** tills vidare.

### Deploy API — valfri Playwright-smoke

- **Kommando:** `npm run test:deploy-smoke:e2e` (config `playwright.deploy-smoke.config.ts`).
- **Spec:** [`deploy/deploy-api-precheck.smoke.spec.ts`](deploy/deploy-api-precheck.smoke.spec.ts) — `precheckOnly: true`, inga Vercel-anrop, inga credits.
- **Utan `SAJTMASKIN_E2E_*`:** testet **skippas** (lämpligt för CI utan auth-fixtures).
- **Handoff / procentsiffra “100% remediation”:** [`REMEDIATION-EXIT.md`](../docs/plans/avklarat/external-review-execution/REMEDIATION-EXIT.md).
