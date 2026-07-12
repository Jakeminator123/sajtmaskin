# Dossier system (v2)

**Status:** Active. Replaces `dossier-format.md`, `dossier-promotion-flow.md`, and `dossier-pipeline-roadmap.md` (archived 2026-04-20). Schema: `docs/schemas/strict/dossier.schema.json`. Runtime: `src/lib/gen/dossiers/`.

## TL;DR

A dossier is a **reusable building block** the codegen LLM can drop into a generated site. The pipeline is **deterministic and capability-driven**: the brief declares which capabilities the site needs (`payments`, `auth`, `ai-chat`, `pricing-section`, …), and each capability resolves to exactly one dossier (or none).

**Dossiers are NOT templates.** "Templates" (= v0-mallar, the Blob-backed gallery on `/templates` / the Mallar tab) are complete sites imported verbatim — a separate system with its own categories and thumbnails (see `docs/architecture/templates.md`). Dossiers have neither. The similarly-named `data/template-references/` is dossier-curation input, not gallery content.

No embeddings. No fuzzy matching. No category boost. No domain veto. What the brief asks for is what gets injected.

## Two classes (path-encoded)

```
data/dossiers/
  hard/<id>/manifest.json   # needs external secrets (Stripe, OpenAI, Postgres)
  soft/<id>/manifest.json   # self-contained (UI sections, R3F 3D, FAQ accordion)
  _index/capability-map.json   # generated view: capability → [ids]
```

| Class | When to use | Behavior |
|---|---|---|
| `hard` | The dossier needs external secrets to run (API keys, DB URLs). | Selection marks `configured: true\|false` per project (see the selection algorithm below). A hard dossier is **always** injected regardless; when its keys are missing the codegen LLM is told how the dossier degrades — its declarative `mock` mode (see below) drives a working demo surface, and `mock: "none"` falls back to a discreet configuration banner. |
| `soft` | Self-contained — only `npm` deps, no external accounts. | Always considered configured. |

Hard dossiers whose runtime crashes on missing/placeholder keys should additionally **key-gate themselves in the shipped files** — e.g. `clerk-auth/components/middleware.ts` only constructs `clerkMiddleware` when the keys are structurally valid and otherwise degrades to `NextResponse.next()` (placeholder keys must never 500 the whole preview). The `configured` flag from selection is a prompt signal, not a runtime guard — it is never wired to any gate.

## Grupper (presentations-lager, 10 st)

Grupper är UI-rubriker för backoffice och builderns Byggblock-panel — inte en
ny schemadimension. Trenivåmodellen: **Grupp** (UI-rubrik, styr aldrig
selektion) → **Capability** (exakt funktion, styr dossier-val enligt
selektionsalgoritmen ovan) → **Dossier/provider** (implementation; flera per
capability, en är default via `defaultForCapability`). Grupp härleds från
capability via kanonisk mappning i
[`src/lib/builder/dossier-groups.ts`](../../src/lib/builder/dossier-groups.ts)
(`resolveDossierGroup`) — inget nytt manifestfält, ingen runtime-/selektionspåverkan.

| # | Grupp-id | Svensk label | Capabilities |
|---|---|---|---|
| 1 | `data-storage` | Data & lagring | `database`, `cms` |
| 2 | `payments` | Betalningar | `payments`, `subscriptions` |
| 3 | `auth` | Inloggning & konton | `auth`, `supabase-auth` |
| 4 | `ai` | AI | `ai-chat`, `ai-tool-calling`, `rag-chat`, `image-generation` |
| 5 | `email` | E-post & utskick | `contact-form`, `newsletter-subscribe` |
| 6 | `analytics` | Analys & övervakning | `analytics`, `error-tracking` |
| 7 | `realtime` | Realtid | `realtime` |
| 8 | `content` | Innehåll & sektioner | `cta-section`, `faq-section`, `pricing-section`, `testimonials-section`, `feature-grid`, `logo-cloud`, `stats-counter`, `stepper` |
| 9 | `visual-interaction` | Visuellt & interaktion | `carousel`, `marquee`, `gallery-lightbox`, `parallax-scroll`, `parallax-pointer`, `visual-3d`, `physics-3d`, `interactive-game`, `dashboard-charts`, `command-search` |
| 10 | `other` | Övrigt | (fångstnät för omappade capabilities) |

