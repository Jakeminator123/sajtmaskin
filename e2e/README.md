# Playwright (repo-root)

## Vercel.com Templates discovery

**Spec (tracked):** [`vercel-templates/scrape-catalog.spec.ts`](vercel-templates/scrape-catalog.spec.ts)

**Npm:** `references:discover`, `references:discover:second-pass`, `references:discover:full` — aliases `scaffolds:discover`, `scaffolds:discover:full`.

Output: `research/external-templates/raw-discovery/current/` (see spec header). This is the **external-template research** lane, not v0 gallery templates (`templates:*`).

**Scaffolds:** this spec does **not** edit `src/lib/gen/scaffolds/` or `scaffold-embeddings.json`. After discovery you run the **template-library** pipeline (`template-library:import`, hydrate, `template-library:build`, `template-library:embeddings`) before promoted scaffolds / runtime enrichment see new data. See `docs/architecture/vercel-templates-playwright-scaffold-integration.txt`.

**OpenClaw app e2e:** `npm run test:openclaw:e2e` uses `playwright.openclaw.config.ts` and `tests/openclaw/` — unrelated to this spec.

## Builder & deploy API (regression idag)

Kontraktstester (mockad DB/version, inga riktiga Vercel-anrop): `src/app/api/v0/deployments/route.test.ts`. Preflight, `precheckOnly`, `skipAutoFix` och canonical path: `docs/architecture/deploy-precheck.md`.

En full **HTTP- eller Playwright-`request`-smoke mot `POST /api/v0/deployments`** kräver autentiserad session och ägarskap till chat/version — det är ett separat spår om produkten vill lägga e2e här (progress § *Återstår*).

Den här `e2e/`-mappen är i praktiken **mall-/research-lanet** ovan; byggaren/deploy täcks primärt av **Vitest** tills vidare.
