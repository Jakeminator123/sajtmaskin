# Builder + v0 Alignment Audit (2026-02-13)

Status: consolidated review for stream behavior, prompt flow, and v0 doc alignment.

Supersedes (as primary operational reference):
- `PROMPT_AC_SCHEMA.md`
- `CHAT_FLOW_ARCHITECTURE.md`
- `EXTERNAL_INTEGRATIONS_SPEC.md`

Goal:
- Identify major conflicts and high-risk mismatches between docs and implementation.
- Verify alignment against official v0 docs where possible.
- Provide concrete actions and why they matter.

---

## Scope and sources

Local docs reviewed:
- `PROMPT_AC_SCHEMA.md`
- `CHAT_FLOW_ARCHITECTURE.md`
- `EXTERNAL_INTEGRATIONS_SPEC.md`

Implementation checked:
- `src/app/api/v0/chats/stream/route.ts`
- `src/app/api/v0/chats/[chatId]/stream/route.ts`
- `src/lib/hooks/useV0ChatMessaging.ts`
- `src/lib/v0Stream.ts`
- `src/lib/streaming.ts`
- `src/lib/builder/promptOrchestration.ts`
- `src/lib/builder/promptLimits.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/app/builder/page.tsx`
- `src/app/api/template/route.ts`

External references checked:
- `https://v0.app/docs/api/platform/reference/chats/create`
- `https://v0.dev/docs/api/platform/reference/chats/send-message`
- `https://v0.app/docs/instructions`
- `https://v0.dev/docs/api/platform/guides/environment-variables`
- `https://v0.dev/docs/MCP`

---

## Major findings (high priority)

1) `EXTERNAL_INTEGRATIONS_SPEC.md` has a core outdated claim.

- Doc claim: integration stream events are captured but ignored/dropped.
- Current code: integration signals are extracted, emitted as SSE `integration`, consumed client-side, and rendered as tool/integration UI parts.
- Why this matters:
  - Team decisions can be made on false assumptions ("feature missing") even though the feature exists.
  - Roadmap prioritization can be skewed.
- Affected references:
  - `EXTERNAL_INTEGRATIONS_SPEC.md`
  - `src/app/api/v0/chats/stream/route.ts`
  - `src/app/api/v0/chats/[chatId]/stream/route.ts`
  - `src/lib/v0Stream.ts`
  - `src/lib/hooks/useV0ChatMessaging.ts`

2) `CHAT_FLOW_ARCHITECTURE.md` has inaccurate settings for `specMode`.

- Doc table says `specMode` default is false and persisted in localStorage.
- Current code uses `DEFAULT_SPEC_MODE = true` and there is no active localStorage persistence flow for `specMode` in `page.tsx`.
- Why this matters:
  - Incorrect operator expectation for spec behavior and debugging.
  - Harder to explain why spec behavior appears "always on" by default.
- Affected references:
  - `CHAT_FLOW_ARCHITECTURE.md`
  - `src/lib/builder/defaults.ts`
  - `src/app/builder/page.tsx`

3) Create-stream vs follow-up-stream parity is incomplete.

- Create stream route emits `meta` and does done-like early completion when version/demo arrives.
- Follow-up stream route does not emit `meta` and finalizes mostly in `finally` after resolve.
- Why this matters:
  - UI can get less consistent stream metadata on follow-ups.
  - Completion can feel delayed in long follow-up streams.
- Affected references:
  - `src/app/api/v0/chats/stream/route.ts`
  - `src/app/api/v0/chats/[chatId]/stream/route.ts`
  - `src/lib/hooks/useV0ChatMessaging.ts`

4) Follow-up timeout policy is stricter than create plan flow.

- Create chat can use extended plan timeout.
- Follow-up `sendMessage` uses default stream safety timeout.
- Why this matters:
  - Complex plan-follow-up prompts are more likely to time out despite valid generation.
  - Creates mismatch between "first plan turn works" and "continuation fails".
- Affected references:
  - `src/lib/hooks/useV0ChatMessaging.ts`

---

## Medium findings

1) Template entry from builder-internal picker can under-specify prompt context.

- Builder local template start sets `templateId` but not always explicit mode context in that path.
- This can produce weaker prompt classification on later turns in some entry combinations.
- Affected references:
  - `src/app/builder/page.tsx`
  - `src/components/builder/ChatInterface.tsx`

2) `PROMPT_AC_SCHEMA.md` has stale local log file location.

- Document references root log files.
- Current dev log path is centralized under `logs/`.
- Why this matters:
  - Slower debugging and false "log missing" assumptions.
- Affected references:
  - `PROMPT_AC_SCHEMA.md`
  - `src/lib/logging/devLog.ts`

3) Stream type contract is narrower than emitted/consumed behavior.

- `src/lib/streaming.ts` stream event union does not include all practical events used in transport (`meta`, `ping`).
- Why this matters:
  - Type-level documentation drifts from runtime behavior.
  - Increases maintenance ambiguity.

---

## What is aligned with v0 docs

1) Chat create/send usage and streaming mode are aligned.

- v0 docs define `responseMode: "experimental_stream"` for create/send.
- Sajtmaskin uses this mode in stream routes.

2) Plan-mode concept is aligned at behavior level.

- v0 docs describe plan mode as instruction/preset behavior.
- Sajtmaskin models this as first-prompt instruction policy, not as dedicated API flag.

3) Project-scoped env vars are aligned with v0 platform model.

- v0 docs describe project-scoped env vars (`createEnvVars/findEnvVars/updateEnvVars/deleteEnvVars`).
- Sajtmaskin architecture and integration docs refer to project-level env management.

4) MCP/integration direction is aligned.

- v0 docs emphasize marketplace integrations and MCP tool execution modes.
- Sajtmaskin now surfaces integration signals in stream/UI and can continue toward env/config flows.

---

## Recommended actions (prioritized)

P0 (do first):
1. Update `EXTERNAL_INTEGRATIONS_SPEC.md` to mark "integration signals dropped" as resolved and move roadmap to next real gap.
2. Fix `CHAT_FLOW_ARCHITECTURE.md` `specMode` settings row to match current implementation.
3. Add parity checklist for create vs follow-up stream route behavior (`meta`, done-like completion, debug toggles).

P1:
4. Make follow-up timeout adaptive for plan-like continuations.
5. Ensure template-start paths consistently pass enough context for later prompt classification.
6. Expand stream event type contract (or document intentionally unsupported events).

P2:
7. Keep legacy docs but add explicit "last verified" and "superseded by" markers to reduce drift risk.

---

## Decision summary

- Current implementation is stronger than parts of the docs in critical areas (integration signal flow).
- Main risk now is documentation drift, not missing core stream functionality.
- The highest-value next step is to normalize documentation and stream parity between create and follow-up routes.

---

## Documentation normalization applied

The following documentation hygiene updates are now applied:

- Added legacy/superseded banner to:
  - `PROMPT_AC_SCHEMA.md`
  - `CHAT_FLOW_ARCHITECTURE.md`
  - `EXTERNAL_INTEGRATIONS_SPEC.md`
- Corrected major stale claims in legacy docs:
  - integration signals are no longer described as dropped
  - `specMode` default/persistence corrected
  - prompt/system/handoff hard limit statements corrected
  - dev log path updated to `logs/`
- Kept this file as canonical audit source to reduce future drift.

