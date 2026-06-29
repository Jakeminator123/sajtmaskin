---
id: 2026-06-17-env-cleanup-inventory
status: scope
created: 2026-06-17
linear: null
parent: null
supersedes: null
---

# Env-var cleanup inventory — `sajtmaskin` (+ `sajtbyggaren-viewser`)

Read-only audit. **No env var was added/removed/changed; `.env.local` untouched; no commit; no branch switch.** All values masked — only derived facts (presence, value length, equality-vs-local via SHA-256 hash compare, secret-heuristic, code-reference).

Sources: `src/lib/env.ts` (`serverSchema` = canonical names the app reads), `config/env-policy.json` (classification + recommended targets), `docs/ENV.md`, `vercel env ls` (×3 envs), `vercel env pull` to temp (×3, parsed in-memory), repo grep.

## 1. Summary counts

| Scope | Count |
|---|---|
| `sajtmaskin` user-managed vars — production | 76 |
| `sajtmaskin` user-managed vars — preview | 75 |
| `sajtmaskin` user-managed vars — development | 93 |
| `sajtmaskin` user-managed **union** (all envs + local) | 95 |
| Platform-injected (not user-managed, excluded) | 21 |
| `sajtbyggaren-viewser` vars (each of prod/preview/dev, identical) | 24 |

| Category | Count | Names |
|---|---|---|
| KEEP_SECRET (true secrets) | 36 | keep + re-add on rebuild |
| KEEP — required, **non-secret** | 19 | keep (env-specific config / public keys / identifiers) |
| LOW_VALUE | 38 | **removal candidates** (flags/toggles/tuning/model-pins/debug) |
| LEGACY_BUG | 1 | `JUICEFACTORY_API` |
| REQUIRED_MISSING | 1 | `NEXT_PUBLIC_BASE_URL` |
| UNREFERENCED | 0 | (none — every user var is referenced in code) |
| DUPLICATE | (tag, not bucket) | most local vars duplicate their Vercel value; see notes |

**Removal candidates (LOW_VALUE + UNREFERENCED + LEGACY_BUG) = 39 names.**

Legend — envs present: `P`=production `V`=preview `D`=development `L`=.env.local. equalsLocal: `all` = equal in every env it exists in; `≠` = differs; `n/a` = not in local. `len` = value length (local if present, else first env). secret? per `/KEY|TOKEN|SECRET|PASSWORD|_URL$|CREDENTIAL|PRIVATE|DSN|SIGNING|CLIENT_ID|WEBHOOK/i` with manual correction noted via *.

## 2. LEGACY_BUG

| var | envs | inLocal | equalsLocal | secret? | referenced? | category | recommendation |
|---|---|---|---|---|---|---|---|
| `JUICEFACTORY_API` | P V D L | yes | all | yes* (len 72, `pk_live_…`) | **no (app)** | LEGACY_BUG | **Remove from sajtmaskin prod+preview+dev and from `.env.local`.** Not in `serverSchema` nor `env-policy.json`. App never reads bare `JUICEFACTORY_API` (`process.env.JUICEFACTORY_API` = 0 hits). The only consumer is the **OpenClaw gateway** (`infra/openclaw/` → Render) via the *different* name `JUICEFACTORY_API_KEY`. Its 5 "code hits" were substring matches of `JUICEFACTORY_API_KEY`. Keep the key only on the Render gateway; **rotate it** (a live `pk_live_` key has been duplicated into 3 Vercel envs + local). |

## 3. REQUIRED_MISSING

| var | envs | inLocal | secret? | referenced? | category | recommendation |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | L only | yes | no* (public URL) | yes | REQUIRED_MISSING | `env-policy` recommends preview+production; set **only locally**, absent on all Vercel envs. Read in code. Either add to preview+production, or confirm it is superseded by `NEXT_PUBLIC_APP_URL` and delete it (naming overlap — see bug list). |

