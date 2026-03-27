# Prompt Tree — Full Pipeline from Builder UI to Generation

> Senast uppdaterad: 2026-03-24

**Narrower scope:** `docs/architecture/builder-prompt-layer.md` covers only the
`prompt-builder` / placement path for picker-driven inserts — not the whole tree
below.

---

This document maps every prompt-related parameter, file, and transformation
from user input in the builder UI to the final system prompt consumed by the
generation engine. Use it to understand what controls what, where duplication
exists. Builder codegen is own-engine only; `V0_FALLBACK_BUILDER` affects preview URL preference, not this tree.

## High-level flow

```
Builder UI state
       │
       ▼
Prompt Orchestration (client-side message shaping)
       │
       ▼
API Route (/api/v0/chats/stream or /api/v0/chats/[chatId]/stream)
       │
       ├─► Request Metadata extraction (attachments, brief, theme, scaffold settings)
       │
       ├─► Codegen path: own-engine only (`createGenerationPipeline` → `engine.ts`)
       │
       ▼
Orchestrate Context (prepareGenerationContext)
       │
       ├─► Scaffold resolution (auto/manual/off)
       ├─► Route planning
       ├─► Capability inference
       ├─► Pre-generation contract inference
       │
       ▼
buildSystemPrompt()
       │
       ├─► STATIC_CORE (cached, identical every request)
       ├─► Dynamic context (per-request)
       │     ├─ Custom instructions
       │     ├─ Build intent guidance
       │     ├─ Scaffold context + research priorities
       │     ├─ Route plan
       │     ├─ Pre-generation contracts
       │     ├─ Project context (from brief)
       │     ├─ Visual identity (theme, palette, typography)
       │     ├─ Design references (Figma/image)
       │     ├─ Imagery rules
       │     ├─ Media catalog
       │     ├─ SEO metadata
       │     ├─ Knowledge base matches
       │     ├─ Template library references + code snippets
       │     └─ Original request echo
       │
       ▼
Generation stream (own engine) or v0 enrichment context (fallback)
```

## Efter generering: demo-URL och preview (own engine)

När streamen finaliserat en version skickas **`done`** med `demoUrl` som i första läget pekar på **`/api/preview-render`** (snabb HTML-shim). Om Vercel Sandbox är konfigurerad kan **`sandbox-ready`** komma strax efter och ersätta `demoUrl` med en riktig Next.js-runtime. Fel från t.ex. `npm install` kommer som **`build-error`**.

Statiska promptfragment under `config/prompt-static/` (via [`codegen-static-prompt.json`](../../../../config/codegen-static-prompt.json)) ska vara **paritetiska** med det målet: full `next build`, inte bara shim. Se **[preview-and-sandbox-flow.md](./preview-and-sandbox-flow.md)** för sekvens, MCP-skillnad och lagring (`sandbox_url`).

## Layer 1 — Builder UI State

**Files:**
- `src/app/builder/useBuilderState.ts` — central React state store
- `src/app/builder/useBuilderPageController.ts` — side-effects, localStorage sync, URL init
- `src/components/builder/BuilderHeader.tsx` — model tier, scaffold, custom instructions UI

**Prompt-relevant state values:**

| State key | Type | Persisted where | Consumed by |
|-----------|------|-----------------|-------------|
| `buildMethod` | `wizard \| category \| audit \| freeform \| kostnadsfri` | URL `?buildMethod=` (read-only on init) | promptOrchestration, route |
| `buildIntent` | `website \| app \| template` | URL `?buildIntent=` (read-only on init) | orchestrate, system-prompt |
| `selectedModelTier` | `fast \| pro \| max \| codex` | localStorage per chat | route, model selection |
| `scaffoldMode` | `auto \| manual \| off` | in-memory | orchestrate |
| `scaffoldId` | `string \| null` | in-memory | orchestrate |
| `designTheme` | theme preset string | localStorage `sajtmaskin:designTheme` | orchestrate → system-prompt |
| `designSystemId` | `string` | localStorage `sajtmaskin:designSystemId` | route → v0-generator (v0 only) |
| `customInstructions` | `string` | in-memory (prefilled from defaults) | orchestrate → system-prompt |
| `promptAssistModel` | `string` | in-memory | prompt assist preprocessing |
| `promptAssistDeep` | `boolean` | in-memory | prompt assist preprocessing |
| `enableImageGenerations` | `boolean` | localStorage per chat | route, system-prompt |
| `enableThinking` | `boolean` | localStorage `sajtmaskin:thinking` | route |

