# Dossier system (v2)

**Status:** Active. Replaces `dossier-format.md`, `dossier-promotion-flow.md`, and `dossier-pipeline-roadmap.md` (archived 2026-04-20). Schema: `docs/schemas/strict/dossier.schema.json`. Runtime: `src/lib/gen/dossiers/`.

## TL;DR

A dossier is a **reusable building block** the codegen LLM can drop into a generated site. The pipeline is **deterministic and capability-driven**: the brief declares which capabilities the site needs (`payments`, `auth`, `ai-chat`, `pricing-section`, …), and each capability resolves to exactly one dossier (or none).

No embeddings. No fuzzy matching. No category boost. No domain veto. What the brief asks for is what gets injected.

## Two classes (path-encoded)

```
data/dossiers/
  hard/<id>/manifest.json   # needs external secrets (Stripe, OpenAI, Postgres)
  soft/<id>/manifest.json   # self-contained (UI sections, R3F 3D, FAQ accordion)
  _index/capability-map.json   # generated view: capability → [ids]
```

| Class | When to use | Behavior |
|---|---|---|
| `hard` | The dossier needs `process.env` secrets to run (API keys, DB URLs). | Selection runs a preflight check on `envVars[].required`. If anything is missing, the dossier is still injected but the codegen LLM is told to render an "unconfigured" placeholder UI. |
| `soft` | Self-contained — only `npm` deps, no external accounts. | Always considered configured. |

## Two code-fidelities (per-dossier default + per-file override)

| Fidelity | When | Effect on prompt |
|---|---|---|
| `verbatim` | Integration glue where paraphrasing breaks the integration: webhook signing, OAuth callbacks, SDK init, middleware. | The file is rendered into the system prompt under `## Dossier Files To Emit Verbatim`. The codegen LLM **must** emit it byte-exact in its CodeProject output. |
| `rewritable` | UI components, layout patterns, render glue the LLM should adapt to the project. | The file is described in `instructions.md` and the codegen LLM may paraphrase freely. |

The dossier-level `codeFidelity` is the default. Individual files can override via `files[].injectionMode`.

## Manifest schema (4 required + basics)

```json
{
  "$schema": "../../../../docs/schemas/strict/dossier.schema.json",
  "id": "stripe-checkout",
  "label": "Stripe Checkout",
  "capability": "payments",
  "codeFidelity": "verbatim",
  "complexity": "medium",
  "defaultForCapability": true,
  "summary": "Hosted Stripe Checkout for one-time and subscription payments. …",
  "envVars": [{"key": "STRIPE_SECRET_KEY", "required": true, "enforcement": "build", "purpose": "API auth"}],
  "dependencies": ["stripe", "@stripe/stripe-js"],
  "files": [
    {"path": "components/checkout-button.tsx", "role": "client", "injectionMode": "rewritable"},
    {"path": "components/api/checkout-session/route.ts", "role": "server", "injectionMode": "verbatim"}
  ],
  "exposes": [{"name": "CheckoutButton", "type": "component", "import": "@/components/checkout-button"}],
  "lastVerified": "2026-04-20",
  "sourceRepoUrl": "https://github.com/..."
}
```