Soft gaps (policy recommends but absent — optional/`knownEmptyOk`, not hard bugs): `POSTGRES_POOL_MAX` (missing preview), `SAJTMASKIN_F2_PRODUCT_POSTCHECK` (missing preview), `INSPECTOR_CAPTURE_WORKER_URL`/`INSPECTOR_CAPTURE_WORKER_TOKEN` (dev only), `BACKOFFICE_PASSWORD`/`FIGMA_ACCESS_TOKEN`/`SAJTMASKIN_STRICT_GENERATED_ARTIFACTS` (unset everywhere).

## 4. KEEP_SECRET — true secrets (36)

Always keep; re-add on rebuild. All referenced in code; all secret?=yes (heuristic) unless noted.

| var | envs | inLocal | equalsLocal | len | recommendation |
|---|---|---|---|---|---|
| `ADMIN_CREDENTIALS` | P V D L | yes | all | 11 | keep |
| `ANTHROPIC_API_KEY` | P V D L | yes | all | 108 | keep |
| `BLOB_READ_WRITE_TOKEN` | P V D L | yes | all | 62 | keep |
| `BRAVE_API_KEY` | P V D L | yes | all | 31 | keep |
| `ENV_VAR_ENCRYPTION_KEY` | P V D L | yes | all | 64 | keep — must match wherever stored ciphertext is read/written |
| `GITHUB_CLIENT_ID` | P V D L | yes | all | 20 | keep (OAuth id) |
| `GITHUB_CLIENT_SECRET` | P V D L | yes | all | 40 | keep |
| `GITHUB_TOKEN` | D L | yes | dev=yes | 36 | keep (local/dev tooling; `local_only` in policy) |
| `GOOGLE_API_KEY` | P V D L | yes | all | 39 | keep |
| `GOOGLE_CLIENT_ID` | P V D L | yes | all | 71 | keep (OAuth id) |
| `GOOGLE_CLIENT_SECRET` | P V D L | yes | all | 35 | keep |
| `INBOUND_WEBHOOK_SHARED_SECRET` | P V D L | yes | all | 40 | keep |
| `INSPECTOR_CAPTURE_WORKER_TOKEN` | D L | yes | dev=yes | 25 | keep (dev) |
| `JWT_SECRET` | P V D L | yes | all | 64 | keep — **see hardening note** (same secret in all envs) |
| `KOSTNADSFRI_API_KEY` | P V D L | yes | all | 11 | keep |
| `KOSTNADSFRI_PASSWORD_SEED` | P V D L | yes | all | 11 | keep |
| `KV_REST_API_TOKEN` | P V D L | yes | all | 63 | keep |
| `KV_REST_API_URL` | P V D L | yes | all | 39 | keep |
| `KV_URL` | P V D | no | n/a | 117 | keep (deployed only; not in local) |
| `OPENAI_API_KEY` | P V D L | yes | all | 164 | keep |
| `OPENCLAW_GATEWAY_TOKEN` | P V D L | yes | all | 64 | keep |
| `OPENCLAW_GATEWAY_URL` | P V D L | yes | all | 32 | keep (must point at separate gateway host, not self) |
| `POSTGRES_URL` | P V D L | yes | dev=yes; prod,prev≠ | 105 | keep — divergence expected (per-env DB) |
| `POSTGRES_URL_NON_POOLING` | P V D L | yes | dev=yes; prod,prev≠ | 83 | keep (secret; heuristic missed — DB conn string) |
| `REDIS_URL` | P V D L | yes | all | 117 | keep |
| `RESEND_API_KEY` | P V D L | yes | all | 36 | keep |
| `SAJTMASKIN_METRICS_TOKEN` | P V D L | yes | dev=yes; prod,prev≠ | 64 | keep (per-env bearer token; divergence OK) |
| `SAJTMASKIN_PREVIEW_HOST_API_KEY` | P V D L | yes | all | 64 | keep |
| `STRIPE_SECRET_KEY` | P V D L | yes | all | 107 | keep |
| `STRIPE_WEBHOOK_SECRET` | P V D L | yes | all | 38 | keep |
| `SUPERADMIN_PASSWORD` | P V D | no | n/a | 14 | keep (deployed only) |
| `UNSPLASH_ACCESS_KEY` | P V D L | yes | all | 43 | keep |
| `UPSTASH_REDIS_REST_TOKEN` | P V D L | yes | all | 63 | keep |
| `UPSTASH_REDIS_REST_URL` | P V D L | yes | all | 39 | keep |
| `VERCEL_TOKEN` | P V D L | yes | all | 60 | keep |
| `VERCEL_WEBHOOK_SECRET` | P V D L | yes | all | 24 | keep |

