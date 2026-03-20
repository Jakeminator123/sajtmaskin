# Build UI, Autofix, Models & Anthropic — Audit

_Created 2026-03-20. Covers four areas: build/deploy UI clutter, autofix
self-healing bugs, model-ID drift, and Anthropic key routing._

---

## 1  Build / deploy UI

### 1.1 Current surfaces

| Surface | File | Role |
|---------|------|------|
| **ProjectEnvVarsPanel** | `src/components/builder/ProjectEnvVarsPanel.tsx` (~1 300 lines) | Sidebar panel with two tabs: _Integrationer_ (6 sub-sections) and _Miljövariabler_ (CRUD). Fires **9 fetch calls** on expand. |
| **LaunchReadinessCard** | `src/components/builder/LaunchReadinessCard.tsx` | Compact card below the panel. Shows blocker/warning count + per-item detail. |
| **BuilderHeader badges** | `src/components/builder/BuilderHeader.tsx` (lines 219–740) | Badge next to the Publicera button. Shows same blocker count + tooltip with first 4 details. |
| **BuilderShellContent** | `src/app/builder/BuilderShellContent.tsx` | Wires the same `vm.deployReadiness` object to both header and card. Also derives `deployDisabledReason` from the first blocker detail. |
| **IntegrationSetupWizard** | `src/components/builder/IntegrationSetupWizard.tsx` (348 lines) | Alternative card layout inside Integrationer tab; adds a progress bar and ephemeral checklists. |
| **Readiness API** | `src/app/api/v0/chats/[chatId]/readiness/route.ts` | Server-side blocker computation (env, lifecycle, SEO, preview). |
| **useChatReadiness** | `src/lib/hooks/useChatReadiness.ts` | SWR hook, 10 s polling. |

### 1.2 Findings — duplicate messaging

A single missing env var (e.g. `STRIPE_SECRET_KEY`) appears in up to **five** places simultaneously:

1. `LaunchReadinessCard` blocker item.
2. `BuilderHeader` badge tooltip.
3. `ProjectEnvVarsPanel` → Integrationer → code-detection card.
4. `ProjectEnvVarsPanel` → Miljövariabler → "required for active site" chips.
5. `IntegrationSetupWizard` (if open) — red env chip.

Both `LaunchReadinessCard` and `BuilderHeader` are always visible on desktop and consume the same `ChatReadiness` object. There is no conditional that hides one when the other renders.

### 1.3 Findings — stale refresh after env change

Setting an env var via the Miljövariabler tab does not trigger a readiness re-fetch. The hook polls every 10 s, so the user sees "Saknas: X" for up to 10 seconds _after_ fixing it. The Integrationer tab does not auto-refresh its client-side `detectIntegrations` result at all — it requires collapsing and reopening the panel.

### 1.4 Findings — two independent detection systems

| Layer | Function | Location |
|-------|----------|----------|
| Server | `resolveEnvRequirements()` | `readiness/route.ts` |
| Client | `detectIntegrations()` + `detectBusinessWorkflowPacks()` | `ProjectEnvVarsPanel.tsx` |

These scan the same generated files but can produce different "required" key sets.

### 1.5 Findings — platform vs site status confusion

The Integrationer tab mixes _Sajtmaskin platform_ integration status (whether `OPENAI_API_KEY` is configured on the server) with the _generated site's_ env needs. The only differentiator is a tiny badge label ("verifierad" vs "automatisk") at 9 px.

### 1.6 Findings — readiness API side-effect in GET

`readiness/route.ts` line 172–179: if a version is stuck in `pending`/`verifying` for > 5 min, the GET endpoint mutates the DB (`failVersionVerification`). Functionally correct but a read-endpoint side-effect.

### 1.7 Findings — readiness polling never stops

`useChatReadiness` polls indefinitely even after status settles to `"ready"`. No mechanism to back off or stop.

### 1.8 Findings — wizard ephemeral state

`IntegrationSetupWizard`'s verification checkboxes are local `useState`. They reset on close/refresh, giving false confidence.

---

## 2  Autofix / self-healing

### 2.1 Architecture

```
finalize-version.ts
  ├─ Step 1: runAutoFix()           (deterministic pipeline)
  ├─ Step 2: validateAndFix()
  │    ├─ validate via esbuild
  │    └─ loop (up to MAX_PASSES):
  │         ├─ runLlmFixer()        (LLM call via SAJTMASKIN_MODEL_PRO)
  │         └─ runAutoFix()         (deterministic, again)
  ├─ Step 3: finalize-merge         (scaffold-aware merge)
  ├─ Step 4: preflight checks
  └─ Step 5: save version

Post-generation (client-side):
  post-checks.ts → onAutoFix → useAutoFix → sendMessage → re-generation
```

### 2.2 Bug — off-by-one in max passes

`validate-and-fix.ts` line 106: when `pass === AUTOFIX_SYNTAX_MAX_PASSES` (default 6), the loop breaks _before_ reaching the LLM fixer. Effective fix attempts = `MAX_PASSES − 1`. Setting `MAX_PASSES = 1` means **zero** LLM fix attempts.

