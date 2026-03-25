# Vercel Templates discovery (`vercel_templates_levels/`)

## Vad hände med mappen?

Den **raderades medvetet** i commit `c1a0ef96` (2026-03-18, Plan 17 WS-1 *dead code removal*), med motiveringen *legacy, excluded from tsconfig*. Däremot lämnades **`package.json`-scripts** (`references:discover*`, `scaffolds:discover*`) kvar — de pekade då mot en **saknad** sökväg.

Det var alltså **inte** en “okänd flytt” av en annan agent i den meningen att mappen bara försvann: den togs bort i en dokumenterad städ-commit, men **referenserna i npm** och delar av **docs** uppdaterades inte fullt ut.

**2026-03-26:** Mappen är **återställd** från git (`git checkout c1a0ef96^ -- vercel_templates_levels/`) så att:

- `npm run references:discover` (och varianter) åter har en målfil.
- Playwright-specen kan listas/köras igen (`npx playwright test … --list` verifierad).

## Vilken uppgift fyller den?

`vercel_templates_levels/tests/scrape-catalog.spec.ts` är en **Playwright-wrapper** för *external-template research lane*: den hämtar **Vercel.com Templates** (publik katalog) med fördefinierade filter (Next.js, Tailwind, use cases, …) och skriver kanonisk output under:

`research/external-templates/raw-discovery/current/`

(se kommentaren i toppen av spec-filen för exakta filnamn).

Det är **offline/research-verktyg**, inte runtime för byggaren.

## v0-mallar vs Vercel Templates (terminologi)

| Begrepp | Var det lever | Typiskt kommando / spår |
|--------|----------------|-------------------------|
| **v0 gallery templates** (produkt) | Synkas in som byggarens v0-startmallar | `npm run templates:sync` → `scripts/sync-v0-templates.mjs`, `templates:validate`, embeddings under `templates:*` |
| **Vercel Templates** (publik katalog) | Research → `raw-discovery` / template-library | `npm run references:discover*`, `vercel_template_cli.py`, `hamta_sidor*.py` |

**v0-mallar påverkades inte** av borttagningen av `vercel_templates_levels/`; de lever i egna skript under `templates:*`.

## Ska vi behålla mappen?

**Ja, om** du vill att npm-scripten och Playwright-kedjan ska fungera utan att skriva om hela discovery-flödet.

**Nej / alternativ:** Ta bort mappen igen och **ersätt** `references:discover*` med t.ex. ren Python/CLI-kedja (`vercel_template_cli.py`, `import-template-discovery.ts`) — men då måste scripts + docs uppdateras konsekvent i samma PR.

## Underhåll

- Vercel kan ändra DOM på `vercel.com/templates` → specen kan behöva justeras.
- `tsconfig.json` **exkluderar** fortfarande `vercel_templates_levels` (snabbare `tsc`); det är avsiktligt.
- För att Cursor ska indexera mappen togs `vercel_templates_levels/` bort från `.cursorignore` (2026-03-26).
