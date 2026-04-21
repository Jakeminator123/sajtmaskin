---
id: dossier-cleanup-2026-04-21
title: Dossier v2 — driftsupp + schema-härdning
status: avklarad-inline (cloudagent-rester splittade till egna filer)
created: 2026-04-21
closed: 2026-04-21
priority: medium
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
follow_up_files:
  - docs/plans/active/cloudagent-paket-A-doc-rewrite.md
  - docs/plans/active/cloudagent-paket-B-schema-validation.md
---

# Dossier v2 — drift­fix + schema-härdning (AVKLARAD)

> **Status 2026-04-21:** Allt som var inline-fixbart är gjort i denna plan-fil och commitad. De två arbetspaketen som krävde cloudagent (Paket A — doc-omskrivningar, Paket B — schema-härdning) flyttades till egna standalone-filer:
>
> - [`cloudagent-paket-A-doc-rewrite.md`](../active/cloudagent-paket-A-doc-rewrite.md)
> - [`cloudagent-paket-B-schema-validation.md`](../active/cloudagent-paket-B-schema-validation.md)
>
> Denna fil ligger i avklarat/ för historik. Innehållet nedan beskriver vad som gjordes och vad som flyttades.

Tre granskningar (stale-arkeolog, förenkling/scheman, parity) gjorda 2026-04-21 fann 11 städkandidater. **SAFE** + **enkla MEDIUM** verkställdes 2026-04-21 i två pass. Det som återstår är (a) tre större doc-omskrivningar som kräver scope-beslut och (b) schema-härdningen — båda lämpade för cloudagent.

## ✅ Verkställt 2026-04-21 (commit-historia visar exakt diff)

| ID | Fil | Vad gjordes |
|----|-----|-------------|
| SAFE-1 | `backoffice/shared.py` | Kommentar uppdaterad: pekade på `dossier-master.json` som inte finns i v2; nu mot disk-walk + capability-map. |
| SAFE-2 | `e2e/vercel-templates/scrape-catalog-light.spec.ts` | Header-docstring markerad LEGACY med migration-not. |
| SAFE-3 | `docs/plans/active/Kvarvarande-uppgifter.md` | Strukit stale rad om `recommendedScaffoldFamilies` → `recommendedScaffoldIds`. |
| Pass 2 | `egna_kommandon.txt` | Helt omskriven mot v2: tagit bort `dossiers:rebuild/embeddings/index/scrape/enrich/import/queue/promote/clone-repos/extract-files/recommend:*` (existerar inte), lagt till v2-`dossiers:curate`-syntax + observability-endpoints + alla ENV-flaggor. |
| D1 | `docs/architecture/glossary.md` rad 141 | Dubblettdefinitionen ersatt med v2-spec som länkar till `dossier-system.md` + schema. |
| D2 | `docs/architecture/glossary.md` rad 279–293 | Hela `_status`-sektionen ersatt med kort historisk-not (v2-schema har `additionalProperties: false`, fältet finns inte). |
| D4 | `docs/architecture/fas2-orchestration-and-build.md` rad 139 | Pekar nu på `data/dossiers/{hard,soft}/<id>/` (rätt) — `_index/capability-map.json` är genererad view, inte runtime-källa. |
| D6 | `docs/schemas/scaffold-contract.md` rad 224 | Samma fix; lagt till länkar till `dossier-selection-flow.md` och `dossier-system.md`. |
| D8 | `backoffice/pages/pipeline_health.py` rad 252–260 | Docstring-exempel `dossiers-embeddings` + `master.json` ersatt med generic scaffold-embeddings-exempel. |
| D9 | `backoffice/pages/_ops_impl.py` rad 286–288 | "dossier-pipens egna evals" borttaget; pekar nu enbart på `npm run eval`. |

**Totalt:** 9 ändringar, 0 runtime-påverkan, 0 nya tester (rena docs/kommentarer).

## ⏳ Kvar till cloudagent — Pass 1 stora omskrivningar (~3 h)

Dessa kräver **scope-beslut** + omskrivning av diagram/sektioner — för stora för iterativ session.

