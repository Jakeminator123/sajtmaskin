---
id: omtag-fas2-D-dossier-contract
title: Dossier contract — en AJV-validator över registry + CI + backoffice
phase: 2
priority: P1
parallell_med: [fas2-A-follow-up-integrity, FAS_0_PÅGÅENDE]
blockerad_av: []
estimat: "5–6 h"
owner_files:
  - src/lib/gen/dossiers/validate-manifest.ts (ny)
  - src/lib/gen/dossiers/registry.ts
  - scripts/dossiers/validate-all.ts (ny)
  - scripts/dossiers/validate-one.mjs (ny)
  - scripts/dossiers/curate-from-reference.ts
  - backoffice/pages/dossiers.py
  - package.json (dossiers:validate-all-script + ajv dep)
  - tester för ovanstående
special_note: |
  FRI AV ALLA OMTAG-KONFLIKTER. Kan starta parallellt med pågående fas 0 och/eller
  fas 1. Rör inga filer som andra OMTAG-kördoc:en äger.
---

# Fas 2·D — Dossier contract hardening

## Mål

Ersätt tre drift:ande manifest-kontrakt (JSON Schema som aldrig körs, Python `_validate_manifest`, TS `assertManifestShape`) med **en** AJV-validator som körs i registry-load, CI-check och backoffice. Vägrar ladda invalid manifest. Säkerställer `defaultForCapability`-unicitet, obligatoriska `instructions.md`-rubriker och att `verbatim`-filer existerar på disk.

## Varför det här

**Guldrapportens enda "P0-klassade" paket**: *"Först måste kontraktet bli hårt, annars fyller du bara på ett system som ännu inte är tillräckligt självkonsistent."*

**Kärnproblem (från Paket B-planen):**
1. `docs/schemas/strict/dossier.schema.json` — strikt schema men **aldrig kört** runtime.
2. `backoffice/pages/dossiers.py` `_validate_manifest` — handskriven Python-check på 7 fält.
3. `scripts/dossiers/curate-from-reference.ts` `assertManifestShape` — egen mini-version.
4. `registry.ts` parse:ar med `JSON.parse + as DossierEntry` **utan validering**.

Konsekvens: `manifest.id` används aldrig (sätts från katalognamn) → kan tyst divergera. Backoffice ger svagare felmeddelanden än CI. Dossiers med trasigt schema landar i pool:en och dyker upp i prompt-injection utan att någon märker.

**Fri parallellisering:** inga av dessa filer rörs av OMTAG 01/02/03/04/05/06/07 eller av fas 2 A/B/C. Kan starta omedelbart, inte vänta på fas 1.

## Scope

| In | Ut |
|---|---|
| Installera `ajv@^8` som dev-dep | Lägga till nya dossiers (M2 parkerat) |
| Ny `validate-manifest.ts` + wire in i `registry.ts` | Ändra `DossierEntry`-typen |
| CI-script `dossiers:validate-all` i `devtest`-kedjan | Röra selection-logiken (`select.ts`) |
| Backoffice använder samma validator via subprocess | Röra capability-mapping / F3-logik |
| `curate-from-reference.ts` använder samma schema för OpenAI `json_schema` | Paket A (docs-omskrivningar) — eget steg efter |
| Cross-cutting: `defaultForCapability`-unicitet, rubrik-check, verbatim-fil-existens | L3 dossier-variants (parkerat) |

## Inputs

1. `gpt_review/filer/cloudagent-paket-B-schema-validation.md` — **hela filen är din spec** (från `pro_gpt.txt` rad ~2419–2655). Exakta kodsnuttar, steg, acceptansgränser.
2. `gpt_review/filer/cloudagent-paket-A-doc-rewrite.md` — om tid finns efter Paket B (D3/D5/D7 docs-omskrivningar)
3. `gpt_review/filer/repo_assessment_2026-04-23.md` sektion "Agent D"
4. **Dagens master:**
   - `src/lib/gen/dossiers/registry.ts` (~rad 60–117, ändringspunkt)
   - `src/lib/gen/dossiers/select.ts` (endast för förståelse — rör ej)
   - `src/lib/gen/dossiers/types.ts` (`DossierEntry`)
   - `src/lib/gen/dossiers/registry.test.ts` (test-mönster)
   - `docs/schemas/strict/dossier.schema.json` (schema-källan)
   - `docs/architecture/dossier-system.md`
   - `backoffice/pages/dossiers.py` `_validate_manifest` (rad ~37–84 — ska ersättas)
   - `scripts/dossiers/curate-from-reference.ts` `assertManifestShape` (~rad 140–176 — ska ersättas)

## Exekveringssteg

Följ Paket B-planen steg-för-steg. Kort sammanfattning:

1. `npm install --save-dev ajv@^8`
2. Skapa `src/lib/gen/dossiers/validate-manifest.ts` — AJV-validator + `expectedId`-check.
3. Wire in i `registry.ts` — `loadEntry` kallar validatorn, skippar invalid dossiers med warning.
4. `package.json` → `"dossiers:validate-all": "npx tsx scripts/dossiers/validate-all.ts"` + lägg i `devtest`-kedjan.
5. Cross-cutting checks i `validate-all.ts`:
   - `defaultForCapability`-unicitet per capability
   - `instructions.md` har alla 5 obligatoriska H1-rubriker (`When to use`, `How to integrate`, `UX rules`, `Avoid`, `Verification`)
   - `verbatim`-filer i `manifest.files[]` existerar på disk
6. Backoffice: ersätt Python-`_validate_manifest` med subprocess-anrop till `scripts/dossiers/validate-one.mjs`.
7. `curate-from-reference.ts`: använd samma `dossier.schema.json` för OpenAI `json_schema`-payload.

Varje steg commitas separat.

### Paket A (valfritt, efter Paket B)

Om tid finns: `gpt_review/filer/cloudagent-paket-A-doc-rewrite.md` — D3/D5/D7 docs-omskrivningar (bara docs, inga kodändringar). Ej krav.

## Får INTE göras

- Starta M2 (lägg till 5–10 nya dossiers) — **parkerat**. Ordningen är kontrakt först, sen expansion.
- Ändra `DossierEntry`-typen — schemat dikterar, typen följer.
- Röra `select.ts`, capability-inference, F3-logik.
- L3 dossier-variants — parkerat.
- Lägga till nya capability-namn i registret.

## Acceptance criteria

- [ ] `npm run dossiers:validate-all` failar build vid manifest-fel.
- [ ] Alla nuvarande dossiers (hard + soft) passerar validatorn.
- [ ] Test: medvetet trasig manifest (saknar `capability`) → validatorn failar med exakt felmeddelande.
- [ ] Backoffice "Dossiers → Redigera" visar AJV-felmeddelanden (jämför mot tidigare).
- [ ] `rg "as DossierEntry" src/lib/gen/dossiers` → noll träffar utan föregående validering.
- [ ] `defaultForCapability: true` finns på max en dossier per capability.
- [ ] `instructions.md` saknar inte rubriker.
- [ ] Alla `injectionMode: "verbatim"`-filer existerar på disk.
- [ ] `npm run typecheck` + `npm run lint` + `npx vitest run` grönt.
- [ ] Eval-baseline (från fas 0·02) — inga regressions.

## Branch

`omtag/fas2-D-dossier-contract`
