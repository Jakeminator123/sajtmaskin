# Builder backlog orchestrator — 2026-03-24

## Implemented

- **3D / packages:** Broader snippets, capabilities, deps, preview shims (incl. Rapier), static prompt 08, runtime audit (see repo under `src/lib/gen/`, `config/prompt-static/`).
- **Contracts:** Env clarification when unresolved; `awaitingInputPrompt` on blocking `done` events. *(Mongo/Dynamo contract rows were later removed per product choice — see `integration-contracts-slim-2026-03-24.md`.)*
- **Stream order (P2):** `resolveOrchestrationBase` then contract gate; `finalizeOrchestrationPrompts` only when generation proceeds.
- **UX:** Canonical pending question for preview; shim vs sandbox badges; fewer duplicate toasts on awaiting input; template selection uses `AlertDialog` instead of `window.confirm`.
- **Docs:** `docs/architecture/builder-ux-contracts-and-preview.md`
- **Tests:** `contract-clarification.test.ts`; stream route mocks updated.

## Deferred (next run / roadmap)

- **B1** auto-send wizard CTA (product decision).
- **F4** placeholder injection into sandbox (behind flag; privacy review).
- **F7** deep brief / gateway policy.
- **F9 step 2:** shared `requiredEnv` surfacing for `ProjectEnvVarsPanel` (documented in architecture doc).

## Orchestrator artifacts

- Run archived under `.cursor/orchestrator/archive/` (see `run-summaries.md`).
