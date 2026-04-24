---
id: cloudagent-paket-B-schema-validation
title: Cloudagent Paket B — Dossier-manifest schema-härdning (en AJV-validator)
status: redo-för-cloudagent
created: 2026-04-21
priority: medium
parent_plan: docs/plans/avklarat/dossier-cleanup-2026-04-21.md
parallel_safe_with: [cloudagent-paket-A-doc-rewrite]
blocked_by: []
estimated_effort: 5 timmar (4 h kod + 1 h test/CI-wire-in)
suggested_runner: cloudagent (kräver test-körning, npm install av ajv)
---

# Cloudagent Paket B — Dossier-manifest schema-härdning

## Problemet

Manifest-kontraktet finns i **tre** källor som drift:ar isär:

1. **`docs/schemas/strict/dossier.schema.json`** — strikt JSON Schema med `additionalProperties: false`, enums, regex. Används bara för IDE-validation via `$schema` och som dokumentation. **Inte** vid runtime-load.
2. **`backoffice/pages/dossiers.py` `_validate_manifest`** (~rad 37–84) — handskriven Python-check på 7 fält + 2 enums. Svagare än JSON Schema.
3. **`scripts/dossiers/curate-from-reference.ts`** — OpenAI `json_schema` + `assertManifestShape` (~rad 140–176, 240–316). Egen mini-version.

**Konsekvens:** `registry.ts` (~rad 60–117) parse:ar manifest med `JSON.parse` + `as`-cast utan validering. Manifest-`id` används aldrig — `loadEntry` sätter `id` från katalognamn, så manifest-`id` kan tyst divergera utan att någon märker det. Backoffice "Redigera"-tab visar svagare felmeddelanden än CI skulle ge.

## Lösning — en AJV-validator över alla tre ytor

### Steg 1 — Lägg till `ajv` som dev-dep

```bash
npm install --save-dev ajv@^8
```

Versionen är låst till `^8` (draft-07 stöd, stabilt API).

### Steg 2 — Skapa `src/lib/gen/dossiers/validate-manifest.ts`

```ts
import Ajv, { type ValidateFunction } from "ajv";
import schema from "../../../../docs/schemas/strict/dossier.schema.json";
import type { DossierEntry } from "./types";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate: ValidateFunction = ajv.compile(schema);

export interface DossierValidationContext {
  expectedId: string;
  class: "hard" | "soft";
}

export type DossierValidationResult =
  | { valid: true; data: DossierEntry; warnings: string[] }
  | { valid: false; errors: string[] };

export function validateDossierManifest(
  raw: unknown,
  context: DossierValidationContext,
): DossierValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ok = validate(raw);
  if (!ok && validate.errors) {
    for (const e of validate.errors) {
      errors.push(`${e.instancePath || "/"} ${e.message}`);
    }
  }

  if (typeof raw === "object" && raw !== null) {
    const id = (raw as { id?: unknown }).id;
    if (id !== context.expectedId) {
      errors.push(
        `manifest.id (${JSON.stringify(id)}) does not match directory name (${context.expectedId})`,
      );
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: raw as DossierEntry, warnings };
}
```

### Steg 3 — Wire in `validateDossierManifest` i `registry.ts`

`loadEntry` ska kalla validatorn och **vägra ladda** dossier som inte validerar (logga fel + skip). Detta tar bort `as DossierEntry`-cast utan validering.

Före (~rad 90–117):
```ts
const raw = JSON.parse(fileContent) as DossierEntry;
return { ...raw, id: dirName, class: classification };
```

Efter:
```ts
const raw = JSON.parse(fileContent);
const result = validateDossierManifest(raw, { expectedId: dirName, class: classification });
if (!result.valid) {
  console.warn(`[dossiers] skipping ${classification}/${dirName}: ${result.errors.join("; ")}`);
  return null;
}
return { ...result.data, id: dirName, class: classification };
```

`getAllDossiers` filtrerar `null`-resultat.

### Steg 4 — CI-script `npm run dossiers:validate-all`

Lägg i `package.json`:
```json
"dossiers:validate-all": "npx tsx scripts/dossiers/validate-all.ts"
```

Skript:
```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateDossierManifest } from "../../src/lib/gen/dossiers/validate-manifest";

const root = "data/dossiers";
const classes = ["hard", "soft"] as const;
let failures = 0;

for (const klass of classes) {
  const dir = join(root, klass);
  for (const entry of readdirSync(dir)) {
    const manifestPath = join(dir, entry, "manifest.json");
    try { statSync(manifestPath); } catch { continue; }
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const result = validateDossierManifest(raw, { expectedId: entry, class: klass });
    if (!result.valid) {
      console.error(`✗ ${klass}/${entry}`);
      for (const err of result.errors) console.error(`    ${err}`);
      failures++;
    } else {
      console.log(`✓ ${klass}/${entry}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} dossier(s) failed validation`);
  process.exit(1);
}
console.log(`\nAll ${classes.length} class(es) validated.`);
```

