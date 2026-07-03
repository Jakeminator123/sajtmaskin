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

Hard dossiers whose runtime crashes on missing/placeholder keys should additionally **key-gate themselves in the shipped files** — e.g. `clerk-auth/components/middleware.ts` only constructs `clerkMiddleware` when the keys are structurally valid and otherwise degrades to `NextResponse.next()` (placeholder keys must never 500 the whole preview). The `configured` flag from selection is a prompt signal, not a runtime guard.

### F2/F3-gräns: dossier-kontraktet är signalen (kanonisk)

Samma dossier kan spänna över F2 och F3 — det är inte två separata dossiers och det finns ingen extra `hard/soft/visual`-taxonomi som styr fasen:

- **F2 (design)** renderar en klient-/demo-/placeholder-safe version (visuell mockup).
- **F3 (integrations)** aktiverar den riktiga integrationen (riktiga env-värden krävs).

**Kanonisk signal i dagens kod** för "kräver F3" är dossierns eget kontrakt, via helpern [`dossierRequiresF3()`](../../src/lib/gen/dossiers/types.ts) (enda källan). Två regler:

1. **Env-kontrakt:** en `envVars`-post med `enforcement: "build"` (default när `enforcement` utelämnas) — Stripe/Clerk/OpenAI-klassen.
2. **Server-yta:** en `files[]`-post med `role: "server"` — dossiers som skeppar backend-wiring (API-route, middleware, server-config) hör till F3 även utan build-secret. Exempel: `resend-contact-form` (alla nycklar `feature-runtime`, men `/api/contact`-routen importerar `resend` som F2:s SDK-deny-lista strippar) och `mailchimp-newsletter`. I F2 renderas formuläret som visuell mockup enligt F2-kontraktet i `session-contracts.ts`; mejl/prenumeration aktiveras först i F3 ("Bygg integrationer").

[`getF3RequiredCapabilities()`](../../src/lib/gen/dossiers/registry.ts) räknar upp de capability-nycklar vars dossier kräver F3, och `orchestrate.ts` deriverar F2-mute-listan därifrån (union med policy-residualen `{analytics}` — icke-secret, server-fri integration som ändå ska F2-mutas, per [`env-flow-f2-mute`](../../.cursor/rules/env-flow-f2-mute.mdc)). En dossier med `envVars: []` och enbart klientfiler (t.ex. `interactive-game-loop`) är alltså **fullt F2-användbar**. Utöka gränsen i helpern om ett framtida fall behöver det — inte via en ny per-dossier-flagga eller separat hårdkodad lista.

## Two code-fidelities (per-dossier default + per-file override)

| Fidelity | When | Effect on prompt |
|---|---|---|
| `verbatim` | Integration glue where paraphrasing breaks the integration: webhook signing, OAuth callbacks, SDK init, middleware. | The file is rendered into the system prompt under `## Dossier Files To Emit Verbatim`. The codegen LLM **must** emit it byte-exact in its CodeProject output. |
| `rewritable` | UI components, layout patterns, render glue the LLM should adapt to the project. | The file is described via compact manifest-derived guidance in the prompt (see `promptInstructionMode` below) and the codegen LLM may paraphrase freely. |

The dossier-level `codeFidelity` is the default. Individual files can override via `files[].injectionMode`.

**Verbatim enforcement is two-layered.** The prompt block is layer 1; layer 2 is post-merge: `applyDossierVerbatimPolicy()` (`src/lib/gen/dossiers/verbatim-policy.ts`, called from `finalize-merge.ts`) restores any verbatim dossier file the LLM drifted from back to the canonical dossier source. On follow-ups, verbatim files already present in the project are listed under `## Dossier Verbatim Files Already in Project` instead of being re-rendered in full.