**Fallback-principen på capability-nivå:** capabilityns standard-demo i F2 =
default-dossierns (`defaultForCapability: true`) `mock`-läge (se **Mock/demo-
läge** nedan). Providers under samma capability delar samma demo-yta i den
meningen att demo-mönstret (seed-data, canned-svar, config-notis) är gemensamt —
men runtime läser alltid den *valda* dossierns eget `mock`-fält: väljs en
icke-default provider via `relevanceKeywords` (t.ex. "mongodb" → `mongodb-atlas`)
används den dossierns mock-läge, och saknas det degraderar den till
config-notisen (`none`-beteendet). Det är en ärlig, medveten degradering — inte
ett kontraktsbrott.

**CI-invariant (tvingande sedan 2026-07-12):** varje **hard**-capability
(capability med minst en dossier i `data/dossiers/hard/`) ska ha exakt en
default-dossier vars `mock`-läge är ≠ `none` — annars måste capabilityn stå på
undantagslistan nedan. Kontrollen är CI-blockerande via
`npm run dossiers:validate-all` och implementeras av `findMissingMockFallbacks()`
i [`validate-manifest.ts`](../../src/lib/gen/dossiers/validate-manifest.ts)
(ingen ny schemadimension). Avgränsning (medveten): invarianten tvingar bara
**capabilityns default-dossier** — icke-default providers får sakna mock
(degraderar till config-notis, se ovan), och undantagen är **capability-breda**
(en framtida provider under t.ex. `payments` ärver undantaget). Default-
upplösningen är avsiktligt **strängare än runtime-selektionen**: CI godkänner
den enda dossiern med `defaultForCapability: true`, eller — om ingen är flaggad —
capabilityns *enda* dossier. Flera hard-dossiers utan flaggad default är ett
CI-fel här (ingen upplösbar standard-demo), medan `select.ts` i det läget
tyst väljer första dossiern i id-ordning; flera *flaggade* defaults ägs av
`defaultForCapability`-unikhetskontrollen.

**Undantagslistan** (`MOCKLESS_CAPABILITY_EXCEPTIONS` i samma fil) — capabilities
där `mock: none` är legitimt eftersom ytan inte kan mockas meningsfullt utan
riktig nyckel:

| Capability | Varför undantagen |
|---|---|
| `payments` | Betalning kan inte fejkas trovärdigt; visar `IntegrationConfigNotice` tills riktiga nycklar sätts. |
| `subscriptions` | Som betalning + kräver inloggad användare; ingen meningsfull demo-yta. |
| `auth` | En fejkad inloggning skulle dela ut fejkade sessioner (säkerhet) → konfigurationsbanner i stället. |
| `supabase-auth` | Provider-specifik auth — samma skäl som `auth`. |
| `realtime` | Live pub/sub kräver riktig transport; en mockad socket har inget att eka. |
| `analytics` | Fire-and-forget-beacons har ingen visuell yta att mocka; nycklar är `warn-only` och komponenten self-disablar. |
| `error-tracking` | Som analytics — ingen användarsynlig demo; self-disablar utan DSN. |

Att lägga till en capability här är ett kontraktsbeslut, inte en genväg: en
demo-bar capability (DB, CMS, e-post, AI …) ska i stället få ett riktigt
`mock`-läge. Nya behov blir nya capabilities i en befintlig grupp (t.ex. en
framtida `maps`-capability i `content` eller `visual-interaction`), inte en ny
grupp.

### F2/F3-gräns: dossier-kontraktet är signalen (kanonisk)

Samma dossier kan spänna över F2 och F3 — det är inte två separata dossiers och det finns ingen extra `hard/soft/visual`-taxonomi som styr fasen:

- **F2 (design)** renderar en klient-/demo-/placeholder-safe version (visuell mockup).
- **F3 (integrations)** aktiverar den riktiga integrationen (riktiga env-värden krävs).

**Kanonisk signal i dagens kod** för "kräver F3" är dossierns eget kontrakt, via helpern [`dossierRequiresF3()`](../../src/lib/gen/dossiers/types.ts) (enda källan). Två regler:

1. **Env-kontrakt:** en `envVars`-post med `enforcement: "build"` (default när `enforcement` utelämnas). Efter #468 är `clerk-auth` (`CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) den **enda** hard-dossiern som fortfarande har `build`-enforcement — trasig inloggning är värre än demo-friktion. Övriga (Stripe, OpenAI, DB, e-post …) är `feature-runtime`/`warn-only` och degraderar via sitt mock-läge i stället för att blockera. En `build`-nyckel som saknas är alltså det enda som gör en dossier F3-tvingande via env-vägen.
2. **Server-yta:** en `files[]`-post med `role: "server"` — dossiers som skeppar backend-wiring (API-route, middleware, server-config) hör till F3 även utan build-secret. Exempel: `resend-contact-form` (alla nycklar `feature-runtime`, men `/api/contact`-routen importerar `resend` som F2:s SDK-deny-lista strippar) och `mailchimp-newsletter`. I F2 renderas formuläret som visuell mockup enligt F2-kontraktet i `session-contracts.ts`; mejl/prenumeration aktiveras först i F3 ("Bygg integrationer").

[`getF3RequiredCapabilities()`](../../src/lib/gen/dossiers/registry.ts) räknar upp de capability-nycklar vars dossier kräver F3, och `orchestrate.ts` deriverar F2-mute-listan därifrån (union med policy-residualen `{analytics}` — icke-secret, server-fri integration som ändå ska F2-mutas, per [`env-flow-f2-mute`](../../.cursor/rules/env-flow-f2-mute.mdc)). En dossier med `envVars: []` och enbart klientfiler (t.ex. `interactive-game-loop`) är alltså **fullt F2-användbar**. Utöka gränsen i helpern om ett framtida fall behöver det — inte via en ny per-dossier-flagga eller separat hårdkodad lista.

### Mock/demo-läge (`mock`) — hur en hard-dossier ser ut i F2 utan riktig nyckel

Det deklarativa `mock`-fältet ([`DossierMockMode`](../../src/lib/gen/dossiers/types.ts)) beskriver hur en hard-dossier gör sin **visuella yta** funktionell i F2/preview när nyckeln saknas *eller* är en preview-stub. Fältet driver dels dossierns egen komponentkod (den emitterade användarsajtens degraderingsväg), dels en promptrad till codegen-LLM:n via `describeMockMode` ([`system-prompt/sections/dossiers.ts`](../../src/lib/gen/system-prompt/sections/dossiers.ts)) så modellen förlitar sig på den inbyggda fallbacken i stället för att hitta på en egen.

| `mock` | Beteende utan riktig nyckel | Exempel-dossiers |
|---|---|---|
| `canned` | Server-routen returnerar ett trovärdigt fabricerat svar i demo-läge (chatboten streamar ett canned-svar, bildgenerering ger en deterministisk platshållarbild). Riktiga vägen återupptas när en riktig nyckel sätts. | `openai-chat`, `ai-tool-calling-chat`, `fal-image-generation`, `rag-chat` |
| `seed` | Data-lagret faller tillbaka på medskeppad `seedData` + en diskret `<DbConfigNotice />` när connection-strängen saknas/är stub, så DB-vyer renderar utan riktig databas. **Medvetet vald framför in-preview-SQLite:** `better-sqlite3` kräver native-build på preview-VM:en (skört), medan in-memory seed ger samma visuella resultat utan native-deps. | `postgres-drizzle`, `neon-postgres`, `mongodb-atlas` |
| `success` | Mutations-endpoints returnerar en fejkad success + en demo-notis (`demo: true`) så formulär går igenom i F2 utan att koppla providern. | `resend-contact-form`, `mailchimp-newsletter` |
| `none` (default vid utelämnat) | Kan inte mockas meningsfullt (betalning, inloggning) → UI:t visar en diskret demo-/konfigurationsbanner (`IntegrationConfigNotice`-mönstret). | `stripe-checkout`, `clerk-auth`, `ably-realtime` |

Mock-värden är **F2/preview-only** — de persisteras aldrig till `projectEnvVars` och skeppas aldrig till en riktig deploy. En dossier som fått en *riktig* primärnyckel men har platshållare på en sekundärnyckel tar den ärliga setup-vägen (t.ex. `resend-contact-form`: riktig `RESEND_API_KEY` men placeholder `EMAIL_FROM`/`CONTACT_EMAIL_TO` → `503 email-not-configured` + `IntegrationConfigNotice`), aldrig ett riktigt anrop med fejkad config.