Lägg `dossiers:validate-all` i `devtest`-kedjan i `package.json` så det körs automatiskt.

### Steg 5 — Cross-cutting checks utöver schema

I `validate-all.ts`:

#### 5.1 `defaultForCapability` är unik per capability

Gruppera alla validerade dossiers per `capability`. Om > 1 har `defaultForCapability=true`, faila bygget.

#### 5.2 `instructions.md` har de 5 obligatoriska H1-rubrikerna

För varje dossier-mapp: läs `instructions.md`, parsa rubriker, kontrollera att alla av `# When to use`, `# How to integrate`, `# UX rules`, `# Avoid`, `# Verification` finns.

#### 5.3 Verbatim-fil måste finnas på disk

För varje fil i `manifest.files[]` med effektiv `injectionMode === "verbatim"`: kontrollera `existsSync(join(dossierDir, file.path))`. Faila annars.

### Steg 6 — Backoffice anropar samma validator

`backoffice/pages/dossiers.py` `_validate_manifest` ersätts av subprocess till en liten Node-helper:

```bash
node scripts/dossiers/validate-one.mjs <path-to-manifest.json> <expected-id> <hard|soft>
```

Som returnerar JSON `{ valid, errors }`. Detta tar bort 50 rader Python-validering och ger backoffice exakt samma felmeddelanden som CI.

### Steg 7 — `curate-from-reference.ts` använder samma schema

Importera `dossier.schema.json` direkt och bygg OpenAI `json_schema`-payload från det. Tar bort `assertManifestShape` mini-versionen i den filen.

```ts
import schema from "../../docs/schemas/strict/dossier.schema.json";
// I OpenAI-anropet:
response_format: { type: "json_schema", json_schema: { name: "DossierManifest", schema, strict: true } }
```

Sen kallas `validateDossierManifest` på resultatet före skrivning, samma som registry-vägen.

## Acceptansgränser

- `npm run dossiers:validate-all` failar bygget vid manifest-fel.
- Kör `dossiers:validate-all` mot nuvarande pool (7 dossiers) — alla ska passera.
- Test: skapa medvetet trasig manifest (saknar `capability`) i en testfixture, kör validatorn, bekräfta att den failar med exakt felmeddelande.
- Backoffice "Dossiers → Redigera"-tab visar AJV-felmeddelandena (jämför mot tidigare).
- 0 förekomster av `as DossierEntry`-cast i `registry.ts` utan föregående validering.
- `defaultForCapability=true` finns på max en dossier per capability.
- `instructions.md` saknar inte rubriker.
- Alla `injectionMode: "verbatim"`-filer existerar på disk.

## Källor cloudagent ska läsa

- `src/lib/gen/dossiers/registry.ts` (ändringspunkt)
- `src/lib/gen/dossiers/select.ts` (förståelse för selection-flödet)
- `src/lib/gen/dossiers/types.ts` (`DossierEntry`)
- `src/lib/gen/dossiers/registry.test.ts` (test-mönster att följa)
- `docs/schemas/strict/dossier.schema.json` (schema-källan)
- `docs/architecture/dossier-system.md` (kontextuell spec)
- `backoffice/pages/dossiers.py` `_validate_manifest` (rad 37–84, ersättas)
- `scripts/dossiers/curate-from-reference.ts` `assertManifestShape` (~rad 140–176, ersättas)

## Cloudagent-prompt

```
Du är cloudagent och tar Paket B — Dossier-manifest schema-härdning.
Plan: docs/plans/active/cloudagent-paket-B-schema-validation.md

Mål: ersätt tre drift:ande manifest-kontrakt (JSON Schema som inte körs,
Python _validate_manifest, TS assertManifestShape) med EN AJV-validator
som körs i registry-load, CI och backoffice.

Steg i plan-filen:
  1. npm install --save-dev ajv@^8
  2. Skapa src/lib/gen/dossiers/validate-manifest.ts
  3. Wire in i registry.ts (vägra ladda invalid manifest)
  4. CI-script: npm run dossiers:validate-all + lägg i devtest
  5. Cross-cutting checks: defaultForCapability-unicitet,
     instructions.md-rubriker, verbatim-fil-existens
  6. Backoffice anropar samma validator (subprocess till node-helper)
  7. curate-from-reference.ts använder samma schema

Acceptanskrav i plan-filen. Kör tester efter varje steg.
Commit + push när klart. Flytta sedan denna plan från active/ till avklarat/.
```

---

**När detta är klart:** flytta filen till `docs/plans/avklarat/cloudagent-paket-B-schema-validation.md` med slutstatus.