## 5. KEEP — required, non-secret (19)

Keep (env-specific config, public keys, identifiers, billing price-ids, admin gating). Not removal candidates.

| var | envs | inLocal | equalsLocal | secret? | recommendation |
|---|---|---|---|---|---|
| `ADMIN_EMAILS` | P V D L | yes | all | no | keep (admin gating) — consolidate w/ `NEXT_PUBLIC_ADMIN_EMAIL(S)` |
| `IMPLEMENT_UNDERSCORE_CLAW` | P V D L | yes | all | no | keep (gates OpenClaw widget; all 3 OpenClaw vars required) |
| `INSPECTOR_CAPTURE_WORKER_URL` | D L | yes | dev=yes | no | keep (dev worker URL) |
| `NEXT_PUBLIC_ADMIN_EMAIL` | P V D L | yes | all | no | keep — overlaps `NEXT_PUBLIC_ADMIN_EMAILS` |
| `NEXT_PUBLIC_ADMIN_EMAILS` | P V D L | yes | all | no | keep — overlaps `NEXT_PUBLIC_ADMIN_EMAIL` |
| `NEXT_PUBLIC_APP_URL` | P V D L | yes | dev=yes; prod,prev≠ | no* | keep (env-specific URL) — overlaps `NEXT_PUBLIC_BASE_URL` |
| `NEXT_PUBLIC_AVATAR_AGENT_ID` | P V D L | yes | all | no | keep (public D-ID id) |
| `NEXT_PUBLIC_AVATAR_CLIENT_KEY` | P V D L | yes | dev=yes; prod,prev≠ | no* (public) | keep |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | P V | no | n/a | no* (public, referrer-locked) | keep |
| `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | P V D L | yes | all | no | keep (could default to `fly.dev` in code) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | P V D L | yes | all | no* (publishable) | keep |
| `SAJTMASKIN_PREVIEW_HOST_BASE_URL` | P V D L | yes | all | no* (URL) | keep (active tier-2 selector) |
| `STORAGE_BACKEND` | P V D L | yes | dev=yes; prod,prev≠ | no | keep (env-differentiating: fs vs json-blob) |
| `STRIPE_PRICE_10_CREDITS` | P V D L | yes | all | no | keep (Stripe price id) |
| `STRIPE_PRICE_25_CREDITS` | P V D L | yes | all | no | keep (Stripe price id) |
| `STRIPE_PRICE_50_CREDITS` | P V D L | yes | all | no | keep (Stripe price id) |
| `SUPERADMIN_EMAIL` | P V D L | yes | all | no | keep (admin gating) |
| `VERCEL_PROJECT_ID` | P V D L | yes | all | no | keep (app reads for Vercel REST) |
| `VERCEL_TEAM_ID` | P V D L | yes | all | no | keep (app reads for Vercel REST) |

## 6. LOW_VALUE — removal candidates (38)

Feature flags, debug toggles, short scalar/tuning, model-pins. Code has defaults. **Drop from Vercel and let code default** (verify the code default matches the desired runtime before deleting a currently-ON flag).

| var | envs | inLocal | equalsLocal | len | referenced? | recommendation |
|---|---|---|---|---|---|---|
| `AUDIT_WEB_SEARCH` | P V D L | yes | all | 4 | yes | drop — toggle |
| `AUTH_DEBUG` | D L | yes | dev=yes | 4 | yes | drop from Vercel dev — `local_only` debug flag |
| `BACKOFFICE_SESSION_VERSION` | P V D L | yes | all | 1 | yes | drop — default `1` in code |
| `CSP_ENFORCE` | P V D L | yes | all | 5 | yes | drop — toggle |
| `DB_SSL_REJECT_UNAUTHORIZED` | P V D L | yes | all | 5 | yes | drop — toggle |
| `EMAIL_FROM` | P V D L | yes | all | 34 | yes | drop — equals `serverSchema` default `Sajtmaskin <noreply@sajtmaskin.se>` |
| `ENABLE_PEXELS` | P V D L | yes | all | 5 | yes | drop — toggle |
| `GENERATIONSLOGG` | D L | yes | dev=yes | 1 | yes | drop from Vercel dev — `local_only` |
| `INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS` | P V D L | yes | all | 5 | yes | drop — numeric tuning, default exists |
| `INSPECTOR_FORCE_WORKER_ONLY` | P V D L | yes | all | 5 | yes | drop — flag |
| `LOG_PROMPTS` | P V D L | yes | prod,dev=yes; **prev≠** | 4 | yes | drop — toggle; preview value diverges |
| `NEXT_PUBLIC_BETA_BANNER` | P V D L | yes | all | 1 | yes | drop — banner toggle |
| `POSTGRES_POOL_MAX` | P D L | yes | all | 2 | yes | drop — code auto-selects pool size (preview already unset, harmless) |
| `SAJTMASKIN_ASSIST_MODEL` | D L | yes | dev=yes | 7 | yes | drop — model pin (catalog default) |
| `SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS` | D L | yes | dev=yes | 3 | yes | drop — tuning |
| `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR` | D L | yes | dev=yes | 1 | yes | drop — per-env code default exists |
| `SAJTMASKIN_BLOCKING_ESLINT` | P V D L | yes | all | 4 | yes | drop — flag, default off (F3 forces) |
| `SAJTMASKIN_DEFAULT_THINKING` | P V D L | yes | all | 4 | yes | drop — code default exists |
| `SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT` | P V D L | yes | all | 4 | yes | drop — flag, default off |
| `SAJTMASKIN_DEV_LOG` | D L | yes | dev=yes | 4 | yes | drop from Vercel dev — `local_only` |
| `SAJTMASKIN_DOSSIER_PIPELINE` | P V D L | yes | prev,dev=yes; **prod≠** | 4 | yes | drop — code default ON; **verify prod still = true** (ENV.md requires it) |
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | P V D L | yes | **all ≠ each other** | 6 | yes | drop or confirm — numeric tuning diverges across all envs |
| `SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS` | D L | yes | dev=yes | 3 | yes | drop — tuning |
| `SAJTMASKIN_F2_PRODUCT_POSTCHECK` | D L | yes | dev=yes | 5 | yes | drop — opt-in flag, default off |
| `SAJTMASKIN_MODEL_ANTHROPIC` | P V D L | yes | dev=yes; prod,prev≠ | 17 | yes | drop — model pin |
| `SAJTMASKIN_MODEL_CODEX` | D L | yes | dev=yes | 13 | yes | drop — model pin |
| `SAJTMASKIN_MODEL_FAST` | D L | yes | dev=yes | 7 | yes | drop — model pin |
| `SAJTMASKIN_MODEL_MAX` | D L | yes | dev=yes | 7 | yes | drop — model pin |
| `SAJTMASKIN_MODEL_PRO` | D L | yes | dev=yes | 13 | yes | drop — model pin |
| `SAJTMASKIN_POLISH_MODEL` | D L | yes | dev=yes | 13 | yes | drop — model pin |
| `SAJTMASKIN_PRE_VM_TYPECHECK` | P V D L | yes | all | 4 | yes | drop — flag, default off (F3 forces) |
| `SAJTMASKIN_PROMPT_DUMP` | D L | yes | dev=yes | 4 | yes | drop from Vercel dev — `local_only` |
| `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH` | P V D L | yes | all | 2 | yes | drop — scaffold tuning (not a secret; heuristic false-positive on "KEY"word) |
| `SAJTMASKIN_SHIM_PREVIEW_DISABLED` | P V D L | yes | all | 4 | yes | drop — legacy shim opt-out, default disabled |
| `SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS` | D L | yes | dev=yes | 6 | yes | drop — tuning |
| `SAJTMASKIN_VERIFIER_PASS` | P V D L | yes | all | 1 | yes | keep-or-drop — `env-policy` sets it intentionally on all 3; safe to drop if code default = on |
| `SUPERADMIN_DIAMONDS` | P V D L | yes | all | 5 | yes | drop — superadmin grant; default in code |
| `USE_RESPONSES_API` | P V D L | yes | all | 4 | yes | drop — toggle |

## 7. Platform-injected (21) — not user-managed, exclude from cleanup

Auto-set by Vercel/Next/Turbo on pull or build; not in `vercel env ls`, cannot be sensibly deleted: `VERCEL_OIDC_TOKEN`, `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_TARGET_ENV`, `NX_DAEMON`, `TURBO_CACHE`, `TURBO_DOWNLOAD_LOCAL_ENABLED`, `TURBO_REMOTE_ONLY`, `TURBO_RUN_SUMMARY`, `VERCEL_GIT_COMMIT_AUTHOR_LOGIN`, `VERCEL_GIT_COMMIT_AUTHOR_NAME`, `VERCEL_GIT_COMMIT_MESSAGE`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_PREVIOUS_SHA`, `VERCEL_GIT_PROVIDER`, `VERCEL_GIT_PULL_REQUEST_ID`, `VERCEL_GIT_REPO_ID`, `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG`.

