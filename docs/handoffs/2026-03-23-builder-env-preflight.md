# Session handoff — 2026-03-23

Changes made to builder env handling, Anthropic Deep Brief fallback chain,
follow-up file-context budgets, `.env.local` hygiene, and preflight log UX.

---

## Anthropic — vilka värden appen använder

Detta är **Sajtmaskin-byggarens** inställningar mot Anthropic, inte slutanvändarens genererade sajt.

| Källa | Värde / beteende |
|--------|-------------------|
| **`ANTHROPIC_API_KEY`** | Krävs för Anthropic-lane (direkt API via `@ai-sdk/anthropic` i `gateway-policy.ts`). Valideras i bl.a. Deep Brief-routen. |
| **`SAJTMASKIN_MODEL_ANTHROPIC`** | Standard `claude-opus-4.6` (`src/lib/gen/defaults.ts` → `MODEL_ANTHROPIC`). Styr own-engine när tier är Anthropic. |
| **Assist-modeller i UI** | T.ex. `anthropic/claude-opus-4.6`, `anthropic/claude-sonnet-4.6` (`src/lib/builder/defaults.ts`). |
| **`anthropic-direct/…`** | Alternativa id:n för direktmodell (t.ex. `claude-haiku-4-5-20251001`) i samma fil. |
| **Max output (build), tier `anthropic`** | `200_000` tokens per tier-tabell, begränsas av `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` (`resolveBuildMaxOutputTokens`). |
| **Reasoning / “Thinking”** | För tier `anthropic`: `none` — OpenAI `reasoningEffort` skickas inte (`getReasoningEffort`). |
| **Credits (intern prissättning)** | `src/lib/credits/pricing.ts`: egna siffror för `anthropic` (se filen om du justerar konsumtion i UI). |
| **Deep Brief** | `POST /api/ai/brief`: `generateObject` + schema som följer Anthropic-regler (`minItems` 0/1, max ~24 optional fields); triple fallback `full → simplified → compact` (`src/app/api/ai/brief/route.ts`). |

