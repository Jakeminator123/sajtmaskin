> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `config/ai_models/manifest.json`
> Source: `src/lib/ai-models/load-manifest.ts#getAiModelsManifest`
> Generator: `scripts/docs/generate-contract-docs.mjs`

<!-- source-fingerprint: config/ai_models/manifest.json#full-manifest sha256:a86ccf449bcde0e9 -->
<!-- source-fingerprint: config/ai_models/manifest.json#model-summary sha256:a13b7f2b78943c1a -->

# Models

The runtime Zod loader validates this data before it reaches this document. Environment overrides still win at runtime.
Canonical owner: committed AI-model manifest. Validator/runtime consumer: `getAiModelsManifest()` and model-selection code.

## Build profiles

| Profile     | Default model     | Override env key             |
| ----------- | ----------------- | ---------------------------- |
| `anthropic` | `claude-opus-4.8` | `SAJTMASKIN_MODEL_ANTHROPIC` |
| `codex`     | `gpt-5.3-codex`   | `SAJTMASKIN_MODEL_CODEX`     |
| `fast`      | `gpt-5.4-mini`    | `SAJTMASKIN_MODEL_FAST`      |
| `max`       | `gpt-5.5`         | `SAJTMASKIN_MODEL_MAX`       |
| `pro`       | `gpt-5.3-codex`   | `SAJTMASKIN_MODEL_PRO`       |

## Quality mapping

| Quality    | Own-engine model |
| ---------- | ---------------- |
| `light`    | `gpt-5.4-mini`   |
| `max`      | `gpt-5.3-codex`  |
| `premium`  | `gpt-5.5`        |
| `pro`      | `gpt-5.3-codex`  |
| `standard` | `gpt-5.3-codex`  |

## Prompt assist

| Workload | Default model          | Override env key          |
| -------- | ---------------------- | ------------------------- |
| `assist` | `openai/gpt-5.5`       | `SAJTMASKIN_ASSIST_MODEL` |
| `polish` | `openai/gpt-5.3-codex` | `SAJTMASKIN_POLISH_MODEL` |
