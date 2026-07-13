> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `config/control-plane/schema-registry.json`
> Source: `config/control-plane/policy-registry.json`
> Generator: `scripts/docs/generate-contract-docs.mjs`

# Schemas and policies

This index contains 34 control-plane entries. It is a map to canonical owners, not a runtime policy layer.

| ID                                  | Type                | Canonical source                                          | Validator               | CI status | Runtime status  | Runtime enforced |
| ----------------------------------- | ------------------- | --------------------------------------------------------- | ----------------------- | --------- | --------------- | ---------------- |
| `agent-rules`                       | `rule`              | `.cursor/rules`                                           | —                       | `none`    | `n/a`           | No               |
| `code-policy-modules`               | `policy`            | `src/lib/builder/server-auto-brief-policy.ts`             | `test:ci`               | `hard`    | `wired`         | Yes              |
| `domain-rules`                      | `policy`            | `config/domain-rules.json`                                | `backoffice:test`       | `hard`    | `wired`         | Yes              |
| `env-policy`                        | `policy`            | `config/env-policy.json`                                  | `env:audit`             | `manual`  | `declared-only` | No               |
| `generated-site-placeholders`       | `policy`            | `config/ai_models/40-harmless-placeholders.env.txt`       | `test:ci`               | `hard`    | `wired`         | Yes              |
| `manifest-per-tier-briefing`        | `policy`            | `config/ai_models/manifest.json#perTierBriefing`          | `control-plane:check`   | `warn`    | `declared-only` | No               |
| `manifest-per-tier-repair-policies` | `policy`            | `config/ai_models/manifest.json#perTierRepairPolicies`    | `control-plane:check`   | `warn`    | `declared-only` | No               |
| `manifest-per-tier-timeouts`        | `policy`            | `config/ai_models/manifest.json#perTierTimeouts`          | `control-plane:check`   | `warn`    | `declared-only` | No               |
| `manifest-pre-generation-contracts` | `policy`            | `config/ai_models/manifest.json#preGenerationContracts`   | `test:ci`               | `hard`    | `wired`         | Yes              |
| `manifest-quality-gate-tiers`       | `policy`            | `config/ai_models/manifest.json#qualityGateTiers`         | `test:ci`               | `hard`    | `wired`         | Yes              |
| `manifest-repair-policies`          | `policy`            | `config/ai_models/manifest.json#repairPolicies`           | `test:ci`               | `hard`    | `wired`         | Yes              |
| `naming-dictionary`                 | `policy`            | `config/naming-dictionary.json`                           | `check:terms`           | `warn`    | `declared-only` | No               |
| `placeholder-harmless`              | `policy`            | `src/lib/integrations/placeholder-harmless.ts`            | `test:ci`               | `hard`    | `wired`         | Yes              |
| `prompt-heuristic-tokens`           | `policy`            | `config/prompt-heuristic-tokens.json`                     | `backoffice:test`       | `hard`    | `wired`         | Yes              |
| `shadcn-mirror-audit-policy`        | `policy`            | `config/shadcn-mirror-audit-policy.json`                  | `mirror:audit`          | `manual`  | `declared-only` | No               |
| `structural-file-priorities`        | `policy`            | `config/structural-file-priorities.json`                  | —                       | `none`    | `declared-only` | No               |
| `tier3-sdk-deny`                    | `policy`            | `config/integrations/tier3-sdk-deny.json`                 | `test:ci`               | `hard`    | `wired`         | Yes              |
| `user-degraded-env`                 | `policy`            | `config/user_degraded_env.txt`                            | —                       | `none`    | `declared-only` | No               |
| `ai-models-manifest`                | `schema`            | `config/ai_models/manifest.json`                          | `test:ci`               | `hard`    | `wired`         | Yes              |
| `ai-models-manifest-jsonschema`     | `schema`            | `config/ai_models/manifest.schema.json`                   | —                       | `none`    | `n/a`           | No               |
| `chat-request-schemas`              | `runtime-authority` | `src/lib/validations/chatSchemas.ts`                      | `test:ci`               | `hard`    | `wired`         | Yes              |
| `control-plane-registry-schema`     | `schema`            | `docs/schemas/strict/control-plane-registry.schema.json`  | `control-plane:check`   | `hard`    | `n/a`           | No               |
| `db-schema`                         | `runtime-authority` | `src/lib/db/schema.ts`                                    | `db:schema-drift`       | `hard`    | `wired`         | Yes              |
| `domain-rules-schema`               | `schema`            | `docs/schemas/strict/domain-rules.schema.json`            | `control-plane:check`   | `hard`    | `n/a`           | No               |
| `dossier-manifest-schema`           | `schema`            | `docs/schemas/strict/dossier.schema.json`                 | `dossiers:validate-all` | `hard`    | `wired`         | Yes              |
| `env-policy-schema`                 | `schema`            | `docs/schemas/strict/env-policy.schema.json`              | `test:ci`               | `hard`    | `n/a`           | No               |
| `env-server-schema`                 | `runtime-authority` | `src/lib/env.ts`                                          | `typecheck`             | `hard`    | `wired`         | Yes              |
| `integration-manifest-schema`       | `runtime-authority` | `src/lib/integrations/integration-manifest.ts`            | `test:ci`               | `hard`    | `wired`         | Yes              |
| `plan-artifact-schema`              | `runtime-authority` | `src/lib/gen/plan/schema.ts`                              | `test:ci`               | `hard`    | `wired`         | Yes              |
| `prompt-heuristic-tokens-schema`    | `schema`            | `docs/schemas/strict/prompt-heuristic-tokens.schema.json` | `control-plane:check`   | `hard`    | `n/a`           | No               |
| `scaffold-manifests`                | `runtime-authority` | `src/lib/gen/scaffolds/*/manifest.ts`                     | `scaffolds:validate`    | `hard`    | `wired`         | Yes              |
| `scaffold-variant-schema`           | `schema`            | `docs/schemas/strict/scaffold-variant.schema.json`        | —                       | `none`    | `n/a`           | No               |
| `telemetry-strict-schemas`          | `schema`            | `docs/schemas/strict/*.schema.json`                       | `test:ci`               | `hard`    | `declared-only` | No               |
| `tier3-sdk-deny-schema`             | `schema`            | `docs/schemas/strict/tier3-sdk-deny.schema.json`          | `test:ci`               | `hard`    | `n/a`           | No               |