| # | Fil | Vad | Beslut som behövs |
|---|-----|-----|-------------------|
| D3 | `docs/architecture/scaffold-system.md` sektion 3 (~rad 62–90) | Diagram refererar `data/dossiers/<id>/` (utan hard/soft), `selected_files/`, `template-library.generated.json`, `derive-variants-from-dossiers`, `recommendedScaffoldIds`. | Skriv om hela sektion 3 mot v2-layout (`hard|soft` + capability-driven). Kan diagrammet förenklas eller behövs det alls? |
| D5 | `docs/external-pipelines/vercel-templates-structure.md` rad 167–194, 222 | "Dossier-pipeline" + kategori-klassning + `compat-test`-flöde är v1. | **Beslut:** markera hela filen som "historisk v1-pipeline" eller skriv om mot dagens `npm run dossiers:curate` + `data/template-references/`-flöde? |
| D7 | `docs/schemas/external-template-pipeline-contract.md` rad 137–151 | Påstår att runtime *inte* läser dossier-kataloger — fel för own-engine v2. | Skriv om så det avgränsar tydligt: gäller **gamla** template-library-spåret, inte `src/lib/gen/dossiers/*`. Eller arkivera filen helt. |

## ⏳ Kvar till cloudagent — Pass 3 schema-härdning (~5 h)

**Risk:** medel — kräver test efter. Stor långsiktig vinst (en valideringsväg ersätter tre).

### Problemet

Manifest-kontraktet finns i **tre** källor som drift:ar isär:

1. **`docs/schemas/strict/dossier.schema.json`** — strikt JSON Schema. Används bara i editor (IDE-validation via `$schema`) och som dokumentation. **Inte** vid runtime-load.
2. **`backoffice/pages/dossiers.py` `_validate_manifest`** (~rad 37–84) — handskriven Python-check på 7 fält + 2 enums. Svagare än JSON Schema.
3. **`scripts/dossiers/curate-from-reference.ts`** — OpenAI `json_schema` + `assertManifestShape` (~rad 140–176, 240–316). Egen mini-version.

`registry.ts` (~rad 60–117) parse:ar med `JSON.parse` + `as`-cast utan validering. Manifest-`id` används aldrig — `loadEntry` sätter `id` från katalognamn, så manifest-`id` kan tyst divergera.

### Lösningsförslag (för cloudagent)

#### Steg 3.1 — Gemensam validator (Node)

Lägg till `ajv` som dev-dep, skapa `src/lib/gen/dossiers/validate-manifest.ts`:

```ts
import Ajv, { type ValidateFunction } from "ajv";
import schema from "../../../../docs/schemas/strict/dossier.schema.json";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate: ValidateFunction = ajv.compile(schema);

export function validateDossierManifest(
  raw: unknown,
  context: { expectedId: string; class: "hard" | "soft" },
): { valid: true; data: DossierEntry } | { valid: false; errors: string[] } {
  const ok = validate(raw);
  const errors: string[] = [];
  if (!ok && validate.errors) {
    for (const e of validate.errors) errors.push(`${e.instancePath} ${e.message}`);
  }
  if (typeof raw === "object" && raw !== null && (raw as { id?: unknown }).id !== context.expectedId) {
    errors.push(`manifest.id (${(raw as { id?: unknown }).id}) does not match directory name (${context.expectedId})`);
  }
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: raw as DossierEntry };
}
```

`registry.ts` kallar denna i `loadEntry`. CI-script `npm run dossiers:validate-all` walkar alla dossiers.

#### Steg 3.2 — `defaultForCapability`-unicitet

I CI-validatorn: gruppera per capability. Om > 1 har `defaultForCapability=true`, faila bygget. Idag bara `console.warn`.

#### Steg 3.3 — `instructions.md`-rubriker

Validera att alla 5 sektioner finns: `# When to use`, `# How to integrate`, `# UX rules`, `# Avoid`, `# Verification`.

#### Steg 3.4 — Verbatim-fil-existens

För filer med effektiv `injectionMode === "verbatim"`: kontrollera att filen faktiskt finns på disk. Idag bara `console.warn` vid prompt-bygg.

#### Steg 3.5 — Backoffice använder samma validator

`backoffice/pages/dossiers.py` `_validate_manifest` ersätts av subprocess-anrop till `node scripts/dossiers/validate-one.mjs <path>`.

#### Steg 3.6 — Curate genererar mot samma schema

`curate-from-reference.ts` läser `dossier.schema.json` direkt och bygger OpenAI `json_schema`-payload från det. Tar bort `assertManifestShape` mini-versionen.

### Acceptansgränser

- `npm run dossiers:validate-all` i CI — failas vid manifest-fel.
- Backoffice "Redigera"-tab visar exakta JSON Schema-felmeddelanden.
- 0 förekomster av `as DossierEntry`-cast i `registry.ts` utan föregående validering.
- Test: skapa medvetet trasig manifest (saknar `capability`) och bekräfta att alla tre ytor (CI, backoffice, curate) failar samma sätt med samma meddelande.

