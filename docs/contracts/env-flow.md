# Env-flow map

Human-readable map of the **two different environments** in this repo and how
their `.env` layers fit together. It answers: *which env-key belongs to which
environment, who is the source of truth, which layer wins, and what is safe to
leave as a fake placeholder?* — without grepping the whole repo.

Code is always source of truth (see `AGENTS.md`). This doc is an index/map, not
a new enforcement layer. **No real secret value is ever canonical in the
placeholder files described below** — they hold fake/test placeholders only.

> Read-only backoffice companion: the **Env Readiness (read-only)** page
> (`backoffice/pages/env_readiness.py`) renders the per-key matrix derived from
> the same authorities. That view masks all values by design — it shows key
> name, classification and a boolean "has value" only, never a secret.

## The two environments (do not confuse them)

| Environment | What it is | Key authority | Classification authority |
|-------------|------------|---------------|--------------------------|
| **Sajtmaskin app env** | The control-plane app's own runtime env (this Next.js app) | [`src/lib/env.ts`](../../src/lib/env.ts) `serverSchema` (ultimate authority for which keys the app reads) | [`config/env-policy.json`](../../config/env-policy.json) (per-key classification + Vercel targets) |
| **Generated-site preview env** | The `.env.local` injected into a **generated user site** when it boots in preview / VM | [`src/lib/gen/preview/env-local.ts`](../../src/lib/gen/preview/env-local.ts) (merge order) | [`src/lib/integrations/placeholder-harmless.ts`](../../src/lib/integrations/placeholder-harmless.ts) (harmless vs tier-3 per key) |

The same key *name* can appear in both (e.g. `OPENAI_API_KEY`, `REDIS_URL`,
`POSTGRES_URL`). That is **not** a duplicate: in the app env it is the
Sajtmaskin app's own credential; in the generated-site env it is a placeholder
injected into a user's preview site. Different environment, different meaning.

## Sajtmaskin app env — classification (`config/env-policy.json`)

`env-policy.json` classifies every known app key. The classification drives the
recommended Vercel targets and how the absence of a key is treated.