**Satt på 15 av 18 hard-dossiers.** De tre analytics-dossiererna (`vercel-analytics`, `sentry-error-tracking`, `plausible-analytics`) utelämnar fältet → `none`; det är korrekt eftersom deras nycklar är `warn-only` (komponenten self-disablar helt utan visuell yta att mocka). Att en hard-capabilitys default-dossier har `mock ≠ none` (eller står på undantagslistan) är **CI-tvingat** — se **Fallback-principen på capability-nivå** i grupp-sektionen ovan (`findMissingMockFallbacks` i `validate-manifest.ts`).

## Two code-fidelities (per-dossier default + per-file override)

| Fidelity | When | Effect on prompt |
|---|---|---|
| `verbatim` | Integration glue where paraphrasing breaks the integration: webhook signing, OAuth callbacks, SDK init, middleware. | The file is rendered into the system prompt under `## Dossier Files To Emit Verbatim`. The codegen LLM **must** emit it byte-exact in its CodeProject output. |
| `rewritable` | UI components, layout patterns, render glue the LLM should adapt to the project. | The file is described via compact manifest-derived guidance in the prompt (see `promptInstructionMode` below) and the codegen LLM may paraphrase freely. |

The dossier-level `codeFidelity` is the default. Individual files can override via `files[].injectionMode`.

**Verbatim enforcement is two-layered.** The prompt block is layer 1; layer 2 is post-merge: `applyDossierVerbatimPolicy()` (`src/lib/gen/dossiers/verbatim-policy.ts`, called from `finalize-merge.ts`) restores any verbatim dossier file the LLM drifted from back to the canonical dossier source. On follow-ups, verbatim files already present in the project are listed under `## Dossier Verbatim Files Already in Project` instead of being re-rendered in full.

## Manifest schema (7 required + optional)

```json
{
  "$schema": "../../../../docs/schemas/strict/dossier.schema.json",
  "id": "stripe-checkout",
  "mock": "none",
  "label": "Stripe Checkout",
  "capability": "payments",
  "codeFidelity": "verbatim",
  "complexity": "medium",
  "defaultForCapability": true,
  "summary": "Hosted Stripe Checkout for one-time and subscription payments. …",
  "envVars": [{"key": "STRIPE_SECRET_KEY", "required": true, "enforcement": "build", "purpose": "API auth"}],
  "dependencies": ["stripe", "@stripe/stripe-js"],
  "files": [
    {"path": "components/checkout-button.tsx", "role": "client", "injectionMode": "verbatim"},
    {"path": "components/integration-config-notice.tsx", "role": "shared", "injectionMode": "verbatim"},
    {"path": "components/api/checkout-session/route.ts", "role": "server", "injectionMode": "verbatim"}
  ],
  "exposes": [{"name": "CheckoutButton", "type": "component", "import": "@/components/checkout-button"}],
  "lastVerified": "2026-04-20",
  "sourceRepoUrl": "https://github.com/..."
}
```

| Field | Required | Purpose |
|---|---|---|
| `id` | ✓ | Kebab-case, must match the directory name. |
| `label` | ✓ | Human label for backoffice. |
| `capability` | ✓ | Single kebab-case capability (matched against `brief.requestedCapabilities`). |
| `codeFidelity` | ✓ | `verbatim` or `rewritable` (default for files). |
| `complexity` | ✓ | `simple` / `medium` / `advanced`. |
| `summary` | ✓ | 1-3 sentences. Used in prompt + backoffice. |
| `lastVerified` | ✓ | ISO date YYYY-MM-DD when a human last validated the dossier. |
| `defaultForCapability` | optional (default `false`) | Tie-breaker when two dossiers share the same capability. |
| `relevanceKeywords` | optional | Provider-specific keywords/phrases (max 12) marking an EXPLICIT ask for this dossier when several share one capability — e.g. `"mongodb"` on `mongodb-atlas` under `database`. A prompt hit overrides the `defaultForCapability` pick (Unicode word-boundary match, hyphen counts as part of the word). Keep high-precision; generic nouns belong in the follow-up capability vocabulary. |
| `envVars` | optional | External secrets needed at runtime. Each entry takes optional `enforcement` (P31): `"build"` (default — required for F3 build), `"feature-runtime"` (UI shows banner / popup at runtime, F3 reports as warning not blocker), or `"warn-only"` (component self-disables on empty value). See [glossary](../architecture/glossary.md). |
| `dependencies` | optional | npm packages added to `package.json`. |
| `files` | optional | Files injected into the project. Per-file `injectionMode` overrides dossier `codeFidelity`. |
| `exposes` | optional | Symbols the codegen LLM may import. |
| `sourceRepoUrl` | optional | Pointer to the upstream reference (typically under `data/template-references/`). |
| `notes` | optional | Curator-only free text (drafts from `dossiers:curate`); never reaches the prompt. Remove once validated. |
| `promptInstructionMode` | optional | How much of `instructions.md` reaches the prompt: `compact` (default — manifest-derived summary), `selected-sections`, or `full`. |
| `mock` | optional | How the dossier renders its visual surface in F2/preview without a real key: `canned` / `seed` / `success` / `none`. Omitted = `none`. Drives the dossier's own degradation code + a codegen-prompt hint. See the **Mock/demo-läge** section above. |