**Severity: Medium.** Fix: move the give-up check after the fixer call, or document the off-by-one and rename the constant.

### 2.3 Bug — false positive on pipeline error

`validate-and-fix.ts` line 209–225: the outer catch returns `hadErrors: false, errorsAfter: 0`. Downstream code treats this as "validation passed" even though it threw. Broken content is saved as if clean.

**Severity: Medium.** Fix: return `hadErrors: true` or re-throw.

### 2.4 Bug — `runAutofix: false` does not disable autofix

`finalize-version.ts` line 106, 152: setting `runAutofix: false` skips step 1 (the first deterministic pass) but step 2 (`validateAndFix`) runs unconditionally and invokes both the LLM fixer _and_ `runAutoFix` inside its loop. A caller who sets `false` to save cost still gets full autofix.

**Severity: Medium.** Fix: pass a `skipAutofix` flag through to `validateAndFix`.

### 2.5 Risk — content merge fallback can corrupt files

Both `pipeline.ts` line 330 and `llm-fixer.ts` line 88 have a fallback when the fenced-block regex doesn't match: `result.replace(orig.content, fixed.content)`. This replaces only the _first_ occurrence. If two files share identical content, the wrong file body gets replaced.

**Severity: Medium.** Low probability (fenced format usually matches) but silent corruption when it triggers.

### 2.6 Risk — model mismatch in fixer for Anthropic users

`llm-fixer.ts` line 15–25: if `resolvedTier` is undefined, falls back to `SAJTMASKIN_MODEL_PRO` → `gpt-5.3-codex` (OpenAI). A user who chose the `anthropic` builder profile can have their autofix silently running on an OpenAI model if `resolvedTier` isn't propagated.

`resolvedTier` _is_ propagated from `finalize-version.ts` → `validateAndFix` → `resolvePhaseModel` → `llm-fixer`. The risk materializes only if `resolvedTier` is `undefined` at the `finalize-version` call site — which the current code appears to handle, but warrants an explicit runtime assertion.

### 2.7 Risk — double autofix cost amplification

| Scenario | Autofix pipeline runs | LLM fixer calls |
|----------|----------------------|-----------------|
| Clean generation, no errors | 1 deterministic + 1 validate (passes) | 0 |
| Syntax errors, fixer succeeds | 1 + N deterministic | up to 5 |
| Above + post-checks find issues | Doubles (re-generation) | up to 10 |
| Above + manual "Kör autofix" click | Triples | up to 15 |

Worst-case per-prompt: ~320 K LLM output tokens in autofix alone.

### 2.8 Bug — "autofix har köats" shown when handler drops payload

`post-checks-summary.ts` line 109: the "preliminär eftersom autofix redan har köats" message is shown whenever `autoFixReasons.length > 0`, regardless of whether `useAutoFix` actually accepted the payload. Budget exhaustion, `AUTOFIX_ENABLED = false`, or stale-version checks silently discard it.

### 2.9 Bug — manual autofix button ignores limits

`VersionDiagnosticsDialog.tsx` line 142: `canAutoFix` only checks log level, not whether `MAX_AUTOFIX_PER_CHAT` is exhausted. The button fires, the dialog closes, and nothing happens.

---

## 3  Model IDs

### 3.1 Catalog (source of truth)

| Canonical | Env override | Default own-model |
|-----------|-------------|-------------------|
| `fast` | `SAJTMASKIN_MODEL_FAST` | `gpt-4.1` |
| `pro` | `SAJTMASKIN_MODEL_PRO` | `gpt-5.3-codex` |
| `max` | `SAJTMASKIN_MODEL_MAX` | `gpt-5.4` |
| `codex` | `SAJTMASKIN_MODEL_CODEX` | `gpt-5.1-codex-max` |
| `anthropic` | `SAJTMASKIN_MODEL_ANTHROPIC` | `claude-sonnet-4.6` |

Catalog, defaults, selection logic, tracing, and `model-build-profiles.md` are all aligned. No internal drift.

### 3.2 Stale models — audit route

`src/app/api/audit/route.ts` line 57–58:

```
"anthropic/claude-opus-4.5"    →  should be  "anthropic/claude-opus-4.6"
"anthropic/claude-sonnet-4.5"  →  should be  "anthropic/claude-sonnet-4.6"
```

These are the only 4.5 references in the codebase outside of prompt-assist's intentional `claude-haiku-4-5-20251001`.

### 3.3 Legacy GPT-4o models outside catalog

| File | Model | Notes |
|------|-------|-------|
| `api/inspector-ai-match/route.ts` | `gpt-4o-mini` | Utility, outside builder |
| `api/projects/[id]/analyze/route.ts` | `gpt-4o-mini` | Project analysis |
| `api/analyze-presentation/route.ts` | `gpt-4o` / `gpt-4o-mini` | Presentation analysis |
| `components/builder/PreviewPanel.tsx` | `gpt-4o-mini` (tooltip text) | Cosmetic |

These are not generation-critical. They're small utility routes that intentionally use cheap models. Recommendation: migrate to `gpt-4.1-mini` (catalog's `fast` tier) when convenient, but not urgent.