## 8. `sajtbyggaren-viewser` (names only, value-compare skipped)

Separate project (Vercel-Sandbox preview service). **24 vars, identical membership across production / preview / development.** No overlap cleanup needed with sajtmaskin. Names: `VIEWSER_SANDBOX_SPIKE_TTL_MS`, `VIEWSER_SANDBOX_REUSE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_INPUT_USD_PER_1K`, `OPENAI_OUTPUT_USD_PER_1K`, `ASSET_STORE_DRIVER`, `VIEWSER_PREVIEW_MODE`, `NEXT_PUBLIC_VIEWSER_PREVIEW_MODE`, `VIEWSER_ALLOW_NON_LOCALHOST`, `VIEWSER_ENABLE_HOSTED_SANDBOX`, `VIEWSER_ENABLE_HOSTED_BUILD`, `VIEWSER_BUILD_CONTEXT_URL`, `KV_REST_API_URL`, `KV_URL`, `KV_REST_API_READ_ONLY_TOKEN`, `REDIS_URL`, `KV_REST_API_TOKEN`, `BLOB_WEBHOOK_PUBLIC_KEY`, `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`.

## 9. Bug list

1. **Misplaced live secret / unknown var — `JUICEFACTORY_API`.** On sajtmaskin P+V+D + `.env.local` as a `pk_live_…` value, but the app never reads it; the consumer is the OpenClaw gateway on Render via `JUICEFACTORY_API_KEY`. Not in `serverSchema`/`env-policy`. → remove from sajtmaskin, keep only on the gateway, **rotate the key**.
2. **Required-but-missing — `NEXT_PUBLIC_BASE_URL`.** Read in code, recommended for preview+production, present only locally → add it or fold into `NEXT_PUBLIC_APP_URL`.
3. **Cross-env divergence to verify:**
   - `SAJTMASKIN_DOSSIER_PIPELINE`: prod value differs from preview/dev/local — ENV.md says it must be `true` on all three. Confirm prod is not accidentally disabled.
   - `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS`: differs across all three envs and local — confirm intentional, not drift.
   - `LOG_PROMPTS`: preview differs from prod/dev/local.
   - Expected/benign divergence (env-specific): `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `STORAGE_BACKEND`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AVATAR_CLIENT_KEY`, `SAJTMASKIN_METRICS_TOKEN`, `SAJTMASKIN_MODEL_ANTHROPIC`.
