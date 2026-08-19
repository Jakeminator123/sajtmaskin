> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `config/ai_models/manifest.json`
> Source: `src/lib/ai-models/load-manifest.ts#getAiModelsManifest`
> Source: `src/**/*.{ts,tsx}#resolvePhaseModel-literals`
> Generator: `scripts/docs/generate-contract-docs.mjs`

<!-- source-fingerprint: config/ai_models/manifest.json#full-manifest sha256:3c3d4dd270f42dc9 -->
<!-- source-fingerprint: config/ai_models/manifest.json#model-summary sha256:18d98dfea4135c43 -->
<!-- source-fingerprint: src/**/*.{ts,tsx}#resolvePhaseModel-literals sha256:df1d0e127dc60443 -->

# Models

The runtime Zod loader validates this data before it reaches this document. Environment overrides still win at runtime.
Canonical owner: committed AI-model manifest. Validator/runtime consumer: `getAiModelsManifest()` and model-selection code.

## Build profiles

| Profile     | Default model     | Override env key             |
| ----------- | ----------------- | ---------------------------- |
| `anthropic` | `claude-opus-4.8` | `SAJTMASKIN_MODEL_ANTHROPIC` |
| `codex`     | `gpt-5.3-codex`   | `SAJTMASKIN_MODEL_CODEX`     |
| `max`       | `gpt-5.5`         | `SAJTMASKIN_MODEL_MAX`       |
| `premium`   | `gpt-5.6-sol`     | `SAJTMASKIN_MODEL_PREMIUM`   |
| `pro`       | `gpt-5.3-codex`   | `SAJTMASKIN_MODEL_PRO`       |

## Quality mapping

| Quality    | Own-engine model |
| ---------- | ---------------- |
| `light`    | `gpt-5.6-sol`    |
| `max`      | `gpt-5.3-codex`  |
| `premium`  | `gpt-5.6-sol`    |
| `pro`      | `gpt-5.3-codex`  |
| `standard` | `gpt-5.3-codex`  |

## Prompt assist

| Workload | Default model        | Override env key          |
| -------- | -------------------- | ------------------------- |
| `assist` | `openai/gpt-5.6-sol` | `SAJTMASKIN_ASSIST_MODEL` |

## Briefing

Defaults for the structured brief workloads in the AI-model manifest. Environment overrides still win at runtime.

| Workload              | Default model               | Override env key                        |
| --------------------- | --------------------------- | --------------------------------------- |
| `requestModel`        | `openai/gpt-5.6-sol`        | `SAJTMASKIN_BRIEF_MODEL`                |
| `serverAutoAnthropic` | `anthropic/claude-opus-4.8` | `SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC` |
| `serverAutoOpenAI`    | `openai/gpt-5.6-sol`        | `SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI`    |

## Phase routing

A runtime caller is a non-test `src/` call to `resolvePhaseModel` or `resolvePhaseThinking` with this phase as a string literal.
`src/lib/models/phase-routing.ts` is excluded because it resolves and summarizes routing; it does not invoke a phase.

| Phase              | `anthropic`            | `codex`                | `max`                  | `premium`              | `pro`                  | Runtime caller                                                                                                                                                                                                                                 |
| ------------------ | ---------------------- | ---------------------- | ---------------------- | ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-assistant` | `claude-opus-4.8`      | `gpt-5.3-codex`        | `gpt-5.3-codex`        | `selected_build_model` | `gpt-5.3-codex`        | No                                                                                                                                                                                                                                             |
| `fixer`            | `selected_build_model` | `selected_build_model` | `gpt-5.3-codex`        | `gpt-5.6-sol`          | `selected_build_model` | Yes (`src/app/api/engine/chats/[chatId]/repair/route.ts`, `src/lib/gen/autofix/llm-repair-gate.ts`, `src/lib/gen/verify/server-verify/repair-execution.ts`)                                                                                    |
| `generator`        | `claude-opus-4.8`      | `selected_build_model` | `selected_build_model` | `selected_build_model` | `gpt-5.3-codex`        | Yes (`src/lib/api/engine/chats/chat-message-stream/codegen-turn.ts`, `src/lib/api/engine/chats/create-chat-stream-post.ts`, `src/lib/own-engine/generate-site-from-prompt.ts`, `src/lib/own-engine/session/own-engine-pipeline-generation.ts`) |
| `planner`          | `claude-opus-4.8`      | `selected_build_model` | `selected_build_model` | `selected_build_model` | `gpt-5.3-codex`        | Yes (`src/lib/own-engine/session/own-engine-plan-mode.ts`, `src/lib/providers/own-engine/plan-mode-response.ts`)                                                                                                                               |
| `verifier`         | `selected_build_model` | `gpt-5.3-codex`        | `gpt-5.3-codex`        | `selected_build_model` | `gpt-5.3-codex`        | Yes (`src/lib/gen/verify/verifier-pass.ts`)                                                                                                                                                                                                    |