### 3.4 DB schema default drift

`lib/db/schema.sql` defaults to `gpt-5.2`; the Drizzle schema in `schema.ts` defaults to `gpt-5.4`. Only matters if raw SQL migrations are used directly.

---

## 4  Anthropic API key

### 4.1 Routing model

```
User selects "anthropic" profile
  → canonicalModelIdToOwnModelId("anthropic") → "claude-sonnet-4.6"
  → getOpenAIModel("claude-sonnet-4.6")
       → detects "claude-" prefix
       → uses ANTHROPIC_API_KEY via @ai-sdk/anthropic
```

Prompt-assist uses `createDirectModel()` in `gateway-policy.ts` with the same prefix-based routing. Both normalize version dots to dashes for SDK compatibility.

### 4.2 What's correct

- Code generation (own engine): routes to Anthropic when `claude-*` model is resolved. ✓
- Prompt-assist (`/api/ai/chat`, `/api/ai/brief`): routes correctly via `createDirectModel`. ✓
- `ModelTraceOverlay`: shows `Anthropic key: set/missing`. ✓
- `env.ts`: `ANTHROPIC_API_KEY: z.string().optional()`. ✓
- `admin/env/route.ts`: lists as `required: false`. ✓

### 4.3 Missing: env-policy classification rule

`config/env-policy.json` lists `ANTHROPIC_API_KEY` in `extraKnownKeys` but has **no classification rule** in the `rules` array. Every other major API key (`OPENAI_API_KEY`, `V0_API_KEY`, `RESEND_API_KEY`, etc.) has a rule with `classification`, `recommendedVercelTargets`, and `notes`.

### 4.4 Design decision: autofix always uses the selected tier's model

When `resolvedTier` is correctly propagated (the normal path), autofix uses whatever model the tier maps to — including Anthropic. This is the right design. The only risk is the `undefined` fallback path described in §2.6.

---

## 5  Prioritized action list

### P0 — bugs to fix

| # | Area | What | Fix |
|---|------|------|-----|
| 1 | Autofix | Off-by-one: last pass gives up without trying fixer | Move give-up check after fixer call in `validate-and-fix.ts` |
| 2 | Autofix | False positive on pipeline error (`hadErrors: false`) | Return `hadErrors: true` in the catch block |
| 3 | Autofix | `runAutofix: false` doesn't disable autofix | Gate `validateAndFix`'s internal autofix on the flag |
| 4 | Models | Stale `claude-4.5` in audit route | Update to `4.6` in `audit/route.ts` |

### P1 — risks to mitigate

| # | Area | What | Fix |
|---|------|------|-----|
| 5 | Autofix | Merge fallback can corrupt wrong file | Add a guard: if regex misses, warn + skip (don't naive-replace) |
| 6 | Autofix | "autofix köad" shown when dropped | Check useAutoFix acceptance before setting the flag |
| 7 | Autofix | Manual button ignores limits | Check budget in `VersionDiagnosticsDialog` before dispatching |
| 8 | Anthropic | Missing env-policy rule | Add `ANTHROPIC_API_KEY` classification rule |

### P2 — UI simplification

| # | Area | What | Fix |
|---|------|------|-----|
| 9 | Build UI | Same missing-env shown 5× | Consolidate: readiness card shows _summary_, env panel shows _detail_. Header badge can link to readiness card instead of duplicating tooltip. |
| 10 | Build UI | No refresh after env change | Expose `mutate()` from `useChatReadiness` and call it after env CRUD |
| 11 | Build UI | Platform vs site confusion | Visual separator or collapsible section with clear heading |
| 12 | Build UI | Polling never stops at "ready" | Add exponential back-off or stop when status is `ready` |
| 13 | Build UI | Wizard ephemeral checklists | Either persist to DB or remove the checkboxes |

### P3 — cleanup (non-urgent)

| # | Area | What |
|---|------|------|
| 14 | Models | Migrate `gpt-4o-mini` → `gpt-4.1-mini` in utility routes |
| 15 | Models | Align `schema.sql` default with Drizzle (`gpt-5.4`) |
| 16 | Autofix | Rename `isTsxOrJsx` variable |
| 17 | Autofix | Add fixer-model row to ModelTraceOverlay |

---

## 6  Verification checklist

For each fix above, the verification step:

| Fix | Verification |
|-----|-------------|
| 1–3 | `npm test -- --run src/lib/gen` (existing autofix tests) + add targeted test for the edge case |
| 4 | `npx tsc --noEmit` + grep for `4.5` in `src/` confirms zero remaining |
| 5 | Unit test: two files with identical content, regex miss → no corruption |
| 6–7 | Manual smoke: exhaust budget, confirm UI reflects "limit reached" |
| 8 | `node -e "const p = require('./config/env-policy.json'); console.log(p.rules.find(r => r.key === 'ANTHROPIC_API_KEY'))"` |
| 9–13 | Manual builder walkthrough: set/unset env var, observe all surfaces |
| 14–17 | `npx tsc --noEmit`, grep confirms no stale IDs |
