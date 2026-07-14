> **GENERATED FILE — DO NOT EDIT MANUALLY**
>
> Source: `config/control-plane/schema-registry.json`
> Source: `config/control-plane/policy-registry.json`
> Source: `config/ai_models/manifest.json#qualityGateTiers`
> Source: `config/env-policy.json`
> Source: `data/dossiers/{hard,soft}/*/manifest.json#envVars`
> Generator: `scripts/docs/generate-contract-docs.mjs`

<!-- source-fingerprint: config/ai_models/manifest.json#qualityGateTiers sha256:ff60f830e3d3c0ce -->
<!-- source-fingerprint: config/env-policy.json sha256:37df2480f827a2c3 -->
<!-- source-fingerprint: data/dossiers/{hard,soft}/*/manifest.json#env-policy sha256:5a8d6ca75930e172 -->
<!-- source-fingerprint: config/control-plane/*-registry.json sha256:0c2e52196a0e33d0 -->

# Policies

## Quality-gate tiers

| Lane                | Phase | Ordered checks                 |
| ------------------- | ----- | ------------------------------ |
| `designPreview`     | `F2`  | `typecheck`                    |
| `integrationsBuild` | `F3`  | `typecheck` → `build` → `lint` |

The current preview schema exposes pass/fail results without additional result enums.

## Environment policy

Only key names and policy metadata are emitted. Values and secret-like note text are excluded; notes participate only in the source fingerprint.

| Key                                                  | Classification         | Recommended targets                    | Empty allowed | Runtime-only |
| ---------------------------------------------------- | ---------------------- | -------------------------------------- | ------------- | ------------ |
| `ADMIN_CREDENTIALS`                                  | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `ADMIN_EMAILS`                                       | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `AUDIT_WEB_SEARCH`                                   | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `AUTH_DEBUG`                                         | `local_only`           | —                                      | Yes           | No           |
| `BACKOFFICE_PASSWORD`                                | `environment_specific` | `preview`, `production`                | Yes           | No           |
| `BACKOFFICE_SESSION_VERSION`                         | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `BLOB_COLORS_KEY`                                    | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `BLOB_CONTENT_KEY`                                   | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `BLOB_READ_WRITE_TOKEN`                              | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `CONTACT_EMAIL_TO`                                   | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `CSP_ENFORCE`                                        | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `DATA_DIR`                                           | `local_only`           | —                                      | Yes           | No           |
| `DB_SSL_REJECT_UNAUTHORIZED`                         | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `DEBUG`                                              | `local_only`           | —                                      | Yes           | No           |
| `DESIGN_SYSTEM_ID`                                   | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `EMAIL_FROM`                                         | `optional_runtime`     | `development`, `preview`, `production` | No            | Yes          |
| `ENABLE_PEXELS`                                      | `optional_runtime`     | `development`, `preview`, `production` | No            | Yes          |
| `ENV_VAR_ENCRYPTION_KEY`                             | `shared_runtime`       | `development`, `preview`, `production` | No            | No           |
| `FIGMA_ACCESS_TOKEN`                                 | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `GENERATIONSLOGG`                                    | `local_only`           | —                                      | No            | Yes          |
| `GITHUB_CLIENT_ID`                                   | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `GITHUB_CLIENT_ID_DEV`                               | `optional_runtime`     | `development`                          | Yes           | No           |
| `GITHUB_CLIENT_SECRET_DEV`                           | `optional_runtime`     | `development`                          | Yes           | No           |
| `GITHUB_REDIRECT_URI`                                | `optional_runtime`     | —                                      | Yes           | No           |
| `GITHUB_TOKEN`                                       | `local_only`           | —                                      | No            | No           |
| `GITHUB_WORKFLOW_TOKEN`                              | `local_only`           | —                                      | No            | No           |
| `GOOGLE_CLIENT_ID`                                   | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `GOOGLE_CLIENT_ID_DEV`                               | `optional_runtime`     | `development`                          | Yes           | No           |
| `GOOGLE_CLIENT_SECRET_DEV`                           | `optional_runtime`     | `development`                          | Yes           | No           |
| `GOOGLE_REDIRECT_URI`                                | `optional_runtime`     | —                                      | Yes           | No           |
| `IMPLEMENT_UNDERSCORE_CLAW`                          | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `JWT_SECRET`                                         | `shared_runtime`       | `development`, `preview`, `production` | No            | No           |
| `KV_URL`                                             | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `LEGACY_EMAIL_AUTO_VERIFY_BEFORE`                    | `optional_runtime`     | `development`, `preview`, `production` | No            | Yes          |
| `LOG_PROMPTS`                                        | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `LOOPIA_API_PASSWORD`                                | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `LOOPIA_API_USER`                                    | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `NEXT_PHASE`                                         | `vercel_managed`       | —                                      | No            | Yes          |
| `NEXT_PUBLIC_APP_URL`                                | `environment_specific` | `preview`, `production`                | No            | No           |
| `NEXT_PUBLIC_AVATAR_AGENT_ID`                        | `environment_specific` | `production`, `preview`                | No            | No           |
| `NEXT_PUBLIC_AVATAR_CLIENT_KEY`                      | `environment_specific` | `production`, `preview`                | No            | No           |
| `NEXT_PUBLIC_AVATAR_ENABLED`                         | `environment_specific` | `production`, `preview`                | No            | No           |
| `NEXT_PUBLIC_BASE_URL`                               | `environment_specific` | `preview`, `production`                | No            | No           |
| `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | `environment_specific` | `development`, `preview`, `production` | Yes           | No           |
| `NODE_ENV`                                           | `vercel_managed`       | —                                      | No            | Yes          |
| `OC_DEBUG`                                           | `optional_runtime`     | `development`, `preview`               | No            | No           |
| `OC_DEBUG_ALLOW_PROD`                                | `optional_runtime`     | —                                      | No            | No           |
| `OC_DEBUG_RUN_TOKEN`                                 | `optional_runtime`     | `development`, `preview`               | No            | No           |
| `OC_DEBUGG`                                          | `optional_runtime`     | `development`, `preview`               | No            | No           |
| `OC_REPO_READ_TOKEN`                                 | `optional_runtime`     | `development`, `preview`               | No            | No           |
| `OC_REPO_SLUG`                                       | `optional_runtime`     | `development`, `preview`               | No            | No           |
| `OPENAI_API_KEY`                                     | `shared_runtime`       | `development`, `preview`, `production` | No            | No           |
| `OPENCLAW_GATEWAY_TOKEN`                             | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `OPENCLAW_GATEWAY_URL`                               | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `POSTGRES_POOL_IDLE_TIMEOUT_MS`                      | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `POSTGRES_POOL_MAX`                                  | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `POSTGRES_URL`                                       | `shared_runtime`       | `development`, `preview`, `production` | No            | No           |
| `POSTGRES_URL_NON_POOLING`                           | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `REDIS_URL`                                          | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `RENDER`                                             | `local_only`           | —                                      | No            | Yes          |
| `RESEND_API_KEY`                                     | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_ASSIST_MODEL`                            | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR`                 | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_BLOCKING_ESLINT`                         | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_BLOCKING_ESLINT_MAX_WARNINGS`            | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_BRANDED_LIVE_URLS`                       | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_DEFAULT_THINKING`                        | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT`              | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_DEV_LOG`                                 | `local_only`           | —                                      | No            | Yes          |
| `SAJTMASKIN_DOSSIER_PIPELINE`                        | `environment_specific` | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_F2_PRODUCT_POSTCHECK`                    | `optional_runtime`     | `development`, `preview`               | Yes           | No           |
| `SAJTMASKIN_LIVE_SITE_DOMAIN`                        | `environment_specific` | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_LLM_FIXER_TIMEOUT_MS`                    | `environment_specific` | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_LLM_FIXER_TIMEOUT_RETRY_MS`              | `environment_specific` | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_MAX_AI_BRIEF_PROMPT_CHARS`               | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_MAX_AI_CHAT_MESSAGE_CHARS`               | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_MAX_PROMPT_HANDOFF_CHARS`                | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_MAX_SYSTEM_LENGTH`                       | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_METRICS_TOKEN`                           | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_MODEL_ANTHROPIC`                         | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_MODEL_CODEX`                             | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_MODEL_FAST`                              | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_MODEL_MAX`                               | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_MODEL_PRO`                               | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_PHASE_FORCE_AUDIT_CHARS`                 | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_PHASE_FORCE_CHARS`                       | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_PLAN_MODE_MAX_PLAN_CHARS`                | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_PLAN_MODE_PHASE_THRESHOLD_CHARS`         | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_POLISH_MODEL`                            | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_PRE_VM_TYPECHECK`                        | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT`             | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_PREVIEW_HOST_API_KEY`                    | `environment_specific` | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_PREVIEW_HOST_BASE_URL`                   | `environment_specific` | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_PREVIEW_PREWARM`                         | `optional_runtime`     | `development`, `preview`               | Yes           | No           |
| `SAJTMASKIN_PROMPT_DUMP`                             | `local_only`           | —                                      | No            | No           |
| `SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD`         | `optional_runtime`     | —                                      | Yes           | No           |
| `SAJTMASKIN_REFUSE_DOSSIER_STUBS`                    | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_SHIM_PREVIEW_DISABLED`                   | `optional_runtime`     | `preview`, `production`                | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_APP_CHARS`                   | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_AUDIT_CHARS`                 | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_FOLLOWUP_CHARS`              | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_FREEFORM_CHARS`              | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_TECHNICAL_CHARS`             | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_TEMPLATE_CHARS`              | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_SOFT_TARGET_WIZARD_CHARS`                | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_STRICT_GENERATED_ARTIFACTS`              | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `SAJTMASKIN_TRUST_X_FORWARDED_FOR`                   | `optional_runtime`     | —                                      | No            | No           |
| `SAJTMASKIN_VERIFIER_MAX_OUTPUT_TOKENS`              | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_VERIFIER_PASS`                           | `environment_specific` | `development`, `preview`, `production` | No            | No           |
| `SAJTMASKIN_VERIFIER_SNIPPET_CHARS_PER_FILE`         | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_VERIFIER_TIMEOUT_MS`                     | `environment_specific` | `production`                           | No            | No           |
| `SAJTMASKIN_VISUAL_QA`                               | `environment_specific` | `preview`, `production`                | No            | Yes          |
| `SAJTMASKIN_WARN_SYSTEM_LENGTH`                      | `environment_specific` | `production`                           | No            | No           |
| `STORAGE_BACKEND`                                    | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `STRIPE_PRICE_10_CREDITS`                            | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `STRIPE_PRICE_25_CREDITS`                            | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `STRIPE_PRICE_50_CREDITS`                            | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `STRIPE_SECRET_KEY`                                  | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SUPERADMIN_DIAMONDS`                                | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `SUPERADMIN_EMAIL`                                   | `optional_runtime`     | `development`, `preview`, `production` | Yes           | No           |
| `TEST_USER_EMAIL`                                    | `local_only`           | —                                      | Yes           | No           |
| `TEST_USER_PASSWORD`                                 | `local_only`           | —                                      | Yes           | No           |
| `UNSPLASH_ACCESS_KEY`                                | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `UPSTASH_REDIS_REST_TOKEN`                           | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `UPSTASH_REDIS_REST_URL`                             | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `USE_RESPONSES_API`                                  | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `VERCEL_OIDC_TOKEN`                                  | `environment_specific` | `development`                          | No            | No           |
| `VERCEL_PROJECT_ID`                                  | `shared_runtime`       | `development`, `preview`, `production` | No            | No           |
| `VERCEL_TEAM_ID`                                     | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |
| `VERCEL_TOKEN`                                       | `shared_runtime`       | `development`, `preview`, `production` | No            | No           |
| `VERCEL_TOKEN_FULL`                                  | `local_only`           | —                                      | No            | No           |
| `VERCEL_WEBHOOK_SECRET`                              | `optional_runtime`     | `development`, `preview`, `production` | No            | No           |

## Dossier environment enforcement

| Dossier                 | Capability             | Key                                  | Required | Enforcement       | F2 mock   |
| ----------------------- | ---------------------- | ------------------------------------ | -------- | ----------------- | --------- |
| `ably-realtime`         | `realtime`             | `ABLY_API_KEY`                       | Yes      | `feature-runtime` | `none`    |
| `ai-tool-calling-chat`  | `ai-tool-calling`      | `OPENAI_API_KEY`                     | Yes      | `feature-runtime` | `canned`  |
| `clerk-auth`            | `auth`                 | `CLERK_SECRET_KEY`                   | Yes      | `build`           | `none`    |
| `clerk-auth`            | `auth`                 | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | Yes      | `build`           | `none`    |
| `clerk-auth`            | `auth`                 | `NEXT_PUBLIC_CLERK_SIGN_IN_URL`      | No       | `warn-only`       | `none`    |
| `clerk-auth`            | `auth`                 | `NEXT_PUBLIC_CLERK_SIGN_UP_URL`      | No       | `warn-only`       | `none`    |
| `fal-image-generation`  | `image-generation`     | `FAL_API_KEY`                        | Yes      | `feature-runtime` | `canned`  |
| `mailchimp-newsletter`  | `newsletter-subscribe` | `MAILCHIMP_API_KEY`                  | Yes      | `feature-runtime` | `success` |
| `mailchimp-newsletter`  | `newsletter-subscribe` | `MAILCHIMP_AUDIENCE_ID`              | Yes      | `feature-runtime` | `success` |
| `mailchimp-newsletter`  | `newsletter-subscribe` | `MAILCHIMP_DC`                       | No       | `warn-only`       | `success` |
| `mongodb-atlas`         | `database`             | `MONGODB_URI`                        | Yes      | `feature-runtime` | `seed`    |
| `neon-postgres`         | `database`             | `DATABASE_URL`                       | Yes      | `feature-runtime` | `seed`    |
| `openai-chat`           | `ai-chat`              | `OPENAI_API_KEY`                     | Yes      | `feature-runtime` | `canned`  |
| `paddle-billing`        | `subscriptions`        | `NEXT_PUBLIC_PADDLE_ENV`             | No       | `warn-only`       | `none`    |
| `paddle-billing`        | `subscriptions`        | `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Yes      | `feature-runtime` | `none`    |
| `paddle-billing`        | `subscriptions`        | `NEXT_PUBLIC_SUPABASE_URL`           | Yes      | `feature-runtime` | `none`    |
| `paddle-billing`        | `subscriptions`        | `PADDLE_API_KEY`                     | Yes      | `feature-runtime` | `none`    |
| `paddle-billing`        | `subscriptions`        | `PADDLE_NOTIFICATION_WEBHOOK_SECRET` | Yes      | `feature-runtime` | `none`    |
| `paddle-billing`        | `subscriptions`        | `SUPABASE_SERVICE_ROLE_KEY`          | Yes      | `feature-runtime` | `none`    |
| `plausible-analytics`   | `analytics`            | `NEXT_PUBLIC_PLAUSIBLE_API_HOST`     | No       | `warn-only`       | `none`    |
| `plausible-analytics`   | `analytics`            | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`       | Yes      | `warn-only`       | `none`    |
| `postgres-drizzle`      | `database`             | `DATABASE_URL`                       | Yes      | `feature-runtime` | `seed`    |
| `rag-chat`              | `rag-chat`             | `DATABASE_URL`                       | Yes      | `feature-runtime` | `canned`  |
| `rag-chat`              | `rag-chat`             | `OPENAI_API_KEY`                     | Yes      | `feature-runtime` | `canned`  |
| `resend-contact-form`   | `contact-form`         | `CONTACT_EMAIL_TO`                   | Yes      | `feature-runtime` | `success` |
| `resend-contact-form`   | `contact-form`         | `EMAIL_FROM`                         | Yes      | `feature-runtime` | `success` |
| `resend-contact-form`   | `contact-form`         | `RESEND_API_KEY`                     | Yes      | `feature-runtime` | `success` |
| `sanity-cms`            | `cms`                  | `NEXT_PUBLIC_SANITY_API_VERSION`     | No       | `warn-only`       | `seed`    |
| `sanity-cms`            | `cms`                  | `NEXT_PUBLIC_SANITY_DATASET`         | Yes      | `feature-runtime` | `seed`    |
| `sanity-cms`            | `cms`                  | `NEXT_PUBLIC_SANITY_PROJECT_ID`      | Yes      | `feature-runtime` | `seed`    |
| `sanity-cms`            | `cms`                  | `NEXT_PUBLIC_SANITY_STUDIO_URL`      | No       | `warn-only`       | `seed`    |
| `sanity-cms`            | `cms`                  | `SANITY_API_TOKEN`                   | No       | `feature-runtime` | `seed`    |
| `sentry-error-tracking` | `error-tracking`       | `NEXT_PUBLIC_SENTRY_DSN`             | No       | `warn-only`       | `none`    |
| `sentry-error-tracking` | `error-tracking`       | `SENTRY_ENVIRONMENT`                 | No       | `warn-only`       | `none`    |
| `sentry-error-tracking` | `error-tracking`       | `SENTRY_TRACES_SAMPLE_RATE`          | No       | `warn-only`       | `none`    |
| `stripe-checkout`       | `payments`             | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes      | `warn-only`       | `none`    |
| `stripe-checkout`       | `payments`             | `STRIPE_SECRET_KEY`                  | Yes      | `feature-runtime` | `none`    |
| `supabase-auth`         | `supabase-auth`        | `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Yes      | `feature-runtime` | `none`    |
| `supabase-auth`         | `supabase-auth`        | `NEXT_PUBLIC_SUPABASE_URL`           | Yes      | `feature-runtime` | `none`    |

## Control-plane registry

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