## Layer 2 — Prompt Orchestration (message shaping)

**File:** `src/lib/builder/promptOrchestration.ts`

Runs on the server in the API route. Takes the raw user message and shapes it
based on prompt type and budget constraints.

**Input:** `OrchestratePromptInput` — message, buildMethod, buildIntent,
isFirstPrompt, attachmentsCount, promptSourceKind, promptSourceTechnical,
promptSourcePreservePayload.

**Output:** `OrchestratePromptResult` — `finalMessage` + `strategyMeta`.

**Strategy selection:**
1. `direct` — message fits budget or must be preserved (registry payload, technical content)
2. `summarize` — over budget, condenses to key requirements
3. `phase_plan_build_polish` — very large/complex prompt, restructured as phased execution

**Prompt type detection** (from buildMethod/buildIntent):
- `audit` → generous budget, phased if very large
- `wizard` → structured input, separate budget
- `freeform` / `kostnadsfri` → standard budget
- `template` / `category` → compact budget
- `followup_general` / `followup_technical` → follow-up budgets

## Layer 3 — API Route (wiring)

**Files:**
- `src/app/api/v0/chats/stream/route.ts` — create chat + stream
- `src/app/api/v0/chats/[chatId]/stream/route.ts` — follow-up in existing chat

**What happens:**
1. Parse and validate request body via `createChatSchema`
2. Extract metadata: `extractBriefFromMeta`, `extractThemeColorsFromMeta`,
   `extractDesignThemePresetFromMeta`, `extractScaffoldSettingsFromMeta`,
   `extractPaletteStateFromMeta`, `summarizeDesignReferences`
3. Run `orchestratePromptMessage()` on the raw message
4. Resolve model selection via `resolveModelSelection()`
5. Check credits
6. Branch: own-engine vs v0-fallback (via `shouldUseV0Fallback()`)

**For own-engine path:**
- Call `prepareGenerationContext()` → get full `OrchestrationResult`
- Optionally run plan mode via `buildPlannerSystemPrompt()`
- Stream via `createOwnEngineGenerationStream()`

**For v0-fallback path:**
- Call `prepareGenerationContext()` → use `v0EnrichmentContext` as `system` param
- Stream via `createV0FallbackStream()`

## Layer 4 — Generation Context Orchestration

**File:** `src/lib/gen/orchestrate.ts`

Single entry point: `prepareGenerationContext(input: OrchestrationInput)`

**What it resolves:**

| Step | What | How |
|------|------|-----|
| Scaffold resolution | `resolvedScaffold` | auto (embedding match), manual (by id), or off |
| Scaffold serialization | `scaffoldContext` | `serializeScaffoldForPrompt()` with mode detection |
| Capability inference | `capabilities` | Keyword analysis of prompt |
| Route planning | `routePlan` | From prompt + intent + brief + scaffold |
| Contract inference | `preGenerationContracts` | Data mode, providers, env vars, unresolved decisions |

**Output:** `OrchestrationResult` containing:
- `engineSystemPrompt` — full STATIC_CORE + dynamic context (for own-engine)
- `v0EnrichmentContext` — dynamic context only (injected as v0 `system` param)
- `resolvedScaffold`, `scaffoldContext`, `routePlan`, `preGenerationContracts`, `capabilities`

## Layer 5 — System Prompt Construction

**File:** `src/lib/gen/system-prompt.ts`

### STATIC_CORE (~6-8K tokens)

Never changes between requests. Enables OpenAI prompt-prefix caching.

**On disk (preferred):** `config/codegen-static-prompt.json` lists Markdown
fragments under `config/prompt-static/*.md` (order + optional
`fragmentSeparator`). See `config/prompt-static/_READ_ME_FIRST.md`.

