# Integrations And Data Schema Surfaces

Formyta: vilka schemafiler och tabeller som **äger form**. Drift, kostnad och
backoffice-klick ägs av [`../contracts/data-layer.md`](../contracts/data-layer.md).
Full tabelluppsättning ägs av `src/lib/db/schema.ts` — kopiera inte inventariet hit.

## Canonical ownership

| Faktatyp | Ägare |
| --- | --- |
| Drizzle-typer | `src/lib/db/schema.ts` |
| CREATE TABLE / index runtime | `scripts/db/db-init.mjs` |
| Requestvalidering (create-chat, send-message, attachments, model-id) | `src/lib/validations/chat-schemas.ts` |
| Dossier-manifest | `src/lib/gen/dossiers/types.ts` + [`strict/dossier.schema.json`](./strict/dossier.schema.json) |
| Gallery templates (v0-mallar) | `src/lib/templates/template-data.ts` |
| DB-hälsa stdout | [`strict/db-health-check-report.schema.json`](./strict/db-health-check-report.schema.json) |
| Perf-index audit-rad | [`strict/db-perf-indexes-audit-line.schema.json`](./strict/db-perf-indexes-audit-line.schema.json) |
| Redis-hälsa stdout | [`strict/redis-health-check-report.schema.json`](./strict/redis-health-check-report.schema.json) |
| Schema-drift-test | `src/lib/db/schema-drift.test.ts` |

## Own-engine persistence (form)

Kanonisk kod per version: `engine_versions.files_json`. Live-preview-URL för
own-engine: `engine_versions.preview_url` (tom tills preview-session lyckats).

| Table | Form-relevant columns |
| --- | --- |
| `engine_chats` | session, scaffold, model, orchestration snapshot |
| `engine_messages` | history; assistant rows may carry `thinking` and `ui_parts` — [`chat-message-ui-parts.md`](./chat-message-ui-parts.md) |
| `engine_versions` | `files_json`, `repaired_files_json`, `preview_url`, lifecycle / verification |
| `engine_generation_logs` | token usage, duration, errors |
| `engine_version_error_logs` | per-version diagnostics |
| `generation_telemetry` | per-generation metrics (`preview_success`, `variant_id`, `meta`) |
| `project_data` | convenience snapshot (`demo_url`, `files`, `messages`, `meta`); not the version store |
| `company_profiles` | brand profile linked via `project_id`; API is owner-scoped |

HTTP-API för own-engine annonserar `previewUrl`, inte shim som primär `demoUrl`.
Legacy-shim är flaggade `/api/preview-render`-länkar. Se
[`preview-session-contract.md`](preview-session-contract.md).

## Request validation

`src/lib/validations/chat-schemas.ts` validerar create-chat, send-message,
attachments och inkommande model-id (via `ACCEPTED_MODEL_IDS`). Exakta enumvärden
kopieras inte hit.

## Template and dossier surfaces

| Surface | Path |
| --- | --- |
| Gallery catalog | `src/lib/templates/templates.json`, `template-categories.json`, `template-blob-manifest.json` |
| Dossier manifests | `data/dossiers/{hard\|soft}/<id>/manifest.json` |
| Dossier strict schema | [`strict/dossier.schema.json`](./strict/dossier.schema.json) |

Runtime-typer: `DossierEntry`, `DossierSelectionResult` i
`src/lib/gen/dossiers/types.ts`.