## ⏳ DEFERRED — Pass 4 (10 min)

- `e2e/vercel-templates/scrape-catalog-light.spec.ts` har redan LEGACY-header. **Rekommendation:** behåll i `e2e/`-trädet — om någon vill plocka upp template-scrapning för en framtida `data/template-references/`-curation är det mindre arbete att starta från specen än att skriva om från scratch.

---

## Cloudagent-prompt (kopiera in)

```
Du tar över dossier-cleanup-spåret 2026-04-21. Plan:
docs/plans/active/dossier-cleanup-2026-04-21.md

Två arbetspaket:

Paket A — Pass 1 stora doc-omskrivningar (~3 h):
- D3: docs/architecture/scaffold-system.md sektion 3 — diagrammet refererar
  v1-pipen. Skriv om mot v2 (data/dossiers/{hard,soft}/, capability-driven).
  Förenkla diagrammet — eller ta bort om det inte längre tjänar något syfte.
- D5: docs/external-pipelines/vercel-templates-structure.md — markera hela
  filen som "historisk v1-pipeline" ELLER skriv om mot dagens
  npm run dossiers:curate + data/template-references/-flöde. Fråga
  användaren först vilken väg.
- D7: docs/schemas/external-template-pipeline-contract.md rad 137-151 —
  påstår fel om att runtime inte läser dossier-kataloger. Avgränsa till
  "gäller gamla template-library-spåret, inte src/lib/gen/dossiers/*"
  ELLER arkivera filen helt.

Paket B — Pass 3 schema-härdning (~5 h):
- Steg 3.1-3.6 i planen ovan. Implementera AJV-validator, CI-script,
  ersätt 3 drift:ande kontrakt med 1.
- Acceptanskrav: npm run dossiers:validate-all i CI failas vid manifest-fel.

Båda paket är fristående och kan köras parallellt eller separat.

Källor:
- Aktiv dossier-spec: docs/architecture/dossier-system.md
- v2 flowchart: docs/llm/dossier-selection-flow.md
- Schema: docs/schemas/strict/dossier.schema.json
- Glossary: docs/architecture/glossary.md (uppdaterad 2026-04-21)
- Skill: .cursor/skills/sajtmaskin-context/SKILL.md
```

---

## Frågor (för cloudagent eller mig att svara på)

1. **D5 + D7:** Ska de gamla "external-pipeline"-docs **arkiveras helt** eller **skrivas om** mot dagens dossier-curation-flöde? (Mitt förslag: arkivera D5 hela, skriva om scope-paragrafen i D7.)
2. **D3 scaffold-system.md:** Behövs sektion 3-diagrammet alls? Eller räcker en länk till `dossier-system.md`?

---

## Cross-referenser

- Stale-fynden hittade av subagent-rapport 2026-04-21 (e7641ad5).
- Schema-rekommendationerna från subagent-rapport 2026-04-21 (9e58bd2d).
- Parity-fynden från subagent-rapport 2026-04-21 (31eacbe5).
- Parent-plan: [`llm-chain-cleanup-2026-04-21.md`](../../../.cursor/plans/llm-chain-cleanup-2026-04-21.md).
- Aktiv dossier-spec: [`docs/architecture/dossier-system.md`](../../architecture/dossier-system.md).
- Visuell layer: [`docs/llm/dossier-selection-flow.md`](../../llm/dossier-selection-flow.md).
- Strict-schema: [`docs/schemas/strict/dossier.schema.json`](../../schemas/strict/dossier.schema.json).

## Pass 1 — Doc-DRIFT (stale v1-referenser i kanonisk dokumentation)

**Risk:** medel. Vilseleder läsare och nya bidragsgivare. Ingen kod påverkas.