**Fallback monoliths (older checkouts / maintenance):** `config/systemprompt.md`,
or legacy files at `src/config/systemprompt` or `scripts/systemprompt`. The
extensionless path **`config/systemprompt` is not supported** — it was removed
to avoid duplicate sources and Markdown tooling confusion.

**Loader:** `src/lib/gen/static-core-loader.ts` (`getStaticCoreFromWorkspace()`).

**CI / local gate:** `scripts/check-systemprompt.mjs` (via `predev` and
`prebuild` in `package.json`).

**Local prompt dumps (debug):** set `SAJTMASKIN_PROMPT_DUMP=1`. Writes under
`data/prompt-dumps/` (gitignored), including subfolders such as
`orchestration-dynamic/`, `own-engine-codegen/`, `plan-mode-planner/`. Implemented
in `src/lib/gen/prompt-dump.ts`; wired from `prepareGenerationContext`, stream
routes, sync `chats` route, `mcp/generate-site`, and `eval/runner`. The static /
dynamic boundary for tooling uses `SYSTEM_PROMPT_SEPARATOR` from
`system-prompt.ts`.

**Split / extract maintenance:** `scripts/split-codegen-static-prompt.mjs`
(npm `codegen:split-static-prompt`). ~~`extract-static-core.mjs`~~ fanns för monolitisk
`STATIC_CORE` i `system-prompt.ts` (borttaget 2026-03-27); statisk kärna kommer från
`config/prompt-static/` via `static-core-loader`.

Contains: tech stack rules, output format (CodeProject), shadcn/ui component
catalog, visual design quality guidelines, art direction, typography, layout
patterns, charts, icons, images, existing files list, scaffold starter rules,
accessibility rules, planning/thinking block rules, behavioral rules,
follow-up rules.

### Dynamic context (per-request)

Built by `buildDynamicContext(options: DynamicContextOptions)`.

Sections injected in order:
1. **Custom Instructions** — user-supplied from builder UI textarea
2. **Build Intent** — guidance rules per intent (template/website/app)
3. **Scaffold** — serialized scaffold context + capability hints
4. **Scaffold Research Priorities** — quality checklist + upgrade targets
5. **Route Plan** — site type, routes, planning source
6. **Pre-Generation Contracts** — data mode, providers, env vars, unresolved decisions, confirmed answers
7. **Project Context** — from brief (title, brand, pitch, audience, CTA, tone, pages, must-have, avoid)
8. **Visual Identity** — theme preset, style keywords, theme tokens, palette, typography
9. **Design References** — Figma/image references with structural reading order
10. **Imagery** — placeholder rules + brief imagery notes
11. **Media Catalog** — uploaded media aliases
12. **SEO** — title template, meta description, keywords
13. **Relevant Documentation** — knowledge base search + registry enrichment
14. **Template References** — ranked template library matches with quality scores
15. **Reference Code Snippets** — structural inspiration from top template matches
16. **Original Request** — echo of the prompt for reference

### Plan mode (alternative path)

**File:** `src/lib/gen/plan-prompt.ts`

When `planMode=true`, the model receives `PLAN_SYSTEM_PROMPT` instead of the
code-generation prompt. Returns structured JSON: goal, siteType, pages, steps,
blockers, contracts, scaffold recommendation, assumptions.

## Layer 6 — Request Metadata Extraction

**File:** `src/lib/gen/request-metadata.ts`

Utility functions that extract typed values from the untyped `meta` object
sent by the client:

| Function | Extracts |
|----------|----------|
| `extractThemeColorsFromMeta` | `ThemeColors` (primary/secondary/accent in OKLCh) |
| `extractBriefFromMeta` | Full brief object |
| `extractDesignThemePresetFromMeta` | `designTheme` or `designThemePreset` string |
| `extractPaletteStateFromMeta` | Component palette selections |
| `extractScaffoldSettingsFromMeta` | `scaffoldMode` + `scaffoldId` |
| `extractAppProjectIdFromMeta` | App project ID |
| `summarizeDesignReferences` | Converts attachments to `DesignReferenceAsset[]` |
| `buildUserPromptContent` | Combines prompt text with visual image attachments |

