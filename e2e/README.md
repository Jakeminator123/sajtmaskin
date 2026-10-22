# Playwright (repo-root)

`e2e/` innehåller Playwright-tester som körs **utanför** den vanliga Vitest-sviten. Idag finns två aktiva spår: en blockerande projektpersistens-E2E och en valfri deploy-API-smoke. CI-roller: [`docs/testing.md`](../docs/testing.md).

## Aktivt: projektpersistens (blockerande i CI)

- **Kommando:** `npm run test:e2e:project-persistence` ([`scripts/e2e/run-project-persistence.mjs`](../scripts/e2e/run-project-persistence.mjs), config `playwright.project-persistence.config.ts`). `npm run test:e2e:project-persistence:list` är bara discovery.
- **Spec:** [`project-persistence.spec.ts`](project-persistence.spec.ts) — riktig UI/API/DB-persistens i Chromium mot en efemär, nätverksisolerad Postgres-container (kräver Docker). Ingen delad databas och inga providercredentials.
- **CI:** eget jobb `quality-project-persistence` i tung profil; required via `quality`-aggregatet. Det ingår inte i `quality-core`.

## Aktivt: deploy-API-smoke (opt-in)

- **Kommando:** `npm run test:deploy-smoke:e2e` (config `playwright.deploy-smoke.config.ts`, `testDir: ./e2e/deploy`).
- **Spec:** [`deploy/deploy-api-precheck.smoke.spec.ts`](deploy/deploy-api-precheck.smoke.spec.ts) — anropar din körda Sajtmaskin (`POST /api/v0/deployments`, `precheckOnly: true`). Inga riktiga Vercel-anrop, inga credits.
- **Utan `SAJTMASKIN_E2E_*`:** testet **skippas** (lämpligt för CI utan auth-fixtures).
- **CI:** bara discovery (`npm run test:e2e:contract`, `--list`) körs, blockerande i `quality-core`.

| Miljövariabel | Vad den gör |
|---|---|
| `SAJTMASKIN_E2E_BASE_URL` | Bas-URL till din körda Sajtmaskin. |
| `SAJTMASKIN_E2E_SESSION_COOKIE` | Autentiserad session (ägarskap till chat/version krävs). |
| `SAJTMASKIN_E2E_DEPLOY_CHAT_ID`, `…_DEPLOY_VERSION_ID` | Chat/version som prechecken körs mot. |

Detta är **inte** kopplat till v0:s mall-API eller någon «mallmapp».

## Builder & deploy API — täcks av Vitest

Kontraktstester (mockad DB/version, inga riktiga Vercel-anrop): `src/app/api/v0/deployments/route.test.ts`. Preflight, `precheckOnly`, `skipAutoFix` och canonical path: [`docs/architecture/llm-pipeline.md`](../docs/architecture/llm-pipeline.md) § FAS 3. En full Playwright-smoke mot `POST /api/v0/deployments` kräver autentiserad session — se opt-in ovan.

## Terminologi: `v0-mallar` ≠ Vercel-mallar

Builderns **`v0-mallar`** synkas via `npm run templates:*` och `src/lib/templates/*` (Mallar-tab). Det är **inte** samma sak som externa Vercel-mallar eller runtime-scaffolds. Full ordlista: [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc).

## Borttaget: Vercel.com template-discovery (legacy)

Den gamla Vercel-mall-discovery-pipen (specs under `e2e/vercel-templates/` + npm-scripten `references:discover*`, `template-library:*`, `dossiers:enrich`) togs bort 2026-04-17 (se [`scripts/README.md`](../scripts/README.md)). Referens-specsen låg kvar som manuell referens utan CI och raderades 2026-06-22 — receptet finns i git-historiken om extern Vercel-mall-intake någonsin återupplivas.
