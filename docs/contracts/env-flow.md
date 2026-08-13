# Env-flow map

Human-readable map of the **two different environments** in this repo and how
their `.env` layers fit together. It answers: _which env-key belongs to which
environment, who is the source of truth, which layer wins, and what is safe to
leave as a fake placeholder?_ — without grepping the whole repo.

Code is always source of truth (see `AGENTS.md`). This doc is an index/map, not
a new enforcement layer. **No real secret value is ever canonical in the
placeholder files described below** — they hold fake/test placeholders only.

> Read-only backoffice companion: the **Env Readiness (read-only)** page
> (`backoffice/pages/env_readiness.py`) renders the per-key matrix derived from
> the same authorities. That view masks all values by design — it shows key
> name, classification and a boolean "has value" only, never a secret.

## The two environments (do not confuse them)

| Environment                    | What it is                                                                             | Key authority                                                                                             | Classification authority                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Sajtmaskin app env**         | The control-plane app's own runtime env (this Next.js app)                             | [`src/lib/env.ts`](../../src/lib/env.ts) `serverSchema` (ultimate authority for which keys the app reads) | [`config/env-policy.json`](../../config/env-policy.json) (per-key classification + Vercel targets)                                |
| **Generated-site preview env** | The `.env.local` injected into a **generated user site** when it boots in preview / VM | [`src/lib/gen/preview/env-local.ts`](../../src/lib/gen/preview/env-local.ts) (merge order)                | [`placeholder-harmless.ts`](../../src/lib/integrations/placeholder-harmless.ts) owns placeholder class; each selected dossier's `manifest.json` owns its env enforcement |

The same key _name_ can appear in both (e.g. `OPENAI_API_KEY`, `REDIS_URL`,
`POSTGRES_URL`). That is **not** a duplicate: in the app env it is the
Sajtmaskin app's own credential; in the generated-site env it is a placeholder
injected into a user's preview site. Different environment, different meaning.

For dossier-backed integrations, `manifest.json` is the authority for
`providers`, `envVars` and `envVars[].enforcement`. A `hard` dossier may be
keyless (for example Vercel Analytics); `hard` means provider/runtime-coupled,
not "has secrets". The manifest describes the code/runtime contract only:
Marketplace resource provisioning and automatic credential delivery are a
later layer, not a second env/provider registry today.

## Sajtmaskin app env — classification (`config/env-policy.json`)

`env-policy.json` classifies every known app key. The classification drives the
recommended Vercel targets and how the absence of a key is treated.