## Layer 7 — Custom Instructions & Defaults

**File:** `src/lib/builder/defaults.ts`

Two instruction tiers:
- **CORE_CUSTOM_INSTRUCTIONS** — always relevant: tech stack, shadcn setup, language, accessibility
- **EXTENDED_CUSTOM_INSTRUCTIONS** — design system execution, component usage, Tailwind, visual identity, layout, motion, images, Figma workflow

Selection logic via `getDefaultCustomInstructions(scaffoldMode)`:
- scaffold `auto` or `manual` → CORE only (scaffold + STATIC_CORE already provide design guidance)
- scaffold `off` → CORE + EXTENDED (full guidance needed)

`isDefaultCustomInstructions(value)` detects whether the user has manually
edited the instructions or is still on a default.

## Layer 8 — Prompt Builder (UI-side technical prompts)

**File:** `src/lib/builder/prompt-builder.ts`

Converts UI intent selections (shadcn block, shadcn component, AI element,
approved plan, inline) into technical prompts with metadata:
- `promptSourceKind` — what triggered the prompt
- `promptSourceTechnical` — whether to skip summarization
- `promptSourcePreservePayload` — whether to preserve registry payloads verbatim

See also `docs/architecture/builder-prompt-layer.md` for the boundary diagram.

## Divergence: own-engine vs v0-fallback

| Aspect | Own Engine | V0 Fallback |
|--------|-----------|-------------|
| System prompt | Full `STATIC_CORE` + dynamic context | Dynamic context only (as `system` param) |
| Model | `SAJTMASKIN_MODEL_*` via OpenAI | v0 Platform API models |
| Scaffold | Fully resolved and serialized | Context injected but not scaffold files |
| Custom instructions | Injected into dynamic context | Injected into dynamic context |
| designSystemId | Not used (theme preset instead) | Passed to `chats.create` / `initFromRegistry` |
| designTheme | Resolved to `themeColors` → dynamic context | Same (via `v0EnrichmentContext`) |
| Post-generation | 7-step autofix, esbuild, URL expansion | v0 handles post-processing |

## "What controls what" quick reference

| Parameter | Where set | Where consumed | Effect |
|-----------|-----------|---------------|--------|
| `buildMethod` | URL on builder entry | `promptOrchestration` → prompt type detection | Budget, strategy selection |
| `buildIntent` | URL on builder entry | `orchestrate` → system-prompt → BUILD_INTENT_GUIDANCE | Template/website/app rules |
| `designTheme` | localStorage + BuilderHeader | `orchestrate` → themeOverride → system-prompt Visual Identity | OKLCh color tokens |
| `designSystemId` | localStorage (no UI setter) | route → v0-generator `chats.create` | v0 registry design system (v0-only) |
| `customInstructions` | BuilderHeader textarea | `orchestrate` → system-prompt first dynamic section | User rules injected at top |
| `scaffoldMode` | BuilderHeader dropdown | `orchestrate` → scaffold resolution | auto/manual/off |
| `scaffoldId` | BuilderHeader dropdown | `orchestrate` → `getScaffoldById` | Specific scaffold selection |
| `selectedModelTier` | BuilderHeader dropdown | route → model selection → generation | Which model runs |
| `promptAssistModel` | BuilderHeader dropdown | `/api/ai/chat` preprocessing | Which model rewrites prompt |
| `brief` | Prompt assist deep mode output | `orchestrate` → system-prompt Project Context | Structured project spec |
| `attachments` | File upload in chat | `request-metadata` → design references + user prompt content | Visual references for model |

## Design system boundary

Two separate concepts exist and must not be conflated:

| Concept | State key | Where stored | Used by | Status |
|---------|-----------|-------------|---------|--------|
| **Internal theme preset** | `designTheme` | localStorage `sajtmaskin:designTheme` | own-engine via `themeColors` in system-prompt | Active, has UI in ChatInterface/UnifiedElementPicker |
| **v0 Design System** | `designSystemId` | localStorage `sajtmaskin:designSystemId` | v0-fallback via `chats.create` | Deprecated — no UI setter, v0-only |

