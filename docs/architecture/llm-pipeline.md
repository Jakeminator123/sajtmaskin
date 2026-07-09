# LLM-pipeline

Detta är den enda architecture-docen som beskriver generationens körflöde. Detaljerade enumvärden, fält och callsites läses från kod.

## En rad

```txt
user prompt -> intent/brief -> resolveOrchestrationBase -> BuildSpec -> Dynamic Context + Core Rules -> codegen -> finalize -> preview/status
```

## Fas 1 — Intent och input

Målet i Fas 1 är att bygga ett rent underlag till orkestreringen.

- Raw prompt är användarens text.
- Init kan få Deep Brief och variant pre-match.
- Follow-up får Snapshot-Brief och tidigare orchestration snapshot.
- Build intent, generation mode, follow-up intent och requested capabilities ska bestämmas innan prompten byggs.

Kodankare:

- `src/lib/api/engine/chats/create-chat-stream-post.ts`
- `src/lib/api/engine/chats/chat-message-stream-post.ts`
- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/follow-up-intent-types.ts`
- `src/lib/own-engine/session/own-engine-build-session.ts`

## Fas 2 — Orkestrering och codegen

`resolveOrchestrationBase()` är central fan-in för generationens runtimebeslut.

Den ska samla:

- scaffold och scaffold variant
- route plan
- pre-generation contracts
- capabilities och dossier selection
- BuildSpec
- UI recipes och toolkit-signaler
- freeze/floor-regler för follow-up

Efter base steget skapas Dynamic Context och sedan System Prompt:

```txt
Core Rules + separator + Dynamic Context = system message
```

User prompt ska vara user message, inte dupliceras i Dynamic Context.

Dynamic Context kan även injicera **Error-log RAG**: en TF-IDF-retriever (ej
embeddings/pgvector) över historiska fault/fix-events som lägger `### Lessons from
similar past builds` i system-prompten för både init och follow-up när
`FEATURES.useErrorLogRag` är på. I prod är retrieval-indexet cross-tenant (rå
`faultText` redakteras i renderingen).

Kodankare:

- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/build-spec/`
- `src/lib/gen/system-prompt/`
- `src/lib/gen/system-prompt/sections/routing-and-tooling.ts` (Error-log RAG-injektion)
- `src/lib/gen/rag/`
- `src/lib/gen/scaffolds/`
- `src/lib/gen/scaffold-variants/`
- `src/lib/gen/dossiers/`
- `config/prompt-core/`

## Fas 3 — Finalize, verifiering och preview

Efter codegen ska output bli en körbar version.

Typisk ordning i runtime:

1. codegen-output samlas till kandidat-innehåll.
2. Normalize (kod: url-expand + autofix) expanderar media-URL:er och kör
   deterministiska fixers före LLM.
3. syntax/esbuild körs; när syntax är ren körs warm-tsc och vid behov warm-eslint.
4. deterministisk diagnostikdriven import-repair
   (`autofix/deterministic-import-repair.ts`: kända imports, egna komponenter,
   React/same-module-dedupe + re-check) körs före LLM på warm-tsc-residual.
5. RepairGate (kod: `runLlmRepairGate` + `RepairLedger`) används endast för
   residual som Normalize och statiska kontroller inte löste. Samma ledger
   dedupe:ar syntax-, warm-tsc-, warm-eslint-, verifier- och preflight-repair
   inom en finalize-run.
6. verifiern körs riskstyrt: `safe_fixes_only` kan hoppa över verifiern när
   grundpolicyn redan säger `run`, men aldrig vid 3D-signal; `risky_fixes`
   behåller verifier-täckning.
7. parse/merge applicerar scaffold-skydd, dossier verbatim policy och
   follow-up-bevarande mot tidigare version.
8. preflight kontrollerar preview-/verification-blockers före persist.
9. persist sparar assistant-rad, version, snapshot, preflight-loggar,
   telemetry och event/status-underlag.
10. preview startas, patchas eller resyncas mot den persistade versionen.
11. RenderGate (kod: `designPreview` quality gate) kör F2 render/preview-kontroll:
    typecheck är Advisory utom render-risk-koder.
12. ReleaseGate (kod: `integrationsBuild` quality gate) kör F3 strikt
    typecheck + build + lint + env-krav när användaren explicit går till F3.
13. promote, `repair_available`, Blocker eller Advisory-status skrivs utifrån
    gate-resultat och promote-guard.