## `instructions.md` template

Every dossier ships with a Markdown file. Five standard sections — CI (`dossiers:validate-all` via `validate-manifest.ts`) **requires** the first two (`When to use`, `How to integrate`) and treats the other three (`UX rules`, `Avoid`, `Verification`) as recommended warnings:

```markdown
# When to use
[1-3 bullets where this dossier is the right pick]

# How to integrate
[Numbered steps: import, env, mount-point]

# UX rules
[Feedback, validation, mobile, accessibility]

# Avoid
[Concrete don'ts that the LLM might naively try]

# Verification
[Manual smoke checks the developer can run]
```

Keep it **scaffold-agnostic** when the rule applies regardless of layout, and **scaffold-aware** when the integration depends on it (e.g. "if the scaffold has a sidebar, mount X there"). Avoid vague hedges.

## Selection algorithm

`selectDossiersForRequest(opts)` lives in `src/lib/gen/dossiers/select.ts`:

1. Read `requestedCapabilities` (from explicit option or `brief.requestedCapabilities`). When the caller COMPUTED the list (the F3 capability-scope in orchestrate passes `disableBriefFallback: true`), an empty list is authoritative — the brief fallback never resurrects speculative capabilities in F3.
2. Expand dependent capabilities (`expandDependentCapabilities`): a capability that only works with a companion pulls it in automatically — today `subscriptions` ⇒ `supabase-auth` (paddle-billing's customer-portal needs a signed-in Supabase user). The same helper also dedupes overlapping picks: `supabase-auth` drops generic `auth` (colliding root `middleware.ts`), and `ai-tool-calling` drops generic `ai-chat` (overlapping chat surfaces — one "AI assistant" ask must not ship two competing chat routes). The same helper runs in `filterDossierCapabilitiesForPrompt` (orchestrate) so prompt and selection stay in lockstep; in F2 the base capability is already muted, so expansion only fires in F3.
3. For each capability, find dossiers via `getDossiersByCapability(cap)`.
4. If multiple match: an explicit `relevanceKeywords` hit in `promptText` (when the caller supplies it — orchestrate passes the raw prompt) overrides the default, e.g. "MongoDB" → `mongodb-atlas` even though `postgres-drizzle` is the `database` default. Otherwise pick the one with `defaultForCapability=true`, else the first by id-sort. Callers without a prompt (dep-completer backstop, snapshot re-selection) always get the capability default.
5. For hard dossiers, mark `configured: true|false` from the **current project's** stored env keys (`SelectDossiersOptions.configuredEnvKeys`, threaded from `getStoredProjectEnvVarMap`) — a hard dossier is `configured` only when all its required keys have a real stored value for that project. Reading the platform `process.env` is a **deprecated fallback** kept only for callers that cannot supply a project env map (e.g. the dep-completer backstop); it is wrong for user projects (Sajtmaskin's own keys leak in). The flag is a prompt-only signal, never wired to a gate.
6. Eagerly load `instructions.md` for selected dossiers.

### Version-presence union (reporting + gates)

Selection answers "what should THIS round wire"; the separate question "what is
IN this chat/version" is owned by `resolveSelectedDossiersWithVersionPresence`
(`version-presence.ts`): snapshot-derived selection ∪ dossiers whose files are
actually present in the version (all `role: "server"` files + at least one
distinctive, non-shared file; client-only dossiers need one distinctive file).
The dossiers panel route, the readiness route, `finalize-design`, the stream
route's F3 gate and the deploy env gate all read that union — never their own.
This matters because the snapshot's top-level `requestedCapabilities` is the
floor of the MOST RECENT round and legitimately SHRINKS after an F3 build (the
next design round re-mutes integration capabilities): that shrink is intended,
and file presence is what keeps a built integration visible/enforced through it.