4. **Hardening — shared `JWT_SECRET`.** Identical in dev/preview/prod (+local); a dev leak can forge prod sessions. Use a distinct production secret. (`ENV_VAR_ENCRYPTION_KEY` is also identical across envs — only split if each env has its own ciphertext store, otherwise it must stay shared.)
5. **`local_only` flags sitting on Vercel dev:** `AUTH_DEBUG`, `SAJTMASKIN_DEV_LOG`, `GENERATIONSLOGG`, `SAJTMASKIN_PROMPT_DUMP` — drop from Vercel dev.
6. **Var in `.env.local` unknown to `env-policy`:** `JUICEFACTORY_API` (only one; all other local names are in policy/schema).
7. **Schema drift (doc only):** read directly via `process.env` but absent from `serverSchema`, while ENV.md calls `serverSchema` the single source of truth: `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR`, `SAJTMASKIN_BLOCKING_ESLINT`, `SAJTMASKIN_METRICS_TOKEN`, `SAJTMASKIN_PRE_VM_TYPECHECK`, `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH`. Add to schema or note the exception.
8. **No committed secrets.** `git ls-files` matches only `config/ai_models/40-harmless-placeholders.env.txt` and `41-tier3-stub-placeholders.env.txt` (intentional placeholder templates). Caveat: `docs/plans/avklarat/dossier-brief-sync.md` names `JUICEFACTORY_API="pk_live_…"` (value redacted with ellipsis) — scrub the reference.
9. **Overlapping keys:** `NEXT_PUBLIC_ADMIN_EMAIL` (singular) vs `NEXT_PUBLIC_ADMIN_EMAILS` (plural) vs `ADMIN_EMAILS`; and `NEXT_PUBLIC_APP_URL` vs `NEXT_PUBLIC_BASE_URL` — consolidate each pair/trio.
10. **Local↔Vercel asymmetry:** on Vercel but not local — `KV_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `SUPERADMIN_PASSWORD` (fine, deployed-only). In local but not Vercel — `NEXT_PUBLIC_BASE_URL` (bug #2).
11. **Project-level pile (separate from env):** **38+ throwaway `v0-*` Vercel projects** under `jakeminator123s-projects` (≥2 full pages, more remain; only `v0-modern-developer-portfolio-with` has a live URL). v0.dev experiments — candidates for bulk **project** deletion. Not env vars.

## 10. Recommended safe "start over" sequence (plan only — not executed)

1. **Backup first.** Re-pull each env to a kept, timestamped location and snapshot local:
   ```powershell
   $stamp = Get-Date -Format yyyyMMdd-HHmmss
   $bak = "C:\Users\jakem\dev\projects\sajtmaskin\.env-backups\$stamp"; New-Item -ItemType Directory $bak -Force
   Copy-Item 'C:\Users\jakem\dev\projects\sajtmaskin\.env.local' "$bak\env.local.bak" -Force
   foreach ($e in 'production','preview','development') { vercel env pull "$bak\sm_$e.env" --environment=$e --yes }
   ```
   (Ensure `.env-backups/` is gitignored.)
2. **Delete-set (39):** the LOW_VALUE (38) + LEGACY_BUG (`JUICEFACTORY_API`). Per env: `vercel env rm <NAME> <environment> --yes`. For `JUICEFACTORY_API` also remove from `.env.local`.
3. **Keep-set:** the 36 KEEP_SECRET + 19 KEEP-required stay. Do not touch platform-injected (§7).
4. **Re-add only on a clean rebuild:** KEEP_SECRET + required-non-secret. Let code defaults cover every dropped flag.
5. **Fixes:** add/clarify `NEXT_PUBLIC_BASE_URL` (or fold into `NEXT_PUBLIC_APP_URL`); verify `SAJTMASKIN_DOSSIER_PIPELINE=true` in prod; set a distinct prod `JWT_SECRET`; rotate the JuiceFactory key on the Render gateway.
6. **Verify after:** `npm run typecheck`; `python scripts/env/manage_env.py audit`.
7. **Separate track:** bulk-delete the `v0-*` projects (§9.11).

> Verification: `.env.local` confirmed **13320 bytes**, unchanged, after all reads. All temp pulls (`sm_env_prod.txt`, `sm_env_preview.txt`, `sm_env_dev.txt`, `sm_audit.ps1`) and the `viewser-check` dir were deleted; backup at `%TEMP%\env.local.backup.txt`.