| # | Fil | Rad/sektion | Vad är fel | Sanning |
|---|-----|-------------|-----------|---------|
| D1 | `docs/architecture/glossary.md` | 141 vs 241 | Dubblettdefinition av "Dossier" — generisk vs v2-specifik | Behåll **en** entry som pekar på `dossier-system.md`. |
| D2 | `docs/architecture/glossary.md` | 279–291 | `_status`-tabell + `compat-test.ts --apply` är v1-livscykel; v2-schema har inga `_status`-fält | Märk sektionen som **historisk v1** eller flytta till `_archived/`. |
| D3 | `docs/architecture/scaffold-system.md` | 52, 62–90 | Diagram refererar `data/dossiers/<id>/` (utan hard/soft-delning), `selected_files/`, `template-library.generated.json`, `derive-variants-from-dossiers` | Skriv om sektion 3 mot v2-layout (`hard|soft` + capability-driven). Ta bort `recommendedScaffoldIds`-referens. |
| D4 | `docs/architecture/fas2-orchestration-and-build.md` | 139 | Pekar på `data/dossiers/_index/` som dossier-pipens huvudplats | Byt till `data/dossiers/{hard,soft}/` + `_index/capability-map.json` (genererad view). |
| D5 | `docs/external-pipelines/vercel-templates-structure.md` | 167–194, 222 | "Dossier-pipeline" + kategori-klassning + `compat-test`-flöde är v1 | Markera som **historisk v1-pipeline** eller skriv om mot dagens `npm run dossiers:curate`-flöde. |
| D6 | `docs/schemas/scaffold-contract.md` | 224 | Ersättare för Structural References pekar på `data/dossiers/_index/` som huvudplats | Byt till `data/dossiers/{hard,soft}/` (ev. nämn `_index` bara för capability-map). |
| D7 | `docs/schemas/external-template-pipeline-contract.md` | 137–151 | Påstår att runtime *inte* läser dossier-kataloger — fel för own-engine v2 | Avgränsa: gäller gamla template-library-spåret, **inte** `src/lib/gen/dossiers/*` (v2 läser `data/dossiers/{hard,soft}/` direkt). |
| D8 | `backoffice/pages/pipeline_health.py` | 252–260 | Docstring-exempel nämner `dossiers-embeddings` + `master.json` som output-paths att exkludera | Byt exempel till aktivt script (t.ex. `templates:embeddings`). Logiken är generisk; bara texten är vilseledande. |
| D9 | `backoffice/pages/_ops_impl.py` | 286–288 | "`npm run eval:suite` eller dossier-pipens egna evals" — inga dossier-evals finns | Ta bort bisatsen om dossier-evals. |

**Effort:** 1.5 h (text-edit + läsa diff).

---

## Pass 2 — Personliga / lokala anteckningar (lokal smaksak)

**Risk:** ingen — bara dina egna noteringar.

| # | Fil | Vad |
|---|-----|-----|
| P1 | `egna_kommandon.txt` rad 13–55 | Listar `dossiers:rebuild`, `dossiers:embeddings`, `dossiers:recommend:*` som inte längre finns. Uppdatera eller radera blocket. |
| P2 | `.cursorignore` rad 166 | `data/dossiers/_index/dossier-embeddings.json` — v1-artefakt, kan kommenteras ut eller flyttas under "legacy" med kommentar. |

**Effort:** 5 min.

---

## Pass 3 — Schema-härdning (en validator för alla ytor)

**Risk:** medel — kräver test efter. Stor långsiktig vinst.

### Problemet

Manifest-kontraktet finns i **tre** källor som drift:ar isär:

1. **`docs/schemas/strict/dossier.schema.json`** — strikt JSON Schema med `additionalProperties: false`, enums, regex. Använd:
   - I editor (IDE-validation via `$schema`).
   - Som dokumentation.
   - **Inte** vid runtime-load i `registry.ts`.
2. **`backoffice/pages/dossiers.py` `_validate_manifest`** (~rad 37–84) — handskriven Python-check på 7 fält + 2 enums. Svagare än JSON Schema.
3. **`scripts/dossiers/curate-from-reference.ts`** — OpenAI `json_schema` + `assertManifestShape` (~rad 140–176, 240–316). Egen mini-version.

`registry.ts` (~rad 60–117) parse:ar med `JSON.parse` + `as`-cast utan validering. Manifest-`id` används inte alls — `loadEntry` sätter `id` från **katalognamn** (~rad 91–93), så manifest-`id` kan tyst divergera från path.

### Lösningsförslag

#### Steg 3.1 — Gemensam validator (Node)

Lägg till `ajv` som dev-dep, skapa `src/lib/gen/dossiers/validate-manifest.ts`:

```ts
import Ajv, { type ValidateFunction } from "ajv";
import schema from "../../../../docs/schemas/strict/dossier.schema.json";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate: ValidateFunction = ajv.compile(schema);

export function validateDossierManifest(
  raw: unknown,
  context: { expectedId: string; class: "hard" | "soft" },
): { valid: true; data: DossierEntry } | { valid: false; errors: string[] } {
  const ok = validate(raw);
  const errors: string[] = [];
  if (!ok && validate.errors) {
    for (const e of validate.errors) errors.push(`${e.instancePath} ${e.message}`);
  }
  // Custom check: id matches directory
  if (typeof raw === "object" && raw !== null && (raw as { id?: unknown }).id !== context.expectedId) {
    errors.push(`manifest.id (${(raw as { id?: unknown }).id}) does not match directory name (${context.expectedId})`);
  }
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: raw as DossierEntry };
}
```

