# Builder UX: contracts, pending questions, and preview surfaces

This document ties together how **pre-generation contracts**, **awaiting-input** streaming, and the **preview panel** stay aligned.

## Pending question (single canonical string)

1. **Server:** When a stream ends with `awaitingInput: true`, the `done` event SHOULD include `awaitingInputPrompt` with the exact question text (contract gate, follow-up clarification, etc.).
2. **Client (`stream-handlers`):** When attaching `tool:awaiting-input`, the `output.question` field prefers `done.awaitingInputPrompt`, then plan blockers, then streamed content heuristics.
3. **Preview (`PreviewPanel`):** `awaitingInputQuestion` comes from `getLatestPendingReply` in `BuilderMessageTooling`, which reads structured tool output (including `tool:awaiting-input` / `askClarifyingQuestion`) so the preview empty-state matches the chat.

## Contract clarification vs heavy orchestration

`resolveOrchestrationBase` runs **before** `finalizeOrchestrationPrompts`. If `buildContractClarificationQuestion` returns a question, the stream responds with a contract gate **without** building the full `engineSystemPrompt`. Follow-up and create-chat routes both use this split.

## Env / integrations / `ProjectEnvVarsPanel`

- `inferPreGenerationContracts` + `detect-integrations` drive `unresolvedDecisions` (including `env` when required keys are missing).
- `buildContractClarificationQuestion` emits an **env** branch when `hasUnresolved(..., "env")`.
- **Sync note (F9 increment):** Keep contract env requirements and what the env panel lists conceptually aligned; a future step is a shared selector or exposing `requiredEnv` on version/chat metadata so the panel and contracts do not drift.

## Preview: shim vs sandbox

- **Shim-preview:** URLs under `/api/preview-render` — local runtime with dependency shims (e.g. R3F/drei/Rapier stubs). UI badge: **Shim-preview**.
- **Sandbox-runtime:** Hosted sandbox URLs — separate Next/runtime environment. UI badge: **Sandbox-runtime** (when not on shim-preview).

Terminology for product copy should continue to distinguish **runtime preview** (shim path) from **external sandbox**, as in `.cursor/rules/terminology.mdc` and builder UI strings.

## 3D / package breadth (cross-reference)

Static starters, `docs-snippets`, capability inference, dependency completer, preview shims, and `runtime-library-audit` are the supported path for R3F/drei/Rapier breadth — not direct dossier reads at generation time. See `config/prompt-static/08-scaffold-starters.md` and `src/lib/gen/preview/shims.ts`.
