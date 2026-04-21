---
id: dossier-cleanup-2026-04-21
title: Dossier v2 — driftsupp + schema-härdning
status: planerad
created: 2026-04-21
priority: medium
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
parallel_safe_with: [E-easy-medium-layer, M-medium-hard-layer]
blocked_by: []
estimated_total_effort: ~6 timmar
---

# Dossier v2 — drift­fix + schema-härdning

Tre granskningar (stale-arkeolog, förenkling/scheman, parity) gjorda 2026-04-21 fann 11 städkandidater. **SAFE**-fixarna verkställdes direkt (commit-meddelandet listar dem). Den här filen samlar **MEDIUM** och **DEFERRED** i grupperade arbetspass så de kan plockas i en eller flera sessioner.

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