`registry.ts` kallar denna i `loadEntry`. CI-script `npm run dossiers:validate-all` walkar alla dossiers.

#### Steg 3.2 — `defaultForCapability`-unicitet

I CI-validatorn: gruppera alla dossiers per capability. Om > 1 har `defaultForCapability=true`, faila bygget. Idag bara `console.warn` i `select.ts` rad 70–75.

#### Steg 3.3 — `instructions.md`-rubriker

Validera att alla 5 sektioner finns: `# When to use`, `# How to integrate`, `# UX rules`, `# Avoid`, `# Verification`. Enkel markdown-heading-check i samma CI-script.

#### Steg 3.4 — Verbatim-fil-existens

För filer med effektiv `injectionMode === "verbatim"`: kontrollera att filen faktiskt finns på disk. Idag bara `console.warn` vid prompt-bygg (`system-prompt.ts` ~rad 852–862).

#### Steg 3.5 — Backoffice använder samma validator

`backoffice/pages/dossiers.py` `_validate_manifest` ersätts av subprocess-anrop till `node scripts/dossiers/validate-one.mjs <path>` ELLER inline schema-translation (mer komplex). Förstas alternativ är enklast.

#### Steg 3.6 — Curate genererar mot samma schema

`curate-from-reference.ts` läser `dossier.schema.json` direkt och bygger OpenAI `json_schema`-payload från det. Tar bort `assertManifestShape` mini-versionen.

### Acceptansgränser

- `npm run dossiers:validate-all` i CI — failas vid manifest-fel.
- Backoffice "Redigera"-tab visar exakta JSON Schema-felmeddelanden, inte handskrivna.
- 0 förekomster av `as DossierEntry`-cast i `registry.ts` utan föregående validering.
- Test: skapa medvetet trasig manifest (saknar `capability`) och bekräfta att alla tre ytor (CI, backoffice, curate) faila samma sätt med samma meddelande.

**Effort:** 4 h kod + 1 h test.

---

## Pass 4 — DEAD-spec-städning (DEFERRED)

**Risk:** låg ensam, **medium** att förena med pass 1 om docs ska säga "borttaget".

### Kandidat: `e2e/vercel-templates/scrape-catalog-light.spec.ts`

Refererar skript som inte finns (`scripts/dossiers/import-from-playwright.ts`, `import-from-light-catalog.ts`) och writar till v1-pipe-output. **Header uppdaterad 2026-04-21 med LEGACY-markering** (commit-meddelandet pekar på denna plan).

**Beslut behövs:** Behåll som referens (header räcker) eller flytta till `archive/dossiers-legacy-2026-04-20/` tillsammans med övriga v1-skript?

**Rekommendation:** Behåll i `e2e/`-trädet — om någon vill plocka upp template-scrapning för en framtida `data/template-references/`-curation är det mindre arbete att starta från specen än att skriva om från scratch.

---

## Pass-ordning (rekommenderad)

1. **Pass 2** (5 min) — quick wins som bara rör dina egna anteckningar.
2. **Pass 1** (1.5 h) — doc-drift. Lugn editing-session.
3. **Pass 4** (10 min beslut) — bara att bekräfta status.
4. **Pass 3** (5 h) — schema-härdning. Större jobb, gör i fokuserad session.

**Total:** ~7 h.

---

## Frågor som behöver beslut innan Pass 1

1. **Glossary `_status`-sektionen** (D2): radera eller flytta som "v1 historisk"?
2. **`scaffold-contract.md` (D6) + `external-template-pipeline-contract.md` (D7)** — ska dessa stå kvar som "extern pipeline" som inte längre är aktiv, eller arkiveras helt?

Lägg svaren i denna fil under en ny sektion "## Beslut" innan du börjar Pass 1.

---

## Cross-referenser

- Stale-fynden hittade av subagent-rapport 2026-04-21 (e7641ad5).
- Schema-rekommendationerna från subagent-rapport 2026-04-21 (9e58bd2d).
- Parity-fynden från subagent-rapport 2026-04-21 (31eacbe5).
- Parent-plan: [`llm-chain-cleanup-2026-04-21.md`](../../../.cursor/plans/llm-chain-cleanup-2026-04-21.md).
- Aktiv dossier-spec: [`docs/architecture/dossier-system.md`](../../architecture/dossier-system.md).
- Strict-schema: [`docs/schemas/strict/dossier.schema.json`](../../schemas/strict/dossier.schema.json).