Viktig ordningsregel: Normalize, verifier och preflight ligger före persist.
VM-gaten (RenderGate/ReleaseGate) ligger efter persist och arbetar på den
sparade versionen.

**Dossier-scopad `env.example`:** under finalize genereras/uppdateras projektets
`env.example` från valda dossiers env-krav (`dossierEnvScope`), så bara relevanta
nycklar tas med i stället för en global lista (`src/lib/gen/preview/project-env-file.ts`,
`src/lib/gen/stream/finalize-version/preflight-phase.ts`; se `docs/ENV.md`).
Scaffold-mergens egen placeholder-`.env.local` i filträdet identifieras via
`PIPELINE_ENV_LOCAL_MARKER` och räknas inte som modell-emitterat "generated"-lager
— varken i `env.example`-byggaren eller i preview-VM:ens env-merge (annars läcker
fullkatalogen förbi scopingen vid varje regenerering).

Kodankare:

- `src/lib/gen/stream/finalize-version/`
- `src/lib/gen/stream/finalize-merge.ts`
- `src/lib/gen/autofix/`
- `src/lib/gen/verify/`
- `src/lib/gen/preview/`
- `src/lib/logging/`

## Follow-up-regler

Follow-up är en deltaoperation. Standardläget är bevarande:

- scaffold fryses om inte redesign uttryckligen låser upp matchning
- variant fryses för att undvika visuell drift
- routes är ett floor, inte ett ceiling
- capabilities får växa men ska inte tyst tappas **i design-rundor** (can-only-grow). I F3-bygget (`integrations`) gäller i stället ett scope-filter — se F3-capability-scope nedan.
- high-value UI-element ska inte tappas utan tydlig anledning

Undantag: clear-redesign och explicita borttagningar.

## F2/F3-regler

| Läge | Syfte | Gate |
|---|---|---|
| F2 / `design` / `fidelity2` | Design-preview och snabb iteration | RenderGate (kod: `designPreview`) |
| F3 / `integrations` / `fidelity3` | Integrationer, build, deploybarhet | ReleaseGate (kod: `integrationsBuild`) |

F3 ska triggas explicit, t.ex. via finalize-design-flöde. Prompten ska inte auto-promota till F3 bara för att den nämner Stripe, auth eller databas.