| `classification` | Meaning | Enforcement feel |
|------------------|---------|------------------|
| `shared_runtime` | Core credential the app needs across dev/preview/prod (e.g. `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `ENV_VAR_ENCRYPTION_KEY`, `VERCEL_TOKEN`) | hard / build — required for the app to function |
| `optional_runtime` | Used only when a feature is active (e.g. model overrides, `REDIS_URL`, blob keys) | feature-runtime — absent ⇒ feature degrades |
| `environment_specific` | Value legitimately differs per environment (URLs, preview-host, prompt budgets) | feature-runtime / warn |
| `vercel_managed` | Set automatically by Vercel / Node (`NODE_ENV`, `NEXT_PHASE`) — do not push | warn-only |
| `local_only` | Local/dev-only flags (`DEBUG`, `AUTH_DEBUG`, `DATA_DIR`, test creds) | warn-only |

Supporting lists in the same file: `knownEmptyOk` (allowed to be empty),
`runtimeOnlyKeys` (read at runtime, not a Vercel-push concern) and
`extraKnownKeys` (recognized keys without an explicit rule). Human documentation
of actual values lives in [`docs/ENV.md`](../ENV.md).

## Generated-site preview env — merge order (`env-local.ts`)

When a generated site boots in preview, `buildPreviewEnvLocalContents` merges
layers. **Later layers override earlier ones**, so the generated layer always
wins:

```text
harmless  →  tier3-stub  →  project-preview  →  user  →  generated
(lowest priority)                                        (highest priority)
```

| Layer (`EnvVarProvenance`) | Source | Notes |
|----------------------------|--------|-------|
| `harmless` | [`config/ai_models/40-harmless-placeholders.env.txt`](../../config/ai_models/40-harmless-placeholders.env.txt) | Fake test/publishable values — **safe in F3** |
| `tier3-stub` | [`config/ai_models/41-tier3-stub-placeholders.env.txt`](../../config/ai_models/41-tier3-stub-placeholders.env.txt) | Boot-only stubs — **F2 only, stripped in F3** |
| `project-preview` | `src/lib/gen/preview/project-preview-env.ts` | Stable per-project preview tokens |
| `user` | decrypted `projectEnvVars` from app project meta | Operator-supplied real values |
| `generated` | `.env.local` emitted by the model | Highest priority override |

Read at runtime via
[`src/lib/ai-models/load-generated-site-placeholders.ts`](../../src/lib/ai-models/load-generated-site-placeholders.ts).

**F2 dossier-mock-seed (design only):** on top of the layers above, F2 seeds a
deterministic stub (`dossierMockPreviewEnvValue` → `<key>_placeholder_preview_not_real`)
for every selected dossier env key still unset after the real layers — even keys
the placeholder catalog does not cover (`EMAIL_FROM`, `CONTACT_EMAIL_TO`,
`FAL_API_KEY`, `MAILCHIMP_*`) — so each dossier renders its demo/mock surface in
the preview. It reuses the `tier3-stub` provenance on purpose (identical
lifecycle: F2-only, stripped in F3), is never run in F3, never persisted to
`projectEnvVars`, and never reaches a deploy. The stub vocabulary matches
[`stub-env-filter.ts`](../../src/lib/integrations/stub-env-filter.ts) so it is
never read as evidence of a configured integration. A real user/generated value
always wins.

## F2 vs F3 — the one rule that matters

| Stage (`PreviewLifecycleStage`) | Meaning | tier3-stub layer |
|---------------------------------|---------|------------------|
| `design` (**F2**) | Design / preview | **included** — stubs boot the project so the preview renders |
| `integrations` (**F3**) | Bygg integrationer / real services | **stripped** — the project must supply real values via `projectEnvVars`; missing tier-3 keys surface as a readiness failure via `src/lib/integrations/tier3-build-spec.ts` |

So:

- **harmless placeholder** = safe to leave fake in **both F2 and F3**. Stripe
  *publishable* test key, `AUTH_SECRET` (any 32-char string), public analytics
  IDs, public CMS/search read keys, local base URLs.
- **tier3-stub placeholder** = present in **F2 only**. A real value is required
  before F3 succeeds — this is what "blocks F3" means. Stripe *secret* key,
  Supabase URL + anon key, Clerk secret, OpenAI key, Redis/DB URLs, Upstash
  tokens, Resend, etc.

Classification is **per env-KEY**, not per integration: `STRIPE_SECRET_KEY` is
tier-3 (blocks F3) regardless of which integration uses it, while
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is harmless. The `.txt` fragment files are
organized to match the set in `placeholder-harmless.ts` and are kept honest by
`src/lib/integrations/placeholder-harmless.parity.test.ts`.

## Demo/mock-läge (F2) och ärlig publiceringsgrind

F2 ska rendera en trovärdig demo utan riktiga nycklar; F3-publicering ska bara
blockera på det som verkligen kräver en riktig integration.

- **Demo i F2:** varje hard-dossier deklarerar ett `mock`-läge
  (`canned`/`seed`/`success`/`none`, se
  [`dossier-system.md`](dossier-system.md)) som driver dossierns egen
  degraderingskod. Kombinerat med F2-mock-seeden ovan renderar preview-ytan utan
  riktiga nycklar. `mock` aktiveras när nyckeln saknas **eller** är en stub.
- **Enforcement styr blockering, inte "finns nyckeln i `env.example`".**
  `buildBlockingKeys` (`src/lib/project-env-resolver.ts`) = de okonfigurerade
  nycklar vars dossier-`enforcement` är `"build"`. Efter #468 har bara
  `clerk-auth` `build`-nycklar (`CLERK_SECRET_KEY` +
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) — trasig inloggning är värre än
  demo-friktion. `openai-chat`s `OPENAI_API_KEY` flyttades `build` → `feature-runtime`.
- **Deploy-grind:** `POST /api/v0/deployments` ger `409 DEPLOY_MISSING_ENV` på
  `buildBlockingKeys` i F3 och på `missingEnvKeys` (legacy-backstop) i F2 — F2
  förblir demo-publicerbart. `feature-runtime`/placeholder-nycklar blockerar
  aldrig; de surfar som icke-blockerande `EnvDegradationWarning`
  (`env-degradation-warnings.ts`).
- **F3-readiness/stream:** `finalize-design` och stream-routen gatar på samma
  riktiga build-nycklar (`412 tier3_env_not_ready`) och pekar mot
  Dossiers-panelen i previewpanelen — aldrig mot chatten (env-frågor hör inte
  hemma i F2/F3-chatten, se [`env-flow-f2-mute`](../../.cursor/rules/env-flow-f2-mute.mdc)).

## Sources of truth at a glance

| Question | Look here |
|----------|-----------|
| Which keys does the app read? | `src/lib/env.ts` (`serverSchema`) |
| How is an app key classified / which Vercel targets? | `config/env-policy.json` |
| Is a generated-site placeholder harmless or tier-3? | `src/lib/integrations/placeholder-harmless.ts` |
| What placeholder lines get injected (harmless)? | `config/ai_models/40-harmless-placeholders.env.txt` |
| What boot-only stubs get injected (F2)? | `config/ai_models/41-tier3-stub-placeholders.env.txt` |
| In what order do preview layers merge / who wins? | `src/lib/gen/preview/env-local.ts` (generated wins) |
| What does each app key value mean / deploy status? | `docs/ENV.md` |
| Read-only operator matrix of all of the above | `backoffice/pages/env_readiness.py` (Env Readiness page) |
