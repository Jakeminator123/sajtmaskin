# Vercel Templates discovery (Playwright)

## Kanonisk sökväg (git)

- **Spec:** `e2e/vercel-templates/scrape-catalog.spec.ts` (spårad).
- **Npm:** `references:discover*`, `scaffolds:discover*` → kör Playwright mot den filen.
- **Ny clone:** efter `npm install` ska `npx playwright test e2e/vercel-templates/scrape-catalog.spec.ts --list` fungera (kräver Playwright + browsers + nät för körning).

Kort översikt: [`e2e/README.md`](../../e2e/README.md).

Utförlig narrativ + scaffold-gränser: [`vercel-templates-playwright-scaffold-integration.txt`](vercel-templates-playwright-scaffold-integration.txt).

## Legacy: `vercel_templates_levels/` (“spökmappen”)

Katalogen i **repo-roten** kan finnas **lokalt** som gammal kopia (markdown, policy, ev. duplicerad spec). Den är **gitignore + cursorignore** så den inte committas av misstag. Den är **inte** längre den officiella adressen för `package.json`. Ta bort mappen lokalt om du inte behöver den — källan i git är `e2e/vercel-templates/`.

## Historik (kort)

- `c1a0ef96`: mappen togs bort medan npm-scripts pekade kvar → trasiga sökvägar.
- Senare: mappen återställdes tillfälligt / dokumenterades som lokal + ignore.
- **2026-03-25 (ca):** spec **duplicerad** till `e2e/vercel-templates/`, `package.json` pekar hit; `vercel_templates_levels/` kvar som valfri ignorerad spillra.

## Vad specen gör

Playwright-wrapper för **vercel.com/templates** → skriver kanonisk discovery under `research/external-templates/raw-discovery/current/` via `scripts/template-library-discovery.ts`. **Offline/research**, inte builder-runtime.

## v0 vs Vercel Templates

| Begrepp | Spår |
|--------|------|
| **v0 gallery** | `templates:*`, Mall-fliken |
| **Vercel Templates (katalog)** | `references:discover*`, Python `hamta_sidor*`, `vercel_template_cli.py` → template-library / research |

## Underhåll

- DOM på vercel.com kan ändras → spec kan behöva uppdateras.
- `tsconfig.json` exkluderar `e2e` och `vercel_templates_levels` (ingen `tsc` på Playwright-filer).
- `vitest.config.ts` exkluderar `e2e/**`.

## Builder: Mall-fliken

**Mall** = v0-templates. **Vercel Templates**-kedjan matar research / template-library / scaffold-forskning — inte samma UI-yta.