### Explicit capability removal

A follow-up such as "ta bort Stripe" is an explicit exception to the
can-only-grow floor. `detectCapabilityRemoval` emits the removed capability;
orchestrate then subtracts it from inferred flags, Deep Brief capability lists,
contracts, durable F3 approvals and dossier selection before codegen. The stream
meta carries both `removedCapabilities` and the file-evidenced
`removedDossierIds`, so finalize cannot resurrect the capability from a stale
`briefSummary`. Both `f3ApprovedCapabilities` and `f3ApprovedProviders` are
overwritten with the filtered sets in the next snapshot.

After the normal follow-up merge and verbatim restoration,
`removeExplicitlyRemovedDossierFiles` deletes paths owned by those removed
dossiers. A path is preserved when a still-selected dossier also declares it;
this protects shared helpers such as config notices. The removal hint still
requires the model to remove imports, navigation and provider usage, while the
deterministic post-merge deletion guarantees that omitted legacy dossier files
do not survive by union-merge. Cross-file import checking runs once more after
deletion so a missed importer is rewired/stubbed and surfaced as degraded
instead of becoming a dangling module import.

Output: `DossierSelectionResult` consumed by `src/lib/gen/system-prompt/` to render three blocks:

- `## Available Dossiers` — compact list of selected dossiers.
- `## Selected Dossier Instructions` — per-dossier runtime instructions, rendered per `promptInstructionMode`: `compact` (default; manifest-derived summary), `selected-sections`, or `full` (the whole `instructions.md`). The full file is thus NOT injected by default.
- `## Dossier Files To Emit Verbatim` — files whose effective injection mode is `verbatim`. Resolution: per-file `files[].injectionMode` overrides the dossier-level `codeFidelity`. So a `rewritable` dossier can still mark one file as `verbatim` (or vice-versa). On follow-ups, verbatim files already in the project render as pointers under `## Dossier Verbatim Files Already in Project`.

## Adding a new dossier

### Manually

1. Decide class: `hard` (needs secrets) or `soft` (self-contained).
2. Create `data/dossiers/<class>/<id>/manifest.json` matching the schema.
3. Write `data/dossiers/<class>/<id>/instructions.md` with the five sections.
4. Place files under `data/dossiers/<class>/<id>/components/...` matching `files[].path`.
5. Run `npm run dossiers:validate-all` (canonical AJV validation + invariants; `typecheck` alone does not validate manifest JSON).
6. Open the backoffice "Dossiers" page → "Capability map" tab → "Bygg om" to refresh `_index/capability-map.json`.

### AI-assisted from a template-reference repo

1. Clone the upstream repo into `data/template-references/repos/<reference-id>/` (or pick one already there from the legacy auto-pipeline).
2. Run:
   ```bash
   npm run dossiers:curate -- --reference=<reference-id> --class=hard --id=<dossier-id>
   ```
3. The script samples README, `package.json`, `.env.example`, and ~6 source files, then calls GPT to produce a draft `manifest.json` + `instructions.md`.
4. Review the draft in the backoffice Dossiers page (Redigera tab) and fix anything wrong before relying on it.
5. Bump `lastVerified` and remove the `notes` field once you've validated the dossier against a real preview build.

The script is intentionally one-at-a-time. Batch promotion was the source of pool-quality problems in the legacy pipeline.

## Validation (canonical validator + capability-map status)

The **canonical** manifest validator is the Node/AJV `validateDossierManifest()`
in [`src/lib/gen/dossiers/validate-manifest.ts`](../../src/lib/gen/dossiers/validate-manifest.ts)
(strict `docs/schemas/strict/dossier.schema.json`). It runs in three places:

- **Runtime** — `registry.ts` excludes any manifest that fails it from the pool.
- **CI** — `npm run dossiers:validate-all` (blocking) plus exposes/import-closure,
  `defaultForCapability` uniqueness, the hard-capability mock-fallback invariant
  (`findMissingMockFallbacks`; see the grupp-section's **Fallback-principen**),
  instructions headings, SDK version pins and the module-level SDK-init rule (below).
- **Curation** — `dossiers:curate` validates the AI draft with the same function.

**Module-level SDK-init rule (B5-standard, 2026-07-03):** dossier code must not
construct env-dependent SDK clients at module scope (`const stripe = new
Stripe(process.env.KEY ?? "")`) — the constructor throws at import time when the
key is missing, which makes the handler's env guard (503 `*-not-configured`)
unreachable and kills the graceful-degradation contract. Construct clients
inside the handler, **after** the env guard (lazy init). Enforced by
`findModuleLevelSdkConstructions()` in `dossiers:validate-all` (heuristic:
column-0 declarations whose statement references `process.env`; env-free
factories like Clerk's `createRouteMatcher` are allowed). Dossiers whose
instructions declare a not-configured contract should also ship component
tests exercising the 503 → notice path (see
`src/lib/gen/dossiers/dossier-config-fallback.test.tsx`).

**Documented divergence:** the backoffice save path (`backoffice/pages/dossiers.py`,
`_validate_manifest`) does a lighter Python pre-check (required fields + enum
values) so the editor can give instant feedback without a Node round-trip. It is
intentionally a *subset* — a manifest can pass the Python pre-check and still be
rejected by the canonical Node/AJV validator in CI. Treat the Node validator as
source of truth; always run `npm run dossiers:validate-all` after editing a
manifest in the backoffice.

**Capability map:** `data/dossiers/_index/capability-map.json` is a **generated
view only** (backoffice + curation tooling); the runtime registry walks
`data/dossiers/{hard,soft}/` directly and never reads it. It is **not** CI-enforced
(the former `dossiers:capability-map:check` drift-gate was removed as maintenance
tax). Regenerate on demand with `npm run dossiers:capability-map:write` or the
backoffice "Bygg om" tab when curating.

## Disabling the pipeline

Set `SAJTMASKIN_DOSSIER_PIPELINE=false` (or `0`) in any environment to skip dossier selection entirely. With no selection there is no `DossierSelectionResult`, so **all** dossier blocks (`## Available Dossiers`, `## Selected Dossier Instructions`, `## Dossier Files To Emit Verbatim`) disappear from the system prompt; the rest of the pipeline is unaffected.

**Code default (if env is unset):** on in dev/preview/prod, **off under `NODE_ENV=test`** (`useDossierPipeline` in `src/lib/config.ts`). Per-environment opt-out via the env var on that Vercel target.

## Files at a glance

| Path | Role |
|---|---|
| `data/dossiers/hard/<id>/`, `data/dossiers/soft/<id>/` | Manifests + instructions + components |
| `data/dossiers/_index/capability-map.json` | Generated view (backoffice + tooling) |
| `data/template-references/repos/<reference>/` | Cloned upstream repos (input to AI curation) |
| `data/template-references/_metadata/<reference>.github.json` | GitHub stars + last-pushed metadata for ranking |
| `src/lib/gen/dossiers/registry.ts` | Disk reader + mtime cache |
| `src/lib/gen/dossiers/select.ts` | Deterministic capability-driven selection |
| `src/lib/gen/dossiers/version-presence.ts` | Canonical "which dossiers are IN this version" resolver (server files + ≥1 distinctive file; se § Version-presence union) + `resolveSelectedDossiersWithVersionPresence` — the snapshot ∪ presence union shared by panel, readiness, finalize-design, F3-gate and deploy. |
| `src/lib/gen/dossiers/types.ts` | `DossierEntry`, `SelectedDossier`, `DossierSelectionResult` |
| `src/lib/gen/system-prompt/` | Renders the three dossier blocks into the system prompt |
| `scripts/dossiers/curate-from-reference.ts` | AI-curation script (single dossier from a cloned reference repo) |
| `scripts/dossiers/inventory-legacy.mjs`, `normalize-legacy-prospect.ts`, `validate-all.ts`, `regenerate-capability-map.ts` | Legacy-import chain (PR #419): inventory a legacy v1 archive → LLM-normalize to v2 draft → validate promoted pool → rebuild the capability-map view. Backoffice UI: "Legacy-import" tab in `dossiers.py`. |
| `backoffice/pages/dossiers.py` | Backoffice UI for browsing + editing + curating |
| Old 96-dossier v1 pool, 16-script pipeline, scaffold-recommendations, embeddings | Gitignored local archive (`/archive/` in `.gitignore`), not guaranteed present on every checkout. Current legacy-import work-in-progress state (prospects, normalization reports, drafts) lives outside the repo — see `docs/plans/active/2026-07-08-dossier-legacy-import.md`. |
