---
id: omtag-fas2-B-scaffold-variant-cleanup
title: Scaffold/variant cleanup — slå ihop content-site + justera landing-page-default
phase: 2
priority: P2
parallell_med: []
blockerad_av: [05-scaffold-default-removal]
estimat: "1 dag"
owner_files:
  - src/lib/gen/scaffolds/registry.ts
  - src/lib/gen/scaffolds/content-site/** (tas bort / mergas)
  - src/lib/gen/scaffolds/landing-page/**
  - src/lib/gen/scaffold-variants/** (corporate-grid-default-utredning)
  - config/scaffold-variants/**
  - scripts/scaffolds/eval-landing-variants.ts (kör re-audit)
---

# Fas 2·B — Scaffold/variant cleanup

## Mål

Minska förvirringen i scaffold-ytan genom att (1) slå ihop `content-site` med `landing-page` (de överlappar semantiskt) och (2) utreda varför default-varianten `corporate-grid` vann 0 av 20 prompts i landing-audit 2026-04-18 — fixa antingen embeddings eller defaulten.

## Varför det här

**Guldrapporten:** *"`content-site` överlappar sannolikt för mycket med `landing-page`. `corporate-grid` som default ser misstänkt ut mot eval-resultat."*

**Befintliga fynd (källa: `Kvarvarande-uppgifter.md`):**
- Landing-audit 2026-04-18: `corporate-grid` (default) = 0/20 vinster; `bold-startup=6`, `warm-local=4`, `editorial-lux=3`, `nature-flow=7`.
- Embedding-pickern väljer systematiskt `bold-startup` eller `warm-local` även på B2B/finans/professional-prompts som var explicit kuraterade för `corporate-grid`.

Detta är precis den "strukturell enkelhet utan funktionsförlust"-typ-städning som gör repot lättare att förstå utan att tappa något.

## Scope

| In | Ut |
|---|---|
| M1: slå ihop `content-site` → `landing-page` (scaffold-registret) | Skapa nya scaffolds |
| E7: regenerera variant-embeddings för landing-page ELLER byta default | Röra andra scaffolds (`ecommerce`, `dashboard`, etc.) |
| Re-köra landing-audit och verifiera inga regressions | Starta L3 dossier-variants (parkerat) |
| Uppdatera glossary + docs | Röra dossier-registret (Agent D äger det) |

## Inputs

1. `gpt_review/filer/M-medium-hard-layer.md` — **M1** (rad ~867–896) konkret content-site→landing-page-plan
2. `gpt_review/filer/E-easy-medium-layer.md` — **E7** (rad ~459–480) variant-default-utredning
3. `gpt_review/filer/repo_assessment_2026-04-23.md` sektion "Agent B"
4. Befintlig audit-data: `data/scaffold-eval/reports/landing-variant-latest.json`
5. Script: `scripts/scaffolds/eval-landing-variants.ts`
6. **Dagens master:**
   - `src/lib/gen/scaffolds/registry.ts` (scaffold-listan)
   - `src/lib/gen/scaffolds/content-site/` + `src/lib/gen/scaffolds/landing-page/`
   - `config/scaffold-variants/` (variant-konfig + embeddings)
7. OMTAG 05:s resultat: `OMTAG/05-defaults-map.md` (hur defaults skickas som hint nu)

## Exekveringssteg

### Steg 1 — M1: konsolidera content-site → landing-page

1. Läs M1-planen för det exakta filnamnssvaret och variant-förflyttningen.
2. Identifiera: vilka content-site-varianter måste bli landing-page-varianter för att bevara täckning? (läs M1 — den listar kandidaterna).
3. Flytta varianter från `content-site/` → `landing-page/variants/` med `git mv`.
4. Ta bort `content-site` ur scaffold-registret.
5. Uppdatera alla callsites som refererar `content-site`-id:t (dossiers, manifests, tester).
6. Kör `rg -w "content-site" src config data docs` → noll matcher utanför `docs/plans/avklarat/` och glossary-legacy-sektion.

### Steg 2 — E7: corporate-grid-default

Välj väg efter att ha läst E7-planen + landing-audit-data:

**Väg A — regenerera variant-embeddings för `corporate-grid`** (om default-rollen ska kvarstå): kör `scripts/embeddings/generate-scaffold-embeddings.ts` med variant-dimension, justera variant-meta-beskrivning så corporate-grid-keywords (B2B, consulting, enterprise, finance) fångas. Re-kör landing-audit.

**Väg B — byt default till empirisk vinnare** (`nature-flow` = 7/20): ändra `default: true` i variant-manifest, spela in motivering i glossary.

Guldrapportens vink: "Ej kandidat för borttagning — default-rollen kvarstår, men candidate for further investigation." Väg A är rättare *om* det fixar matchningen; annars väg B.

### Steg 3 — Re-audit + docs

1. Kör `npx tsx scripts/scaffolds/eval-landing-variants.ts` — spara som `data/scaffold-eval/reports/landing-variant-post-fas2B.json`.
2. Sätt in resultatet i `docs/architecture/glossary.md` eller motsvarande scaffold-doc — jämförelse före/efter.
3. Uppdatera `docs/architecture/scaffold-system.md` om content-site nämns där (borde vara bort-städat av OMTAG 03 + Agent D, men verifiera).

## Får INTE göras

- Skapa inga nya scaffolds (`M2`-style).
- Rör inte `dashboard`/`ecommerce`/`portfolio`/`blog`/`restaurant` — scope är strikt landing-page-familjen + content-site-merge.
- Ingen L3 dossier-variants (parkerat).
- Rör inte `scaffold-embeddings.json`-generering för *andra* scaffolds — bara landing-page-varianterna om väg A väljs.
- Rör inte `scaffold-default`-persisteringen — det var OMTAG 05 som gjorde jobbet; nu använder pipen hint-pathen. Verifiera bara att din ändring samarbetar med det.

## Acceptance criteria

- [ ] `content-site` borta ur scaffold-registret; alla callsites uppdaterade.
- [ ] Landing-audit 2.0 (post-fas2B) visar: `corporate-grid` vinner minst 4/20 på kuraterade B2B-prompts (väg A) ELLER ny default dokumenterad (väg B).
- [ ] Samma 10 canonical prompts i OMTAG 02:s eval-baseline — inga regressions på `landing-*`-slugs.
- [ ] `npm run typecheck` + `npm run lint` + `npx vitest run` grönt.
- [ ] `docs/architecture/glossary.md` uppdaterad: content-site flyttad till Legacy, landing-audit-data uppdaterad.
- [ ] `OMTAG/fas2-B-audit-before-after.md` committad med tabell över vinster per variant före/efter.

## Branch

`omtag/fas2-B-scaffold-variant-cleanup`