**Demo-läge i F2:** en F2-preview ska se trovärdig ut utan riktiga nycklar. Varje hard-dossier deklarerar ett `mock`-läge (`canned`/`seed`/`success`/`none`, se [`dossier-system.md`](../contracts/dossier-system.md)) som driver dossierns egen degraderingskod, och finalize seedar valda dossiers env-nycklar med deterministiska stub-värden i preview-`.env.local` (`env-local.ts`) så UI:t renderar. Stubbarna persisteras aldrig och når aldrig en deploy. Ärlig publiceringsgrind: deploy-409 (`DEPLOY_MISSING_ENV`) blockerar bara på `buildBlockingKeys` i F3 (efter #468 enbart `clerk-auth`s nycklar), F2 förblir demo-publicerbart; `feature-runtime`/placeholder surfar som icke-blockerande `EnvDegradationWarning`. Detaljer: [`env-flow.md`](../contracts/env-flow.md), [`ENV.md`](../ENV.md).

### ReleaseGate → publicera-lås

`POST /api/v0/deployments` upprätthåller ReleaseGate server-side via
`resolveDeployReleaseGate` (`src/lib/db/engine-version-lifecycle.ts`):

- **F3/`integrations`:** hård gate — deploy tillåts endast när versionen är
  bevisat grön (`verification_state = passed` eller `release_state =
  promoted`). Allt annat (pending/verifying/repairing/repair_available) ger
  `409 DEPLOY_RELEASE_GATE_NOT_GREEN`.
- **F2/`design`:** mjuk gate — server-verify körs aldrig
  (`design_preview_skip_verify`), så bara `verification_state = failed`
  blockerar (`409 DEPLOY_VERSION_FAILED`).
- `precheckOnly` rapporterar gate-status i svarsfältet `releaseGate` i stället
  för att kasta (utom `failed`, som alltid 409:ar).

### Readiness ↔ deploy-paritet

Publiceringskollen (`GET /api/engine/chats/[chatId]/readiness`) speglar samma
ReleaseGate på servern via `buildReleaseGateBlocker` → `resolveDeployReleaseGate`
(`src/app/api/engine/chats/[chatId]/readiness/readiness-payload.ts`), så builderns
`canDeploy` följer deploy-routens gate i stället för att gissa. Env-kravet är
stage-beroende: F3 blockerar på `buildBlockingKeys`, F2 på `missingEnvKeys`
(`src/app/api/v0/deployments/route.ts`).

### Deploy-repair

Misslyckas en publicering på build-fel kan en riktad **deploy-repair** köras
(`POST /api/v0/deployments/repair`, `src/lib/deploy/deploy-repair.ts`): en LLM-repair
mot deployens build-fel som skapar en ny version att publicera om — utan att köra
hela finalize igen. Deploy-fel loggas dessutom för Error-log RAG via
`src/lib/deploy/deploy-error-log.ts`.

### F3-förslagsrunda och approval-runda

När en F3-generation slutar tool-only (`suggestIntegration` utan kod) parkas chatten i awaiting-input med en persisterad F3-continuation-marker (`f3-continuation.ts`). Markern bär signalerade providers och en rundräknare. Svaret klassas server-side:

- **Godkänn** ärver F3 och kör en *approval-runda* som tvingar kodgenerering: `suggestIntegration`/`requestEnvVar` dras ur tool-setet, ett byggdirektiv med graceful not-configured-fallback injiceras i prompten, och godkända providers mappas till dossier-capabilities (t.ex. stripe → payments) så hard-dossierns verbatim-mallar väljs in via `selectDossiersForRequest`.
- **Avvisa** konsumerar markern och avslutar F3 lugnt med ett bekräftelsemeddelande — ingen generation körs.
- **Loop-breaker:** max en upprepad tool-only-runda per F3-kick. Andra upprepningen avslutar F3 med ett terminalt meddelande utan ny marker.

**F3-capability-scope (mot capability-inflation).** I F3 lyfts F2-muten, så prompt-filtret + can-only-grow-golvet skulle annars återställa *varje* capability Deep Brief någonsin nominerade (analytics, auth, payments …) och göra en enda ask till en full-SaaS env-vägg. `scopeF3DossierCapabilities` (`orchestrate.ts`) begränsar därför F3-setet till unionen av: (a) capabilities som *aktuellt meddelande* härleder, (b) providers användaren *uttryckligen godkänt*, och (c) integrationer med *faktiskt filbevis* i basversionen (`resolveDossiersPresentInVersion`). Setet dependency-expanderas (t.ex. `subscriptions` drar med `supabase-auth`). Spekulativa brief-/golv-capabilities utan bevis, ask eller godkännande droppas (loggas som `f3_capability_scope_dropped`). Design-rundor är oförändrade (can-only-grow gäller där). Dessutom dedupas `ai-tool-calling` vs `ai-chat` (den mer specifika vinner), och Deep Brief nominerar `analytics`/`error-tracking` bara på explicit ask.

**Klient-auto-continue:** kontraktet ovan är oförändrat på servern. Klienten (`MessageList.tsx`) öppnar ALDRIG "Svar krävs"-dialogen för `f3-continuation`-markern. En marker som anländer LIVE i sessionen auto-skickar `Godkänn förslag` exakt en gång (lugn inline-rad "Integrationsbygget fortsätter automatiskt…" istället för popup); loop-breakern är säkerhetsnätet så att max en auto-retry + en auto-loop-retry kan ske innan tredje rundan stänger terminalt. En marker som redan fanns vid mount (reload av gammal historik) auto-körs inte — då visas de vanliga inline-quick-replies (Godkänn/Avvisa/Annat). Auto-approve förbrukar credits för retry-rundan (medvetet ägarval).

Tier-3-stub-placeholders (`41-tier3-stub-placeholders.env.txt`-värden i `.env.local`/`env.example`) är inte integrationsbevis: de filtreras ur både `detect-integrations` och follow-up-filkontexten (`stub-env-filter.ts`).

## Fast Edit Lane

Fast Edit Lane är inte en follow-up-codegen. Den är deterministisk och skapar en immutable minor-version från exakta fil-/inspectorändringar.

- Ingen LLM.
- Ingen scaffold rematch.
- Ingen dossier selection.
- Försöker patcha live preview; fallback är full preview start.
- Ska inte köras på F3/integrations-versioner.

Kodankare: `src/lib/gen/quick-edit/`.
