# Documentation

`docs/` is the main home for human-readable documentation.

## Navigera `docs/` (tre block)

| Block | Innehåll | Börja här |
|-------|----------|-----------|
| **Arkitektur** | Kanonisk systembeskrivning, preview/VM, repo-träd | [`architecture/README.md`](architecture/README.md) · [`architecture/repo-tree.md`](architecture/repo-tree.md) · [`architecture/fas3-preview-and-deploy.md`](architecture/fas3-preview-and-deploy.md) |
| **Planer / status** | Aktivt eller avslutat planläge, status och pekare | [`plans/README.md`](plans/README.md) |
| **Arkiv** | Avklarade planer i git-historik; scratch-policy: [`documentation-lifecycle.md`](architecture/documentation-lifecycle.md) | [`plans/avklarat/README.md`](plans/avklarat/README.md) |

## Terminology (two layers — do not duplicate)

| Audience / topic | Canonical location | What it covers |
|------------------|-------------------|----------------|
| **Snabb förväxlingstabell (product/code names)** | `.cursor/rules/terminology.mdc` | Vanliga förväxlingar; pekar till glossaryn. |
| **Kanonisk ordlista (alla begrepp, LLM-pipeline, scaffold, preview, legacy)** | [`docs/architecture/glossary.md`](architecture/glossary.md) | Enda fullständiga terminologikällan: ~100 termer, livscykelstatus, namnskuggor, fasindelning, uppdateringspolicy. |
| **Repo layout & research pipeline** | `docs/architecture/repository-and-platform.md` | Mappar, skript, integrationer; mermaid där det behövs. |
| **Dokumentationspolicy (var saker ska ligga)** | `docs/architecture/documentation-lifecycle.md` | Planstatus, rensning, varför policy ligger i `docs/` inte bara i `.cursor/rules/`. |

**Rule:** Nya begrepp → registrera i `docs/architecture/glossary.md`. Vanliga förväxlingar → `terminology.mdc` (kort). Mapp-/pipeline-detaljer → `repository-and-platform.md`. Länka; duplicera inte.

## Quick path (when `docs/` feels heavy)

1. This file → **Key navigation** table below.
2. [`docs/architecture/repo-tree.md`](architecture/repo-tree.md) — **snabb rot-orientering** (agenter: var mappar ligger; `data/` vs `src/lib/gen/data/`).
3. `docs/plans/README.md` — **planläge och aktiva spår**. Äldre avslutade planer ligger i `docs/plans/avklarat/README.md` eller i git-historik. **Preview/VM:** [`docs/architecture/fas3-preview-and-deploy.md`](architecture/fas3-preview-and-deploy.md) (operativt kördokument; levererat § där). **Vit preview / tom iframe:** [`docs/architecture/preview-white-screen-runbook.md`](architecture/preview-white-screen-runbook.md).
4. `docs/architecture/README.md` + [`system-overview.md`](architecture/system-overview.md) — motor/builder-översikt.
5. `docs/schemas/README.md` — which schema doc to open; then **one** schema file for your task.
6. `docs/ENV.md` — kort env-översikt (must-have / valfritt / pekare till `src/lib/env.ts` och `config/env-policy.json`).

**Remediation-historik** (%, orchestrator-körningar) finns i **git-historik** under `docs/plans/avklarat/` — se [`docs/plans/avklarat/README.md`](plans/avklarat/README.md).

Everything else is deep reference, history, or architecture.

**Folder map:** `architecture/` → [`architecture/README.md`](architecture/README.md) · [`architecture/repo-tree.md`](architecture/repo-tree.md) (rot-träd) · `config/` → [`../config/README.md`](../config/README.md) (prompt, modeller, env-policy, dashboard) · `schemas/` → [`schemas/README.md`](schemas/README.md) · `plans/` → [`plans/README.md`](plans/README.md). Doc-policy: [`architecture/documentation-lifecycle.md`](architecture/documentation-lifecycle.md).

**För agenter (orientering):** [`architecture/repo-tree.md`](architecture/repo-tree.md) → [`plans/README.md`](plans/README.md) → [`architecture/glossary.md`](architecture/glossary.md) → [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc).

## Source of truth policy

Human docs in this folder explain the system, but runtime truth still lives in
code.

Important code sources of truth include:

- `src/lib/templates/template-data.ts`
- `src/lib/db/schema.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/models/catalog.ts` — build profiles and model IDs (own engine)
- `config/ai_models/manifest.json` — committed defaults for own-engine models per profile, assist/polish defaults, token budgets, timeouts, workload metadata (`src/lib/ai-models/load-manifest.ts`; env overrides). Human guide: `config/ai_models/_READ_ME_FIRST.md`.
- `src/lib/models/selection.ts` — model resolution for requests
- `src/lib/own-engine/*`, `src/lib/providers/own-engine/*`, `src/lib/gen/*` — kanoniska kallytor for den egna generationmotorn och dess delade karna.
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/template-library/types.ts`
- `package.json`

### Environment variable management

| File                     | Committed       | Purpose                                                                                                                            |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `config/env-policy.json` | Yes             | Shared policy: classification, target rules, known-empty-ok lists. Consumed by `manage_env.py` and `src/lib/env-audit.ts`.         |
| `src/lib/env.ts`         | Yes             | Zod schema declaring every env var the app can read.                                                                               |
| `src/lib/env-audit.ts`   | Yes             | Runtime audit logic that loads `config/env-policy.json`.                                                                           |
| `ENV.md`                 | Yes             | Kort översikt (must-have, lokalt vs Vercel); full lista = `src/lib/env.ts` + `config/env-policy.json`.                             |
| `.env.local`             | No (gitignored) | Local development values.                                                                                                          |
| `.env.production`        | No (gitignored) | Reference copy of production-like values.                                                                                          |
| `scripts/env/manage_env.py` | Yes          | Canonical env CLI: interactive control panel + status/add/set/push/pull/audit (`--strict`) + `reconcile` for Vercel drift cleanup. |
| `scripts/env/model_trace_overlay.py` | Yes | Focused helper that syncs GUI-facing model env vars in `.env.local` and opens the builder model-trace overlay. |
| ~~`check_env.py`~~ | Removed | Was a thin wrapper — use `python scripts/env/manage_env.py audit` directly.                                                     |

When adding a new env var: add it to `src/lib/env.ts` (schema), then to
`config/env-policy.json` (classification + target rules). Uppdatera `ENV.md` bara om nyckeln är **central för onboarding** (annars räcker kod + policy).

## Production boundary

The deployed app on Vercel should read committed artifacts and runtime code, not
local research helpers.

Good production inputs:

- files committed under `docs/`
- generated scaffold research metadata in
  `src/lib/gen/scaffolds/scaffold-research.generated.json`
- runtime manifests and code under `src/`

Not runtime dependencies:

- Optional Cursor MCP integrations (v0/Vercel/OpenAI APIs — see `.cursor/README.md`). **Human project documentation lives in `docs/` and the repo; there is no MCP that replaces reading those files.** Lokala MCP-servrar under `tools/mcp/` finns **inte** längre; repoets egna flöden förstås via `docs/`, `.cursor/rules/` och kodbasen.
- historical helper references under `tools/` / `doc-browser` when reading older docs or git history; there is no active `tools/` directory in the current tree
- raw discovery under `data/external-template-pipeline/raw-discovery/current/`
- local shallow clone cache under `data/external-template-pipeline/repo-cache/`
- raw local `_sidor` datasets
- local template-library generation helpers and embeddings artifacts when they are only used for curation/validation

## Key navigation

| What you need | Where to look |
|---|---|
| **Rot-träd** (snabb: var mappar ligger) | [`docs/architecture/repo-tree.md`](architecture/repo-tree.md) |
| **Arkitektur** (fyra kapitel) | [`docs/architecture/README.md`](architecture/README.md) |
| System / motor / builder-entry | [`docs/architecture/system-overview.md`](architecture/system-overview.md) |
| Generation, prompt, modellval, SSE, UX-kontrakt | [`docs/architecture/fas2-orchestration-and-build.md`](architecture/fas2-orchestration-and-build.md) |
| **LLM-flöde målbild** (vart vi siktar) | [`docs/architecture/llm-flow-target-worldclass.md`](architecture/llm-flow-target-worldclass.md) |
| LLM-roller och signallager | [`docs/schemas/llm-role-matrix.md`](schemas/llm-role-matrix.md), [`docs/schemas/orchestration-signal-contract.md`](schemas/orchestration-signal-contract.md), [`docs/architecture/llm-signal-flow.md`](architecture/llm-signal-flow.md) |
| Fas 2: orkestrering, LLM-input, finalize / validate / verifier / preflight | [`docs/architecture/fas2-orchestration-and-build.md`](architecture/fas2-orchestration-and-build.md) |
| Fas 3: preview, VM, quality-gate, deploy | [`docs/architecture/fas3-preview-and-deploy.md`](architecture/fas3-preview-and-deploy.md) |
| Mappar, terminologi, integrationer, kända fel, mallar | [`docs/architecture/repository-and-platform.md`](architecture/repository-and-platform.md) |
| Plans (all buckets) | `docs/plans/README.md` |
| Plan / agent handoff (historik) | Borttagen — git-historik. Handoffs sker i chatten. |
| Storstädning / äldre större pass | `docs/plans/avklarat/README.md` eller git-historik |
| Äldre remediation / orchestrator-text | git-historik — [`docs/plans/avklarat/README.md`](plans/avklarat/README.md) |
| Agent workflows (fler agenter, konfliktzoner) | [`.cursor/README.md`](../.cursor/README.md) § Flera agenter |
| Terminology (product + code names) | `.cursor/rules/terminology.mdc` |
| Terminology (folders + research flow) | [`repository-and-platform.md`](architecture/repository-and-platform.md) |
| Vercel Templates discovery + Playwright + scaffolds | [`scripts/README.md`](../scripts/README.md), [`e2e/README.md`](../e2e/README.md), [`docs/schemas/external-template-pipeline-contract.md`](schemas/external-template-pipeline-contract.md) |
| Builder entry contract | `docs/schemas/builder-entry-contract.md` |
| Marketing sidor (landning footer) | `/om`, `/blogg`, `/faq` (App Router under `src/app/`) |
| Env setup | `docs/ENV.md` |
| Config GUI (Streamlit) och var `config/` vs `docs/` bor | `config/dashboard/` (`run.ps1`), `config/dashboard/domain-map.json` |
| Orchestrator protocol (historical; tooling removed) | git-historik (`git log -- docs/architecture/`) — inget aktivt protokoll i trädet |
