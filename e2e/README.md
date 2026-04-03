# Playwright (repo-root)

## TL;DR — `SAJTMASKIN_E2E_*` är **inte** v0-mallar

| Miljövariabler | Vad de gör |
|----------------|------------|
| **`SAJTMASKIN_E2E_BASE_URL`**, `…_SESSION_COOKIE`, `…_DEPLOY_CHAT_ID`, `…_DEPLOY_VERSION_ID` | Endast för **`e2e/deploy/deploy-api-precheck.smoke.spec.ts`**: Playwright anropar **din körda Sajtmaskin** (`POST /api/v0/deployments`, `precheckOnly`). **Ingen** koppling till v0:s mall-API eller en «mallmapp». |

**v0 / builder-scaffolds:** synkas och versioneras via **`npm run templates:*`**, `src/lib/gen/scaffolds/`, template-library-pipelinen — se [`docs/architecture/README.md`](../docs/architecture/README.md), [`scripts/README.md`](../scripts/README.md) och [`docs/schemas/external-template-pipeline-contract.md`](../docs/schemas/external-template-pipeline-contract.md) om mall-spåret.

**Den här `e2e/`-mappen** har två spår: (1) **Vercel.com**-katalog-skapning → `data/external-template-pipeline/`, (2) **valfri deploy-API-smoke** ovan. Malltyper: [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) (V0-templates vs Vercel-mall research).

### V0-templates vs Vercel-templates (produkt)

| Spår | Syfte i Sajtmaskin |
|------|-------------------|
| **V0 / v0-templates** | Plattforms-API, SDK, legacy-projekt — **separat** arkitekturspår (Plan 17 F1). **Inte** samma data som Vercel-katalogen. |
| **Vercel-templates** | Upptäcks här (`vercel-templates/scrape-catalog.spec.ts`) → `data/external-template-pipeline/` → **template-library** → **`src/lib/gen/scaffolds/`**. **Primär källa för scaffold research** som **OwnEngine** / LLM ska använda. |

---

## Vercel.com Templates discovery

**Spec (tracked):** [`vercel-templates/scrape-catalog.spec.ts`](vercel-templates/scrape-catalog.spec.ts)

**Npm:** `references:discover`, `references:discover:second-pass`, `references:discover:full`.

Output: `data/external-template-pipeline/raw-discovery/current/` (see spec header). This is the **external-template research** lane, not v0 gallery templates (`templates:*`).

**Scaffolds:** this spec does **not** edit `src/lib/gen/scaffolds/` or `scaffold-embeddings.json`. After discovery you run the **template-library** pipeline (`template-library:import`, hydrate, `template-library:build`, `template-library:embeddings`) before promoted scaffolds / runtime enrichment see new data. Se [`scripts/README.md`](../scripts/README.md) (template-library) och [`docs/schemas/external-template-pipeline-contract.md`](../docs/schemas/external-template-pipeline-contract.md).

**OpenClaw app e2e:** `npm run test:openclaw:e2e` uses `playwright.openclaw.config.ts` and `tests/openclaw/` — unrelated to this spec.

## Builder & deploy API (regression idag)

Kontraktstester (mockad DB/version, inga riktiga Vercel-anrop): `src/app/api/v0/deployments/route.test.ts`. Preflight, `precheckOnly`, `skipAutoFix` och canonical path: [`docs/architecture/preview-deploy.md`](../docs/architecture/preview-deploy.md).

En full **HTTP- eller Playwright-`request`-smoke mot `POST /api/v0/deployments`** kräver autentiserad session och ägarskap till chat/version — separat produktbeslut.

Den här `e2e/`-mappen är i praktiken **mall-/research-lanet** ovan; byggaren/deploy täcks primärt av **Vitest** tills vidare.

### Deploy API — valfri Playwright-smoke

- **Kommando:** `npm run test:deploy-smoke:e2e` (config `playwright.deploy-smoke.config.ts`).
- **Spec:** [`deploy/deploy-api-precheck.smoke.spec.ts`](deploy/deploy-api-precheck.smoke.spec.ts) — `precheckOnly: true`, inga Vercel-anrop, inga credits.
- **Utan `SAJTMASKIN_E2E_*`:** testet **skippas** (lämpligt för CI utan auth-fixtures).
- **Remediation exit / backlog:** [`PROJECT-STATE-AND-DIRECTION.md`](../docs/plans/active/PROJECT-STATE-AND-DIRECTION.md) §10.