| Field | Required | Purpose |
|---|---|---|
| `id` | ✓ | Kebab-case, must match the directory name. |
| `label` | ✓ | Human label for backoffice. |
| `capability` | ✓ | Single kebab-case capability (matched against `brief.requestedCapabilities`). |
| `codeFidelity` | ✓ | `verbatim` or `rewritable` (default for files). |
| `complexity` | ✓ | `simple` / `medium` / `advanced`. |
| `summary` | ✓ | 1-3 sentences. Used in prompt + backoffice. |
| `lastVerified` | ✓ | ISO date YYYY-MM-DD when a human last validated the dossier. |
| `defaultForCapability` | optional (default `false`) | Tie-breaker when two dossiers share the same capability. |
| `envVars` | optional | External secrets needed at runtime. Each entry takes optional `enforcement` (P31): `"build"` (default — required for F3 build), `"feature-runtime"` (UI shows banner / popup at runtime, F3 reports as warning not blocker), or `"warn-only"` (component self-disables on empty value). See [glossary § EnvVar enforcement](./glossary.md#envvar-enforcement-p31). |
| `dependencies` | optional | npm packages added to `package.json`. |
| `files` | optional | Files injected into the project. Per-file `injectionMode` overrides dossier `codeFidelity`. |
| `exposes` | optional | Symbols the codegen LLM may import. |
| `sourceRepoUrl` | optional | Pointer to the upstream reference (typically under `data/template-references/`). |

## `instructions.md` template

Every dossier ships with a Markdown file the codegen LLM reads when the dossier is selected. Five fixed sections:

```markdown
# When to use
[1-3 bullets where this dossier is the right pick]

# How to integrate
[Numbered steps: import, env, mount-point]

# UX rules
[Feedback, validation, mobile, accessibility]

# Avoid
[Concrete don'ts that the LLM might naively try]

# Verification
[Manual smoke checks the developer can run]
```

Keep it **scaffold-agnostic** when the rule applies regardless of layout, and **scaffold-aware** when the integration depends on it (e.g. "if the scaffold has a sidebar, mount X there"). Avoid vague hedges.

## Selection algorithm

`selectDossiersForRequest(opts)` lives in `src/lib/gen/dossiers/select.ts`:

1. Read `requestedCapabilities` (from explicit option or `brief.requestedCapabilities`).
2. For each capability, find dossiers via `getDossiersByCapability(cap)`.
3. If multiple match, pick the one with `defaultForCapability=true`. Else the first by id-sort.
4. For hard dossiers, check `process.env` for required envVars → mark `configured: true|false`.
5. Eagerly load `instructions.md` for selected dossiers.

Output: `DossierSelectionResult` consumed by `src/lib/gen/system-prompt/` to render three blocks:

- `## Available Dossiers` — compact list of selected dossiers.
- `## Selected Dossier Instructions` — full `instructions.md` per dossier.
- `## Dossier Files To Emit Verbatim` — files whose effective injection mode is `verbatim`. Resolution: per-file `files[].injectionMode` overrides the dossier-level `codeFidelity`. So a `rewritable` dossier can still mark one file as `verbatim` (or vice-versa).

## Adding a new dossier

### Manually

1. Decide class: `hard` (needs secrets) or `soft` (self-contained).
2. Create `data/dossiers/<class>/<id>/manifest.json` matching the schema.
3. Write `data/dossiers/<class>/<id>/instructions.md` with the five sections.
4. Place files under `data/dossiers/<class>/<id>/components/...` matching `files[].path`.
5. Run `npm run typecheck` to validate manifest shape against `DossierEntry`.
6. Open the backoffice "Dossiers" page → "Capability map" tab → "Bygg om" to refresh `_index/capability-map.json`.

### AI-assisted from a template-reference repo

1. Clone the upstream repo into `data/template-references/repos/<reference-id>/` (or pick one already there from the legacy auto-pipeline).
2. Run:
   ```bash
   npm run dossiers:curate -- --reference=<reference-id> --class=hard --id=<dossier-id>
   ```
3. The script samples README, `package.json`, `.env.example`, and ~6 source files, then calls GPT to produce a draft `manifest.json` + `instructions.md`.
4. Review the draft in the backoffice Dossiers page (Redigera tab) and fix anything wrong before relying on it.
5. Bump `lastVerified` and remove the `notes` field once you've validated the dossier against a real preview build.

The script is intentionally one-at-a-time. Batch promotion was the source of pool-quality problems in the legacy pipeline.

## Disabling the pipeline

Set `SAJTMASKIN_DOSSIER_PIPELINE=false` in any environment to skip dossier selection entirely. The `## Available Dossiers` block disappears from the system prompt; the rest of the pipeline is unaffected.

**Code default (if env is unset):** on in all environments. Use `SAJTMASKIN_DOSSIER_PIPELINE=false` or `0` to opt out explicitly. See fallback in `src/lib/config.ts`.

**Current deploy status (as of 2026-04-23):** explicitly set to `true` on all three Vercel environments (Development, Preview, Production). The pipeline is active everywhere at runtime; to disable it on any environment, set the variable to `false` or `0` on that target.

## Files at a glance

| Path | Role |
|---|---|
| `data/dossiers/hard/<id>/`, `data/dossiers/soft/<id>/` | Manifests + instructions + components |
| `data/dossiers/_index/capability-map.json` | Generated view (backoffice + tooling) |
| `data/template-references/repos/<reference>/` | Cloned upstream repos (input to AI curation) |
| `data/template-references/_metadata/<reference>.github.json` | GitHub stars + last-pushed metadata for ranking |
| `src/lib/gen/dossiers/registry.ts` | Disk reader + mtime cache |
| `src/lib/gen/dossiers/select.ts` | Deterministic capability-driven selection |
| `src/lib/gen/dossiers/types.ts` | `DossierEntry`, `SelectedDossier`, `DossierSelectionResult` |
| `src/lib/gen/system-prompt/` | Renders the three dossier blocks into the system prompt |
| `scripts/dossiers/curate-from-reference.ts` | The single AI-curation script |
| `backoffice/pages/dossiers.py` | Backoffice UI for browsing + editing + curating |
| `archive/dossiers-legacy-2026-04-20/` | Old 96-dossier pool, 16-script pipeline, scaffold-recommendations, embeddings |