Officiella **modellnamn och API-gränser** hos Anthropic ändras över tid — appen följer det du sätter i env och i UI; kontrollera [Anthropic API-dokumentation](https://docs.anthropic.com/) för aktuella modell-id och kontextfönster.

---

## Allt som ändrats i sessionen (kronologisk checklista)

1. **`src/app/api/ai/brief/route.ts`** — Zod-arrayer `.min(1)` för Anthropic JSON Schema; `anthropicCompactBriefSchema` + `expandAnthropicCompactBrief`; trippelfallback; `X-Schema` / loggning.
2. **`src/lib/gen/defaults.ts`** — `FOLLOWUP_FILE_CONTEXT_MAX_CHARS` / `MAX_FILES` (env + kommentarer).
3. **`src/app/api/v0/chats/[chatId]/stream/route.ts`** — `buildFileContext` använder nya defaults + `debugLog` för budget.
4. **`src/lib/env.ts`** — validering av de två follow-up-env-nycklarna.
5. **`config/env-policy.json`** — `extraKnownKeys` för samma nycklar.
6. **`.env.local`** — bort med dublett `SAJTMASKIN_DEV_LOG`; reserverade nycklar (`AUTO_PLACEHOLDER_*`, `AUTO_DEPLOY_AFTER_REPAIR`, `AGGRESSIVE_AUTOFIX`) **helt utkommenterade** (inga läsningar i `src/`).
7. **`src/lib/gen/stream/finalize-preflight-logs.ts`** — `preflightFailureSummary` korrekt för preview / errors / warnings-only / clean; `primaryBlocker` i `preflight:issues`-meta när det finns errors.
8. **`src/lib/gen/stream/finalize-preflight-logs.test.ts`** — ny testsvit för ovan.
9. **`docs/handoffs/2026-03-23-builder-env-preflight.md`** — denna fil (handoff + referens).

## 1. Anthropic Deep Brief — triple schema fallback

**Problem:** Anthropic's structured output rejects `minItems > 1` on arrays and
caps optional parameters at 24. Both the full and simplified brief schemas
exceeded these limits, causing `POST /api/ai/brief` to return 422 for every
Anthropic build.

**Fix (src/app/api/ai/brief/route.ts):**

- Relaxed `.min(2)` / `.min(3)` Zod constraints on arrays to `.min(1)` in
  `siteBriefSchema` so generated JSON Schema uses `minItems: 0 | 1` only.
- Added a **compact schema** (`anthropicCompactBriefSchema`) with zero
  `.optional()` fields — all keys required, empty string / empty array when
  unknown.
- Wired a **third fallback** in the Anthropic catch chain: full → simplified →
  compact. The compact result is expanded to the standard brief shape via
  `expandAnthropicCompactBrief()` before returning.
- Response header `X-Schema` now reports `full`, `simplified`, or `compact`.
  Dev log `assist.brief.response` includes `schema` tag.

## 2. Follow-up file-context budget (new env keys)

**Problem:** Even a short follow-up ("add animation") inflated prompt to ~76 000
chars / ~113 000 tokens because `buildFileContext` injected up to 140 000 chars
of previous-version files with a fixed budget.

**Fix:**

- `src/lib/gen/defaults.ts` — Two new `readIntEnv` exports:
  - `FOLLOWUP_FILE_CONTEXT_MAX_CHARS` (env `SAJTMASKIN_FOLLOWUP_FILE_CONTEXT_MAX_CHARS`, default 140 000, range 5 000–200 000)
  - `FOLLOWUP_FILE_CONTEXT_MAX_FILES` (env `SAJTMASKIN_FOLLOWUP_FILE_CONTEXT_MAX_FILES`, default 8, range 1–24)
- `src/app/api/v0/chats/[chatId]/stream/route.ts` — `buildFileContext` call now
  reads these exports instead of hard-coded `140_000` / `8`. Added a `debugLog`
  entry (`Follow-up file context budget`) so effective values show in logs.
- `src/lib/env.ts` — Zod schema extended with both new keys.
- `config/env-policy.json` — Both keys added to `extraKnownKeys`.
- `.env.local` — Commented examples showing how to lower budgets for small
  refinements.

## 3. `.env.local` cleanup

- Removed duplicated `SAJTMASKIN_DEV_LOG="true"` at the bottom.
- **Reserved keys** (`SAJTMASKIN_AUTO_PLACEHOLDER_ENV`, `SAJTMASKIN_PLACEHOLDER_ENV_VALUE`,
  `SAJTMASKIN_AGGRESSIVE_AUTOFIX`, `SAJTMASKIN_AUTO_DEPLOY_AFTER_REPAIR`) are **fully commented**
  under a `# Reserved (no process.env reads in src/ yet):` block — they never affected runtime.
- (Session) `AI_CHAT_MAX_TOKENS` aligned with brief where applicable; optional commented
  `SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES` / `SAJTMASKIN_BROAD_REPAIR_MAX_PASSES` examples.

## 4. Key env logic (reference)

| Variable | Effect |
|----------|--------|
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | Global ceiling, combined with per-tier cap via `resolveBuildMaxOutputTokens(tier)`. |
| `SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` | Base when client omits `maxTokens` for brief/chat. |
| `AI_BRIEF_MAX_TOKENS` | Per-route ceiling for `POST /api/ai/brief`. **Effective:** `min(ASSIST, BRIEF)`. |
| `AI_CHAT_MAX_TOKENS` | Per-route ceiling for `POST /api/ai/chat`. **Effective:** `min(ASSIST, CHAT)`. |
| `SAJTMASKIN_FOLLOWUP_FILE_CONTEXT_MAX_CHARS` | Max chars of previous-version file content injected on follow-ups. |
| `SAJTMASKIN_FOLLOWUP_FILE_CONTEXT_MAX_FILES` | Max number of files whose full content is included. |

## 5. Preflight / verification logic (reference)

- **`verificationBlocked`** is set to `true` when at least one preflight issue
  has `severity === "error"` (merged syntax, preview build failure, or
  brief-sourced missing routes).
- **SEO warnings** (missing robots.ts, sitemap.ts, description, h1, Open Graph)
  are `severity: "warning"` and do **not** block verification by themselves.
- **Missing planned routes** from `source === "prompt"` are also `warning`; only
  `source === "brief"` escalates them to `error`.
- The text "Previewn är tillgänglig, men verifieringen hittade blockerande
  problem" maps to `preflight_verification_blocked` — preview works, but at
  least one error-severity issue exists.

## 6. Preflight log bundle (UX / korrekt sammanfattning)

**Files:** `src/lib/gen/stream/finalize-preflight-logs.ts`, `finalize-preflight-logs.test.ts`

- `preflightFailureSummary` is no longer a binary string that implied
  "verification-blocking" whenever preview was not blocked; it now branches on
  preview-blocking errors, verification errors, warnings-only, or fully clean.
- When `preflightErrors.length > 0`, the `preflight:issues` log `meta` includes
  `primaryBlocker: { file, message }` (first error) so the UI can highlight the
  real blocker (e.g. merged syntax in `app/admin/page.tsx`) above SEO/route
  warnings.