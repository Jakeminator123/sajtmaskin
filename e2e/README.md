# Playwright (repo-root)

## TL;DR — `SAJTMASKIN_E2E_*` är **inte** v0-mallar

| Miljövariabler | Vad de gör |
|----------------|------------|
| **`SAJTMASKIN_E2E_BASE_URL`**, `…_SESSION_COOKIE`, `…_DEPLOY_CHAT_ID`, `…_DEPLOY_VERSION_ID` | Endast för **`e2e/deploy/deploy-api-precheck.smoke.spec.ts`**: Playwright anropar **din körda Sajtmaskin** (`POST /api/v0/deployments`, `precheckOnly`). **Ingen** koppling till v0:s mall-API eller en «mallmapp». |

**Builderns `v0-mallar`:** synkas och versioneras via **`npm run templates:*`** och `src/lib/templates/*`. Detta är **inte** samma sak som externa Vercel-mallar eller runtime-scaffolds.

**Den här `e2e/`-mappen** har två spår: (1) **Vercel-mallar** / extern intake → `data/external-template-pipeline/`, (2) **valfri deploy-API-smoke** ovan. Malltyper: [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) (`v0-mallar` vs Vercel-mallar / externa referenser vs scaffolds).

### V0-templates vs Vercel-templates (produkt)

| Spår | Syfte i Sajtmaskin |
|------|-------------------|
| **`v0-mallar`** | Builderns Mallar-tab. Källa: `templates_v0/*` → `src/lib/templates/*`. **Inte** samma data som Vercel-katalogen. |
| **Vercel-mallar / externa referenser** | Legacy referens-spår (`vercel-templates/scrape-catalog-light.spec.ts`, ej CI) → `data/external-template-pipeline/`. Pipelinen togs bort 2026-04-17; specarna är manuell referens. |

---

## Vercel.com Templates discovery (LEGACY — v1-pipe, ej CI)

**Spec (tracked):** [`vercel-templates/scrape-catalog-light.spec.ts`](vercel-templates/scrape-catalog-light.spec.ts) (+ `enrich-template-details.spec.ts`, `smoke-enrich-detail.spec.ts`).

> **Status:** legacy referens-spår. De gamla npm-scripten (`references:discover*`, `template-library:*`, `dossiers:enrich`) togs bort 2026-04-17 (se [`scripts/README.md`](../scripts/README.md)). Specarna körs **inte** automatiskt och har ingen CI-yta — de finns kvar som manuell referens. Output: `data/external-template-pipeline/raw-discovery/current/` (se spec-header). Detta är **extern intake av Vercel-mallar**, inte builderns `v0-mallar` och inte runtime-scaffolds.

## Builder & deploy API (regression idag)

Kontraktstester (mockad DB/version, inga riktiga Vercel-anrop): `src/app/api/v0/deployments/route.test.ts`. Preflight, `precheckOnly`, `skipAutoFix` och canonical path: [`docs/architecture/fas3-preview-and-deploy.md`](../docs/architecture/fas3-preview-and-deploy.md).

En full **HTTP- eller Playwright-`request`-smoke mot `POST /api/v0/deployments`** kräver autentiserad session och ägarskap till chat/version — separat produktbeslut.

Den här `e2e/`-mappen är i praktiken **externa Vercel-mallar / research-lanet** ovan; byggaren/deploy täcks primärt av **Vitest** tills vidare.

### Deploy API — valfri Playwright-smoke

- **Kommando:** `npm run test:deploy-smoke:e2e` (config `playwright.deploy-smoke.config.ts`).
- **Spec:** [`deploy/deploy-api-precheck.smoke.spec.ts`](deploy/deploy-api-precheck.smoke.spec.ts) — `precheckOnly: true`, inga Vercel-anrop, inga credits.
- **Utan `SAJTMASKIN_E2E_*`:** testet **skippas** (lämpligt för CI utan auth-fixtures).