| `classification`       | Meaning                                                                                                                                               | Enforcement feel                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `shared_runtime`       | Core credential the app needs across dev/preview/prod (e.g. `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `ENV_VAR_ENCRYPTION_KEY`, `VERCEL_TOKEN`) | hard / build — required for the app to function |
| `optional_runtime`     | Used only when a feature is active (e.g. model overrides, `REDIS_URL`, blob keys)                                                                     | feature-runtime — absent ⇒ feature degrades     |
| `environment_specific` | Value legitimately differs per environment (URLs, preview-host, prompt budgets)                                                                       | feature-runtime / warn                          |
| `vercel_managed`       | Set automatically by Vercel / Node (`NODE_ENV`, `NEXT_PHASE`) — do not push                                                                           | warn-only                                       |
| `local_only`           | Local/dev-only flags (`DEBUG`, `AUTH_DEBUG`, `DATA_DIR`, test creds)                                                                                  | warn-only                                       |

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
| `generated` | `.env.local` emitted by the model | Highest priority override. **Not** the pipeline's own scaffold-injected placeholder `.env.local` — current finalized versions scope that artifact to selected dossiers (and older versions may carry the former full catalog). It is detected via `PIPELINE_ENV_LOCAL_MARKER` (`env-local.ts`) and skipped, so pipeline placeholders can never launder into this layer and shadow `user` values |

Read at runtime via
[`src/lib/ai-models/load-generated-site-placeholders.ts`](../../src/lib/ai-models/load-generated-site-placeholders.ts).

**Persistensgräns:** mergeordningen ovan gäller preview-VM:ens runtimefil.
`env.example` är en separat dokumentationsartefakt som skrivs till
`engine_versions.files_json`; dess byggare sätter
`includeStoredProjectEnvVars: false` och laddar därför aldrig de dekrypterade
`projectEnvVars`. Dossiernycklar dokumenteras med säkra F2-stubbar eller tomma
F3-rader. Preview/deploy fortsätter samtidigt att få de riktiga värdena genom
sina runtimevägar.

**Catalog scoping (preview `.env.local`):** the two catalog layers (`harmless`
+ `tier3-stub`) are filtered to project-relevant keys before merging, via
[`src/lib/gen/preview/relevant-env-keys.ts`](../../src/lib/gen/preview/relevant-env-keys.ts):
a catalog key is kept only when its name appears in a project file, an imported
SDK reads it internally (e.g. `@vercel/postgres` → `POSTGRES_URL`, Clerk,
next-auth), or a selected dossier declares it. Env artifacts (`.env*`,
`env.example`) are excluded from the scan so old catalog dumps cannot defeat
the filter. A plain landing page therefore no longer boots with the full
~55-key catalog. The scan is fail-open: callers that cannot supply files
(`scopePlaceholdersToFiles` omitted) keep the full catalogs, and the
`project-preview`/`user`/`generated` layers are never filtered.

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
always wins. The key LIST (not the stub values) is persisted per version in
`engine_versions.selected_dossier_env_keys`, so a preview force-restart
(`POST /preview-session`) and the quick-edit preview fallback rebuild the same
mock-seeded `.env.local` as the first post-finalize boot instead of silently
dropping demo mode.

## F2 vs F3 — the one rule that matters

| Stage (`PreviewLifecycleStage`) | Meaning                            | tier3-stub layer                                                                                                                                                           |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design` (**F2**)               | Design / preview                   | **included** — stubs boot the project so the preview renders                                                                                                               |
| `integrations` (**F3**)         | Bygg integrationer / real services | **stripped for normal F3 codegen** — a build-enforced key needs either a real `projectEnvVars` value or a catalog-approved placeholder; otherwise it surfaces via `tier3-build-spec.ts`. Deterministic no-build-key forks preserve the exact F2 files but stubs remain Advisory/icke-bevis. |

So:

- **harmless placeholder** = safe to leave fake in **both F2 and F3**. Stripe
  _publishable_ test key, `AUTH_SECRET` (any 32-char string), public analytics
  IDs, public CMS/search read keys, local base URLs.
- **tier3-stub placeholder** = present in **F2 only** and stripped during normal
  F3 codegen. Whether its absence blocks F3 comes from the selected dossier's
  `envVars[].enforcement` **and** catalog coverage: `build` blocks only when
  neither a real project value nor an approved placeholder exists;
  `feature-runtime` and `warn-only` remain Advisory. Examples include Stripe
  secret keys, Supabase URL + anon key, Clerk, OpenAI, Redis/DB URLs, Upstash
  and Resend.

Placeholder classification is **per env-KEY**, but F3 blocking is per selected
dossier declaration plus placeholder coverage: a key blocks only when the
dossier marks it `enforcement: "build"` and both a real project value and an
approved catalog placeholder are absent. `STRIPE_SECRET_KEY` is a tier3-stub,
while `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is harmless. The `.txt` fragment
files are organized to match the set in `placeholder-harmless.ts` and are kept
honest by `src/lib/integrations/placeholder-harmless.parity.test.ts`.

## Demo/mock-läge (F2) och ärlig publiceringsgrind

F2 ska rendera en trovärdig demo utan riktiga nycklar; F3-publicering ska bara
blockera på det som verkligen kräver en riktig integration.

- **Demo i F2:** varje hard-dossier har ett effektivt `mock`-läge
  (`canned`/`seed`/`success`/`visual`/`none`; utelämnat = `none`, se
  [`dossier-system.md`](dossier-system.md)) som driver dossierns egen
  degraderingskod. För dossiers med env-kontrakt kombineras det med F2-mock-
  seeden ovan så preview-ytan renderar när nyckeln saknas **eller** är en stub.
  Nyckelfria dossiers, som analytics, använder sitt effektiva läge utan att
  hitta på ett env-krav.
- **Enforcement styr blockering, inte "finns nyckeln i `env.example`".**
  `buildBlockingKeys` (`src/lib/projects/project-env-resolver.ts`) = de build-enforced
  nycklar som saknar både ett riktigt projektvärde och en godkänd
  katalog-placeholder. Efter #468 är `clerk-auth` den enda dossiern med
  `build`-nycklar (`CLERK_SECRET_KEY` +
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), men båda har i dag katalogstöd och kan
  därför köra demo utan att automatiskt blockera. `openai-chat`s
  `OPENAI_API_KEY` flyttades `build` → `feature-runtime`.
- **Deploy-grind:** `POST /api/v0/deployments` ger `409 DEPLOY_MISSING_ENV` på
  `buildBlockingKeys` i **F3** — där blockerar `feature-runtime`/placeholder-nycklar
  aldrig; de surfar som icke-blockerande `EnvDegradationWarning`
  (`env-degradation-warnings.ts`). I **F2** gäller `missingEnvKeys`-backstoppen
  (medvetet vald i #461): en okonfigurerad nyckel **utan katalog-placeholder**
  blockerar oavsett enforcement. Det biter normalt inte på dossier-nycklar i F2
  (dossierns server-filer strippas av SDK-deny-listan och `env.example`-stubbar
  filtreras ur detektionen), men kod som modellen själv skrivit med
  `process.env.<KEY>`-referenser utanför katalogen (t.ex. ett eget
  `EMAIL_FROM`) kan fortfarande 409:a en F2-publicering.
- **F3-readiness/stream:** `finalize-design` och stream-routen gatar på samma
  otäckta build-nycklar (`412 tier3_env_not_ready`). **Byggblock-popovern är den
  enda editorn för projekt-env i F2/F3** (ägarbeslut 2026-07-22), och vid 412
  öppnar/fokuserar buildern rätt dossier där automatiskt. Bredvid popovern
  ligger [`F3RequirementsSurface`](../../src/components/builder/readiness/F3RequirementsSurface.tsx)
  — en beständig, icke-modal builderyta som listar serverns
  `missingByIntegration` som den är, deep-linkar till Byggblock och erbjuder
  explicit retry. Den har medvetet **ingen egen editor** mot env-API:t.
  ReleaseGate-resultat (startad, promoted, superseded, retryable eller Blocker)
  visas på motsvarande `F3StatusSurface` i stället för toastar. Env-frågor hör
  aldrig hemma i F2/F3-chatten (se
  [`env-flow-f2-mute`](../../.cursor/rules/env-flow-f2-mute.mdc)).
  Är alla `requiredRealEnvKeys` i den valda versionens F3-krav tomma startas
  ingen generell F3-LLM-runda. I stället skapas en ny `integrations`-version
  med exakt samma filer och `parent_version_id` som pekar på F2-basen;
  ReleaseGate körs på den nya F3-raden och lämnar F2-raden orörd. Detta lämnar
  `feature-runtime` och `warn-only` som Advisory och behåller Byggblockets
  visuella F2-fallback tills riktiga `projectEnvVars` finns.
  Eftersom filträdet bevaras exakt kan F2:s `env.example` följa med i denna
  deterministiska F3-rad; stub-vokabulären filtreras fortsatt ur
  integrationsbevis och är aldrig ett riktigt runtime-värde.

## Sources of truth at a glance

| Question                                             | Look here                                                |
| ---------------------------------------------------- | -------------------------------------------------------- |
| Which keys does the app read?                        | `src/lib/env.ts` (`serverSchema`)                        |
| How is an app key classified / which Vercel targets? | `config/env-policy.json`                                 |
| Is a generated-site placeholder harmless or tier-3?  | `src/lib/integrations/placeholder-harmless.ts`           |
| What placeholder lines get injected (harmless)?      | `config/ai_models/40-harmless-placeholders.env.txt`      |
| What boot-only stubs get injected (F2)?              | `config/ai_models/41-tier3-stub-placeholders.env.txt`    |
| In what order do preview layers merge / who wins?    | `src/lib/gen/preview/env-local.ts` (generated wins)      |
| Which provider, env keys and enforcement does a dossier own? | `data/dossiers/<class>/<id>/manifest.json` |
| What does each app key value mean / deploy status?   | `docs/ENV.md`                                            |
| Read-only operator matrix of all of the above        | `backoffice/pages/env_readiness.py` (Env Readiness page) |