`designTheme` resolves to OKLCh `ThemeColors` via `getThemeColors()` in
`theme-presets.ts` and is injected into the system prompt's Visual Identity
section. It drives own-engine output directly.

`designSystemId` is a v0 Platform API concept (registry-backed design system
with tokens and components). It was wired in backend/state but never got a
UI dropdown (the Plan 01 design-system-registry was archived before S4-S5
were implemented). It is now marked as soft-deprecated and will be removed
alongside the v0-fallback path.

**Decision:** Do not expose `designSystemId` in UI during soft-deprecation.
Focus design investment on improving `designTheme` presets and potentially
adding custom color picker support instead.

## URL vs state sync decision

`buildMethod` and `buildIntent` are read from the URL on builder entry but
never written back during the session. This is **intentional**: they capture
the entry state (how the user arrived at the builder). Changing them mid-session
via `router.replace` would cause unnecessary re-renders and confusing URL
changes while the user is working. The server route receives the current values
from React state via the request body `meta` object, not from the URL.

If a shared-link use case arises where mid-session state needs to be in the URL,
consider writing only on explicit user actions (e.g. "copy builder link") rather
than syncing continuously.

## Parallel system summary

| System | Status | Key files | Keep/Remove |
|--------|--------|-----------|-------------|
| Own engine (default) | Active | `src/lib/gen/`, `src/lib/providers/own-engine/` | Keep |
| V0 fallback | Active (opt-in) | `src/lib/providers/v0-fallback/`, `src/lib/v0/` | Soft deprecate |
| Vercel deploy/blob/domains | Active | `src/lib/vercel/` | Keep (do not remove) |
| designTheme (internal) | Active | `src/lib/builder/theme-presets.ts` | Keep |
| designSystemId (v0) | Wired but no UI | `src/lib/config.ts`, `v0-generator.ts` | Soft deprecate with v0 |
| Custom instructions | Active | `src/lib/builder/defaults.ts`, `BuilderHeader.tsx` | Keep and enhance |
| Prompt orchestration | Active | `src/lib/builder/promptOrchestration.ts` | Keep |
| Plan mode | Active | `src/lib/gen/plan-prompt.ts` | Keep |
| Template library references | Active | `src/lib/gen/template-library/` | Keep |
| Knowledge base search | Active | `src/lib/gen/context/knowledge-base.ts` | Keep |

---

## Changelog — 2026-03-24 (static prompt + debug)

Sammanfattning av arbetet som hör ihop med den statiska codegen-prompten och
verktyg runt den:

- **Källlayout:** Statisk egen-motor-prompt lever i manifestet
  `config/codegen-static-prompt.json` + fragment under `config/prompt-static/`.
  Ingen aktiv användning av extensionlös `config/systemprompt`; laddaren och
  `check-systemprompt` accepterar inte den sökvägen längre.
- **Kod:** `static-core-loader.ts` (manifest först, sedan monolit-fallback enligt
  tabellen ovan); `scripts/check-systemprompt.mjs` validerar manifest + filer
  eller monolit.
- **Markdown / lint:** `config/prompt-static/04-visual-design-quality.md`
  justerad för markdownlint; `.markdownlintignore` behåller en rad så att en
  eventuellt återinförd extensionlös fil inte trixar verktyg.
- **Prompt-dump:** `SAJTMASKIN_PROMPT_DUMP=1`, `prompt-dump.ts`, undermappar
  under `data/prompt-dumps/`; `.gitignore` ignorerar dump-mappen.
- **Städ:** PNG-filer som råkat hamna under `config/image/systemprompt/` togs
  bort (hörde inte till källan för textprompten).

Schema-mappen (`docs/schemas/`) beskriver i huvudsak **API-/UI-kontrakt**, inte
promptfragment; en kort pekare finns i `docs/schemas/README.md` under
*Related configuration*.