## Manifest schema (7 required + optional)

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
    {"path": "components/checkout-button.tsx", "role": "client", "injectionMode": "verbatim"},
    {"path": "components/integration-config-notice.tsx", "role": "shared", "injectionMode": "verbatim"},
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
| `envVars` | optional | External secrets needed at runtime. Each entry takes optional `enforcement` (P31): `"build"` (default — required for F3 build), `"feature-runtime"` (UI shows banner / popup at runtime, F3 reports as warning not blocker), or `"warn-only"` (component self-disables on empty value). See [glossary](../architecture/glossary.md). |
| `dependencies` | optional | npm packages added to `package.json`. |
| `files` | optional | Files injected into the project. Per-file `injectionMode` overrides dossier `codeFidelity`. |
| `exposes` | optional | Symbols the codegen LLM may import. |
| `sourceRepoUrl` | optional | Pointer to the upstream reference (typically under `data/template-references/`). |
| `notes` | optional | Curator-only free text (drafts from `dossiers:curate`); never reaches the prompt. Remove once validated. |
| `promptInstructionMode` | optional | How much of `instructions.md` reaches the prompt: `compact` (default — manifest-derived summary), `selected-sections`, or `full`. |

## `instructions.md` template

Every dossier ships with a Markdown file. Five standard sections — CI (`dossiers:validate-all` via `validate-manifest.ts`) **requires** the first two (`When to use`, `How to integrate`) and treats the other three (`UX rules`, `Avoid`, `Verification`) as recommended warnings:

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
- `## Selected Dossier Instructions` — per-dossier runtime instructions, rendered per `promptInstructionMode`: `compact` (default; manifest-derived summary), `selected-sections`, or `full` (the whole `instructions.md`). The full file is thus NOT injected by default.
- `## Dossier Files To Emit Verbatim` — files whose effective injection mode is `verbatim`. Resolution: per-file `files[].injectionMode` overrides the dossier-level `codeFidelity`. So a `rewritable` dossier can still mark one file as `verbatim` (or vice-versa). On follow-ups, verbatim files already in the project render as pointers under `## Dossier Verbatim Files Already in Project`.

## Adding a new dossier

### Manually

1. Decide class: `hard` (needs secrets) or `soft` (self-contained).
2. Create `data/dossiers/<class>/<id>/manifest.json` matching the schema.
3. Write `data/dossiers/<class>/<id>/instructions.md` with the five sections.
4. Place files under `data/dossiers/<class>/<id>/components/...` matching `files[].path`.
5. Run `npm run dossiers:validate-all` (canonical AJV validation + invariants; `typecheck` alone does not validate manifest JSON).
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

## Validation (canonical validator + capability-map status)

The **canonical** manifest validator is the Node/AJV `validateDossierManifest()`
in [`src/lib/gen/dossiers/validate-manifest.ts`](../../src/lib/gen/dossiers/validate-manifest.ts)
(strict `docs/schemas/strict/dossier.schema.json`). It runs in three places:

- **Runtime** — `registry.ts` excludes any manifest that fails it from the pool.
- **CI** — `npm run dossiers:validate-all` (blocking) plus exposes/import-closure,
  `defaultForCapability` uniqueness, instructions headings and SDK version pins.
- **Curation** — `dossiers:curate` validates the AI draft with the same function.

**Documented divergence:** the backoffice save path (`backoffice/pages/dossiers.py`,
`_validate_manifest`) does a lighter Python pre-check (required fields + enum
values) so the editor can give instant feedback without a Node round-trip. It is
intentionally a *subset* — a manifest can pass the Python pre-check and still be
rejected by the canonical Node/AJV validator in CI. Treat the Node validator as
source of truth; always run `npm run dossiers:validate-all` after editing a
manifest in the backoffice.

**Capability map:** `data/dossiers/_index/capability-map.json` is a **generated
view only** (backoffice + curation tooling); the runtime registry walks
`data/dossiers/{hard,soft}/` directly and never reads it. It is **not** CI-enforced
(the former `dossiers:capability-map:check` drift-gate was removed as maintenance
tax). Regenerate on demand with `npm run dossiers:capability-map:write` or the
backoffice "Bygg om" tab when curating.

## Disabling the pipeline

Set `SAJTMASKIN_DOSSIER_PIPELINE=false` (or `0`) in any environment to skip dossier selection entirely. With no selection there is no `DossierSelectionResult`, so **all** dossier blocks (`## Available Dossiers`, `## Selected Dossier Instructions`, `## Dossier Files To Emit Verbatim`) disappear from the system prompt; the rest of the pipeline is unaffected.

**Code default (if env is unset):** on in dev/preview/prod, **off under `NODE_ENV=test`** (`useDossierPipeline` in `src/lib/config.ts`). Per-environment opt-out via the env var on that Vercel target.

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
