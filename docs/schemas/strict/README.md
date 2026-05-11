# Strict Schemas

Machine-oriented contract mirrors for Sajtmaskin.

Rules:

- Back every schema with a real code source of truth.
- Do not treat strict schemas as runtime truth when code disagrees.
- Prefer one concern per JSON Schema file.
- Keep human explanations in `docs/schemas/*.md`.

## Available Schemas

| Schema | Validates | Source of truth | Runtime check? |
|--------|-----------|-----------------|----------------|
| `dossier.schema.json` | `data/dossiers/<class>/<id>/manifest.json` | `src/lib/gen/dossiers/types.ts` + `validate-manifest.ts` | **Yes** — AJV in `validate-manifest.ts` |
| `scaffold-variant.schema.json` | `config/scaffold-variants/<scaffoldId>/*.json` | `src/lib/gen/scaffold-variants/types.ts` | Editor-only (runtime in `registry.ts`) |
| `preview-session-contract.schema.json` | Preview session objects (machine-readable spec, not a draft-07 schema) | See file | No — TS contracts are source of truth |
| `plan-file.schema.json` | YAML frontmatter for `docs/plans/active/P*.md` | Manual / P27 master orchestrator | No automated runner today |
| `db-health-check-report.schema.json` | stdout-payload from `scripts/db/db-health-check.mjs` | `scripts/db/db-health-check.mjs` | CI: AJV mot fixtures (`src/lib/db/health-schemas.test.ts`). Ingen live-DB-validering i CI; manuell roundtrip-validering kan köras lokalt med `node scripts/db/db-health-check.mjs \| ajv …` |
| `redis-health-check-report.schema.json` | stdout-payload from `scripts/db/redis-health-check.mjs` | `scripts/db/redis-health-check.mjs` | CI: AJV mot fixtures. Manuell live-roundtrip lokalt. |
| `db-perf-indexes-audit-line.schema.json` | One NDJSON line per run of `scripts/db/add-performance-indexes.mjs` (logged to `data/observability/db-perf-indexes-runs.ndjson`) | `scripts/db/add-performance-indexes.mjs` | CI: AJV mot fixtures. NDJSON-rader skrivs av skriptet vid varje körning men valideras inte runtime. |
| FaultEvent / fault-promotion report | CLI stdout från `npm run faults:report` (read-only rapport, ingen persisted JSON-fil) | `src/lib/observability/fault-events.ts` + `fault-promotion-report.ts` | No — TS types + unit tests, ingen strict schema eftersom rapporten är human-readable stdout |

### LLM-flöde telemetri-event schemas

Dessa schemas dokumenterar events/signaler som introducerats i LLM-flöde-körplanen.
De flesta skrivs via `devLogAppend` till `logs/generationslogg/*/timeline.ndjson`
(kräver `GENERATIONSLOGG=true`), men vissa skrivs till befintlig DB-diagnostik
eller debug-logg. Kanal anges per rad. Backoffice-sidan `LLM-flöde telemetri`
läser och aggregerar de NDJSON-signaler den kan se.

| Schema | Event type | Emitteras av | Kanal | Runtime check? |
|--------|-----------|--------------|-------|----------------|
| `llm-fixer-aborted.schema.json` | `llm_fixer_aborted` | `src/lib/gen/autofix/llm-fixer.ts` | `devLogAppend` → NDJSON | No — observability-only |
| `dossier-verbatim-restored.schema.json` | `dossier_verbatim_restored` | `src/lib/gen/dossiers/verbatim-policy.ts` | `devLogAppend` → NDJSON | No — observability-only |
| `llm-fixer-partial-response.schema.json` | `llm_fixer_partial_response` | `src/lib/gen/autofix/llm-fixer.ts` | `devLogAppend` → NDJSON | No — observability-only |
| `site-done-telemetry.schema.json` | `site.done` (subset-kontrakt för telemetri) | `src/lib/providers/own-engine/generation-stream-post-finalize.ts` | `devLogAppend` → NDJSON | No — observability-only |
| `site-aborted.schema.json` | `site.aborted` (transport-/connection-/provider-abort innan version skapats) | `src/lib/gen/stream/stream-format.ts`, `src/lib/observability/prompt-to-done-stream.ts`, `src/lib/logging/generation-log-writer.ts` (staleness) | `devLogAppend` → NDJSON | No — observability-only; konsumeras av `resolveStatusDetails` → `status=aborted` |
| `product-postcheck.schema.json` | `product_postcheck.*` | `src/lib/gen/verify/product-postcheck.ts` + `src/lib/hooks/chat/post-checks.ts` | `engine_version_error_logs` via befintlig `persistVersionErrorLogs()` | No — observability-only |
| `image-replaced-with-placeholder.schema.json` | `image_replaced_with_placeholder` | `src/lib/utils/image-validator.ts` | **`debugLog` (console)** — ej NDJSON | No — forward-deklaration |
| `dossier-stub-created.schema.json` | `dossier_stub_created` / `crossFileStubs` | `src/lib/providers/own-engine/generation-stream-post-finalize.ts` | **DB** (`engine_version_error_logs`, category `merge:cross-file-stub`) | No — forward-deklaration |

**Obs för `image-replaced-with-placeholder` och `dossier-stub-created`:** dessa schemas
är forward-deklarationer — de dokumenterar den planerade event-strukturen men de
emitteras ännu inte via `devLogAppend` till NDJSON. Se respektive schema-fil för detaljer.

### `scaffold-variant.schema.json`

Validates scaffold variant JSON files — the visual expressions (typography,
color palette, motif, prompt hints) that a scaffold can take.

**How to use in a variant file:**

```json
{
  "$schema": "../../../docs/schemas/strict/scaffold-variant.schema.json",
  "id": "my-variant",
  "scaffoldId": "landing-page",
  ...
}
```

Adding `$schema` gives you:

- **Autocomplete** in VS Code / Cursor for all fields
- **Inline validation** (red squiggles) for typos, wrong types, missing required fields
- **Hover docs** showing field descriptions

The schema enforces:

- Required fields: `id`, `scaffoldId`, `label`, `signatureMotif`, `colorMode`, `keywords`, `fontPairings`, `promptHints`
- `id` must be kebab-case
- `scaffoldId` must be one of the current runtime scaffold IDs
- Array length limits on all list fields
- `colorMode` restricted to `light` | `dark` | `either`

The schema does **not** replace runtime validation in `registry.ts` — it mirrors
it for editor tooling.
