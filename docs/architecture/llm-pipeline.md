# LLM-pipeline

Detta är den enda architecture-docen som beskriver generationens körflöde. Detaljerade enumvärden, fält och callsites läses från kod.

## En rad

```txt
user prompt -> intent/brief -> resolveOrchestrationBase -> BuildSpec -> Dynamic Context + Core Rules -> codegen (+ valfri preview-förvärmning) -> finalize -> preview/status
```

## Fas 1 — Intent och input

Målet i Fas 1 är att bygga ett rent underlag till orkestreringen.

- Raw prompt är användarens text.
- Init kan få Deep Brief och variant pre-match.
- Init kan även bära **Byggval** (init-reglagen i preview-panelens välkomstläge) som strukturerade request-meta-signaler: `scaffoldMode/scaffoldId` (sajttyp), `pageCountHint` (vinner över sidantal-regexen i route-planen), `styleKeywordsHint` (variantmatchning) och `complexityHint` (BuildSpec). Komplexitet/färgläge/ton skickar dessutom svenska direktiv via custom-instructions-kanalen — aldrig via chattens input. Byggval-reglaget cappar på 3 (tokenbudget). Ruttplanens per-runda-tak är 4 nivå-1/2-sidor; nivå 3 räknas inte. Explicit prompt-text över taket kläms till taket.
- Follow-up får Snapshot-Brief och tidigare orchestration snapshot. Undantag: `clear-redesign` kör Deep Brief som delta-brief (samma `siteBriefSchema`, redesign-prior-context). Byggval-hintarna är init-only — follow-up-frysen äger scaffold/variant/routes.
- Build intent, generation mode, follow-up intent och requested capabilities ska bestämmas innan prompten byggs.
- Follow-up scope-klargörande (`collectFollowUpClarificationAnswer`): exakt quick-reply **eller** en kort parafras av ett sparat alternativ återställer originalprompten. En ny beställning (specifikt sidmål, negation, «vill ha»/«behöver», restinnehåll, längre brief) körs som ny prompt — den får inte limmas ihop med den gamla.
- Init-codegen går bara via `POST /api/engine/chats/stream` (`maxDuration = 950`). Uppföljning går bara via `POST /api/engine/chats/[chatId]/stream` (`maxDuration = 950`). `GET /api/engine/chats` listar chattar. `POST /api/engine/chats` utan `/stream` är inte en codegen-väg (`405 use_streaming_create`). `POST .../messages` är inte en codegen-väg (`405 use_streaming_send`). En bruten ström ger ett ärligt fel i buildern och startar inte om generationen.

Kodankare:

- `src/lib/api/engine/chats/create-chat-stream-post.ts`
- `src/lib/api/engine/chats/chat-message-stream/handler.ts` (fasad: `chat-message-stream-post.ts`)
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

När `SAJTMASKIN_PREVIEW_PREWARM` är explicit aktiverad kan en ny chats första
riktiga codegen-körning samtidigt väcka preview-hosten och starta en
installation. Det är en best-effort latensoptimering, inte en
preview-klar-signal: ingen preview-URL eller app-side sessionpekare publiceras
före finalize. Plan-mode, kontraktsklargörande och vanliga follow-ups hoppar över
förvärmningen. Skelettets `package.json` byggs numera scaffold-medvetet:
orkestreringen har redan valt `ScaffoldId` innan prewarm anropas, så
`prewarmPreviewSession` skannar den valda scaffoldens egna
prompt-filer (`gen/scaffolds/<id>/files/`) med samma `mergePackageJsonWithBaseline`

- dep-completer-mekanism som finalize-vägen kör över modellens riktiga output —
  samma dependency-källa, olika kod. Matchar modellens genererade kod scaffoldens
  importer (vanligt, då modellen prompt:as med exakt det innehållet) och emitterar
  modellen ingen egen `package.json`, blir finalize-filen byte-identisk med den
  prewarm installerade och hostens fingerprint-jämförelse (paket.json/lockfiles)
  träffar → installationen skippas. Vid mismatch (dep-completer eller modellen
  lägger till paket scaffolden inte importerar) körs en riktig install vid
  finalize, men npm återanvänder det redan varma `node_modules` — fortfarande en
  vinst. Utan känd scaffold-id faller skelettet tillbaka till den fasta baslinjen
  (oförändrat från tidigare). Hosten accepterar prewarm endast för en oägd chat
  och en aktiv kanonisk rate-limit-subject-lease; sena prewarm-anrop kan därför
  aldrig nedgradera en riktig version. Lease-HMAC kräver konfigurerad
  preview-host API-nyckel; annars skippar appen optional prewarm. Skelettet
  hålls bakom hostens auto-refreshande HTTP-sida och alla WS-upgrades nekas
  tills riktig replacement passerat readiness. Misslyckat övertagande ger
  stabil 503 tills explicit retry; bootfel behåller lease-cooldown mot
  install-spray. Normal credit commit/refund ändras inte. Preview-host måste
  deployas och verifieras före appen; flaggan är default av och aktiveras inte
  av denna ändring. Se `docs/ENV.md` och
  `docs/schemas/preview-session-contract.md`.

Kodankare:

- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/build-spec/`
- `src/lib/gen/system-prompt/`
- `src/lib/gen/system-prompt/sections/routing-and-tooling.ts` (Error-log RAG-injektion)
- `src/lib/gen/rag/`
- `src/lib/gen/scaffolds/`
- `src/lib/gen/scaffold-variants/`
- `src/lib/gen/dossiers/`
- `src/lib/gen/preview/preview-prewarm.ts`
- `src/lib/gen/stream/stream-format.ts` (codegen-SSE; fasmätning `waitMs`/`reasoningMs`/`outputMs`)
- `config/prompt-core/`

Codegen-SSE delar strömtiden i tre väggklocksfaser som tillsammans är
`durationMs` i `stream.summary`: **wait** (start → första token), **reasoning**
(första reasoning-token → första content-token; `0` när strömmen inte
emitterade reasoning) och **output** (första content-token → slut). Ägaren är
`computeStreamPhaseTiming` i `stream-format.ts`. Det är inte samma klocka som
`generation_telemetry.durationMs`.

Reasoning-texten i strömmen: Anthropic skickar riktiga thinking-deltas;
OpenAI exponerar aldrig rå chain-of-thought utan skickar bara en sammanfattning,
och bara när `reasoningSummary: "auto"` beställs (görs i `engine.ts` när
thinking är på). Båda vägarna blir `thinking`-SSE-event och renderas i chattens
Reasoning-ruta. Se `config/ai_models/10-own-engine.md`.

## Fas 3 — Finalize, verifiering och preview

Efter codegen ska output bli en körbar version.

Typisk ordning i runtime:

1. codegen-output samlas till kandidat-innehåll.
2. Normalize (kod: url-expand + autofix) expanderar media-URL:er och kör
   deterministiska fixers före LLM.
3. syntax/esbuild körs; när syntax är ren kan warm-tsc köras. Warm-cachen ser
   inte dossier-egna SDK:er (VM:en installerar dem senare), så olösbara
   modul-diagnostiker för dossier-deklarerade paket släpps i st.f. att gissa —
   se [`warm-cache-setup.md`](../runbooks/warm-cache-setup.md). Warm ESLint är
   endast opt-in lokal diagnostik och ingår inte i finalize/RepairGate.
4. deterministisk diagnostikdriven import-repair
   (`autofix/deterministic-import-repair.ts`: kända imports, egna komponenter,
   React/same-module-dedupe + re-check) körs före LLM på warm-tsc-residual.
5. RepairGate (kod: `runLlmRepairGate` + `RepairLedger`) används endast för
   residual som Normalize och statiska kontroller inte löste. Samma ledger
   dedupe:ar syntax-, warm-tsc-, verifier- och preflight-repair
   inom en finalize-run.
6. `materialize_images` (deep path) byter bildplatshållare mot riktiga URL:er
   och registreras i Prometheus `sajtmaskin_phase_duration_ms` samt i
   `generation_telemetry.meta.postStreamSteps`. Light path hoppar steget och
   registrerar fasen som 0 ms. Steget ligger **efter** hela
   `validateAndFix`-blocket (steg 3–5) — i `fast-path.ts` är syntax, warm-tsc,
   import-repair och RepairGate Phase 1, och bildmaterialiseringen Phase 2.
7. `package.json` mergas mot Sajtmaskins baslinje
   (`mergePackageJsonWithBaseline` via `applyBaselinePackageJsonMerge`)
   **innan** verifiern läser filerna, så beroendekontrollen bedömer den
   manifest som persist skriver — inte modellens tunna utkast.
   `tailwindcss` räknas som närvarande även i `devDependencies`. Importerat
   repo-läge hoppar över baslinjemergen. Därefter körs verifiern riskstyrt:
   `safe_fixes_only` kan hoppa över verifiern när grundpolicyn redan säger
   `run`, men aldrig vid 3D-signal; `risky_fixes` behåller verifier-täckning.
8. parse/merge applicerar scaffold-skydd, dossier verbatim policy och
   follow-up-bevarande mot tidigare version. Vid explicit redesign
   (`BuildSpec.changeScope = redesign`) får emitterade filer ersätta tidigare
   struktur och krympa utan att shrink-/elementbevarandet återställer dem;
   protected paths, package-merge, dossierpolicy, importkontroll och preflight
   gäller fortfarande.
9. preflight kontrollerar preview-/verification-blockers före persist.
10. persist sparar assistant-rad, version, snapshot, preflight-loggar,
    telemetry (`meta.streamMs` = codegen-SSE wall-clock till finalize-start;
    `meta.postStreamSteps` = per-steg-tider inkl. `materialize_images`) och
    event/status-underlag.
11. preview startas, patchas eller resyncas mot den persistade versionen. En
    tidigare best-effort-förvärmning får återanvändas, men är aldrig själv ett
    bevis på att den persistade versionen är redo.
12. RenderGate (kod: `designPreview` quality gate) kör F2 render/preview-kontroll:
    typecheck är Advisory utom render-risk-koder. Ägare: **klienten**
    (`post-checks.ts` → `POST /quality-gate`) — server-verify skippas för F2
    (`design_preview_skip_verify`, M#vlane1).
13. ReleaseGate (kod: `integrationsBuild` quality gate) kör F3 i en
    auktoritativ VM-gate: typecheck → build. Env-krav täcks av placeholders
    (alltid tillåtna — demoläge tills riktiga nycklar fylls i via Byggblock).
    Lint togs bort ur den blockerande lanen 2026-07-22 (stilregler blockerade
    byggbara sajter); den kan återaktiveras via manifestets `qualityGateTiers`.
    Ägare: **servern** (post-finalize `triggerServerVerification`) — klientens
    post-check-lane POSTar sedan 2026-07 aldrig `/quality-gate` för
    `integrations`-versioner utan följer utfallet via status-polling. Den
    deterministiska F3-forken (finalize-design utan LLM) är undantaget: där
    är klientens `runF3FinalizeAction` enda gate-anropare.
14. promote, `repair_available`, Blocker eller Advisory-status skrivs utifrån
    gate-resultat och promote-guard. En version som hinner ersättas av en
    nyare under gaten settlas terminal-neutralt som `superseded` ("Ersatt",
    aldrig rött `failed`; se [`quality-gate-flow.md`](quality-gate-flow.md).

Viktig ordningsregel: Normalize, verifier och preflight ligger före persist.
VM-gaten (RenderGate/ReleaseGate) ligger efter persist och arbetar på den
sparade versionen.

**Follow-up-preview: patch före full update.** Steg 11 för en follow-up (ny
version på en levande session) bygger fortfarande hela update-payloaden, men
försöker först Fast Edit Lane: appen hämtar hostens filmanifest
(`GET /preview/session/:id/files-manifest`, sha256 per path), diffar payloaden mot
det och skickar bara ändrade filer + `removedPaths` till
`POST /preview/session/patch` — ingen omstart av Next dev. Patchen körs bara när
hosten kör, servar exakt den basversion sessionspekaren påstår, och diffen är
liten och saknar strukturella paths (`package.json`, lockfiles, `next.config.*`,
`tsconfig*`, `.env*`, postcss/tailwind). Allt annat — inklusive uteblivet
manifest från en äldre host — faller tillbaka till `POST /preview/session/update`
med full payload och omstart, dvs. exakt tidigare beteende. Valet loggas som
`kind=preview_followup_lane` (`lane=patch|update` + orsak). Kontrakt och
fallback-tabell: [`../schemas/preview-session-contract.md`](../schemas/preview-session-contract.md).

**Dossier-scopade env-artefakter:** under finalize genereras/uppdateras både
projektets `env.example` och pipeline-ägda `.env.local` från valda dossiers
env-krav (`dossierEnvScope`), så bara relevanta nycklar tas med i stället för en
global lista. Ett tomt scope utelämnar pipeline-`.env.local`, och en äldre
pipeline-markerad fullkatalog skrivs om vid nästa finalize
(`src/lib/gen/preview/project-env-file.ts`,
`src/lib/gen/export/project-scaffold.ts`,
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
- variant fryses för att undvika visuell drift — men följer scaffoldens
  upplåsning: samma signal som släpper scaffold-rematchen
  (`clear-redesign` ELLER `ignorePersistedScaffoldForMatch`, t.ex. "gör om hela
  sajten") släpper också variantlåset, annars renderas den nymatchade
  scaffolden i just den stil användaren bad om att byta
- routes är ett floor, inte ett ceiling
- capabilities får växa men ska inte tyst tappas (can-only-grow). Golvet körs i ALLA follow-up-rundor; i F3-bygget (`integrations`) FILTRERAR därefter ett scope-steg det restaurerade setet — se F3-capability-scope nedan.
- high-value UI-element ska inte tappas utan tydlig anledning

Undantag: clear-redesign och explicita borttagningar. Briefvägen följer samma
skillnad: vanliga uppföljningar återanvänder Snapshot-Brief; bara
`clear-redesign` kör en ny Deep Brief, med tillåtelse att byta stil. När prompten
gäller hela projektet sätter intent + scope-signalerna också
`BuildSpec.changeScope = redesign`, väljer inspirationsserialisering av
scaffolden och släpper merge-vaktens shrink-/strukturlås för den rundan.
Milda eller riktade stiländringar behåller låsen, liksom vanliga follow-ups.

**En generation i taget tills versionen är kontrollerad.** Follow-up-send och
versionsbyte väntar medan stream, verify eller repair pågår (`isInteractionLocked`
i buildern). Escape: `ready` / `promoted` / `failed` / `degraded` / `blocked` /
`idle` / `retrying` (det sista täcker även terminal `superseded`). Autofix får
fortfarande anropa `sendMessage` — låset sitter på composer/version-select, inte
på själva send. Servern svarar `409 generation_in_progress` om två codegen-strömmar
tävlade om samma `chatId` (Redis SET NX, annars in-process). Låset tas både på
init (`POST /api/engine/chats/stream`) och follow-up (`[chatId]/stream`). På init
mintas `chatId` först och låset tas **innan** `engine_chats`-raden infogas, så ett
nekat lås inte lämnar en tom chatt. Follow-up låser den redan existerande chatten;
TTL och `held` är oförändrade där. Om Redis är konfigurerad men `SET` kastar
svarar servern `503 generation_lock_unavailable` i stället för att ljuga om en
pågående generation eller släppa igenom en andra ström. 503:an på init bär inget
`chatId` — raden skapades aldrig. Quality-gate avgör
"senaste version" via `selectPreferredEngineVersion`, inte rå `getLatestVersion`,
så en failad F3-head inte gör en grön F2-design till `superseded`.

En explicit integrationsborttagning (`removedCapabilities`) är auktoritativ
över rå prompt-inferens, Deep Brief, can-only-grow-golvet, filbevis och tidigare
F3-godkännanden. `removedDossierIds` följer stream-meta till finalize, som
raderar manifestägda filer efter merge och kör importkontroll igen. Delade paths
bevaras när ett fortsatt valt Byggblock också äger dem.

## F2/F3-regler

| Läge                              | Syfte                              | Gate                                   |
| --------------------------------- | ---------------------------------- | -------------------------------------- |
| F2 / `design` / `fidelity2`       | Design-preview och snabb iteration | RenderGate (kod: `designPreview`)      |
| F3 / `integrations` / `fidelity3` | Integrationer, build, deploybarhet | ReleaseGate (kod: `integrationsBuild`) |

F3 ska triggas explicit, t.ex. via finalize-design-flöde. Prompten ska inte auto-promota till F3 bara för att den nämner Stripe, auth eller databas.

**Planerad dossier utlöser F3-codegen:** `buildBlockingKeys` är en env-gate,
inte ett register över arbete som återstår. F2 persisterar därför både
`mutedCapabilities` och provider-exakta `mutedDossierIds`. `finalize-design`
subtraherar dossier-filbevis; finns någon planerad dossier kvar godkänns dess
capability + dossier-id durabelt och F3-LLM-rundan körs även när alla nycklar är
`feature-runtime`/`warn-only`. Dossier-id:t återanvänds som selection-hint så
ett generiskt knappmeddelande inte faller tillbaka till ett providersyskons
default. `selectedDossierIds` är alltså byggavsikt, inte leveransbevis. Efter
persist härleder finalize `fileEvidenceDossierIds` och
`fileEvidenceCapabilities` ur den slutligt sparade versionens filer; bara detta
filbevis (eller explicit borttagning) rensar pending.

**Deterministisk F3 när inget återstår att bygga:** bara om inga planerade
dossier-filer saknas och den filhärledda specen inte kräver en generell
LLM-runda skapar `finalize-design` en ny `integrations`-version med byte-för-byte
samma `files_json` som F2-basen. ReleaseGate körs utan codegen; F2 lämnas orörd.

**Demo-läge i F2:** en F2-preview ska se trovärdig ut utan livekonfiguration. Varje hard-dossier har ett effektivt `mock`-läge (`canned`/`seed`/`success`/`visual`/`none`; utelämnat = `none`, se [`dossier-system.md`](../contracts/dossier-system.md)) som driver dossierns egen degraderingskod, och finalize seedar valda dossiers env-nycklar med deterministiska stub-värden i preview-`.env.local` (`env-local.ts`) så UI:t renderar. Stubbarna persisteras aldrig och når aldrig en deploy. Ärlig publiceringsgrind: deploy-409 (`DEPLOY_MISSING_ENV`) blockerar bara på `buildBlockingKeys` i F3 (efter #468 enbart `clerk-auth`s nycklar), F2 förblir demo-publicerbart; `feature-runtime`/placeholder surfar som icke-blockerande `EnvDegradationWarning`. Detaljer: [`env-flow.md`](../contracts/env-flow.md), [`ENV.md`](../ENV.md).

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
(`src/app/api/v0/deployments/route.ts`). CapabilitySmoke-fynd
(`product_postcheck.*`) som sätter `productBlocked` gör readiness röd
(`status: "blocked"`, B1) och sätter `info.productPostcheckBlocksF3`; de
ändrar inte `canDeploy` och stoppar inte promotion.
`preview_probe_unreadable` förblir advisory. Sena `preview:client-error` (error-log `created_at` strikt efter
versionens `promoted_at`) syns som advisory-warning. Fel före
promotion eller utan `promoted_at` förblir diagnostik och sänker inte
`canDeploy`.

### Deploy-repair

Misslyckas en publicering på build-fel kan en riktad **deploy-repair** köras
(`POST /api/v0/deployments/repair`, `src/lib/deploy/deploy-repair.ts`): en LLM-repair
mot deployens build-fel som skapar en ny version att publicera om — utan att köra
hela finalize igen. Deploy-fel loggas dessutom för Error-log RAG via
`src/lib/deploy/deploy-error-log.ts`.

### F3-förslagsrunda och approval-runda

När en F3-generation slutar tool-only (`suggestIntegration` utan kod) parkas chatten i awaiting-input med en persisterad F3-continuation-marker (`f3-continuation.ts`). Markern bär signalerade providers och en rundräknare. Svaret klassas server-side:

- **Godkänn** ärver F3 och kör en _approval-runda_ som tvingar kodgenerering: `suggestIntegration`/`requestEnvVar` dras ur tool-setet, ett byggdirektiv med graceful not-configured-fallback injiceras i prompten, och godkända providers mappas till dossier-capabilities (t.ex. stripe → payments) så hard-dossierns verbatim-mallar väljs in via `selectDossiersForRequest`.
- **Avvisa** konsumerar markern och avslutar F3 lugnt med ett bekräftelsemeddelande — ingen generation körs.
- **Loop-breaker:** max en upprepad tool-only-runda per F3-kick. Andra upprepningen avslutar F3 med ett terminalt meddelande utan ny marker.

**F3-capability-scope (mot capability-inflation).** I F3 lyfts F2-muten, så prompt-filtret + can-only-grow-golvet skulle annars återställa _varje_ capability Deep Brief någonsin nominerade (analytics, auth, payments …) och göra en enda ask till en full-SaaS env-vägg. Golvet körs som vanligt; därefter FILTRERAR `scopeF3DossierCapabilities` (`orchestrate/follow-up-freeze.ts`) F3-setet till unionen av: (a) capabilities som _aktuellt meddelande_ härleder, (b) providers/capabilities användaren _uttryckligen godkänt_ — durabelt över rundor via `f3ApprovedCapabilities`/`f3ApprovedProviders` i orchestration-snapshoten (skrivs av approval-rundan, läses via follow-up-kontraktet), och (c) integrationer med _faktiskt filbevis_ i basversionen (`resolveDossiersPresentInVersion`). Setet dependency-expanderas (`expandDependentCapabilities` — tabellen är tom sedan 2026-08-06 när paddle-billing parkerades, men mekanismen och alias-normaliseringen kvarstår (den tidigare ai-tool-calling⇒droppa-ai-chat-dedupen dog med etapp 4)). Spekulativa brief-/golv-capabilities utan bevis, ask eller godkännande droppas (loggas som `f3_capability_scope_dropped`), och det scopade setet är auktoritativt även när det är tomt (`disableBriefFallback` i selektionen). En approval-runda utan något byggbart alls (inga providers, inga persisterade godkännanden, inget filbevis) stängs ärligt med `f3_approval_nothing_to_build` i stället för en dömd tyst runda. Design-rundor är oförändrade (can-only-grow gäller där). Deep Brief nominerar `analytics`/`error-tracking` bara på explicit ask.

**Samma capability-källa i init och follow-up:** båda vägarna kör
`detectFollowUpCapabilities` + explicit dossier-id-resolution innan
orchestrering. Den breda `inferCapabilities`-bryggan kompletterar detta men
ersätter inte named dossier-capabilities som `gallery-lightbox`, `map-display`
och `site-search` (sektions-capabilities som logo-cloud/stats-counter
parkerades 2026-07-22 — vanligt frihandsinnehåll numera).

**F3-build-plan från basversionen:** stream-routens auktoritativa readiness-gate
detekterar integrationer och valda Byggblock från den exakta parent-versionens
filer. Samma `Tier3BuildSpec` trådas vidare till systempromptens build-plan;
planerade exakta dossier-id:n och explicit godkända providers läggs till eftersom
de ännu inte kan ha filbevis. Övriga `preGenerationContracts` används bara som
fallback när filspec saknas eller är tom. Därmed kan inte ett driftat
promptkontrakt dölja befintliga integrationer eller återinflatera spekulativa.

**Klient-auto-continue:** kontraktet ovan är oförändrat på servern. Klienten (`MessageList.tsx`) har ingen "Svar krävs"-dialog längre — ALLA väntande frågor (klargörande frågor, planblockerare, kontraktsgrind, scope-val, F3-continuation) renderas inline i chattflödet, aldrig som blockerande overlay (ägarbeslut 2026-07-09; en flytande "Svar krävs"-knapp scrollar bara till frågan). För `f3-continuation`-markern specifikt: en marker som anländer LIVE i sessionen auto-skickar `Godkänn förslag` exakt en gång (lugn inline-rad "Integrationsbygget fortsätter automatiskt…"); loop-breakern är säkerhetsnätet så att max en auto-retry + en auto-loop-retry kan ske innan tredje rundan stänger terminalt. En marker som redan fanns vid mount (reload av gammal historik) auto-körs inte — då visas de vanliga inline-quick-replies (Godkänn/Avvisa/Annat). Auto-approve förbrukar credits för retry-rundan (medvetet ägarval).

Tier-3-stub-placeholders (`41-tier3-stub-placeholders.env.txt`-värden i `.env.local`/`env.example`) är inte integrationsbevis: `detectIntegrationsFromVersionFiles` filtrerar stub-/kommentarsrader ur env-artefakter innan provider-regexen körs (`stub-env-filter.ts`). Samma väg används när F3-manifestet räknas om via `injectIntegrationManifestIntoFilesJson` — rå `detectIntegrations(combined)` utan stub-filter får inte längre mata manifestet. Follow-up-filkontexten filtrerar stubbar på samma sätt.

## Fast Edit Lane

Fast Edit Lane är inte en follow-up-codegen. Den är deterministisk och skapar en immutable minor-version från exakta fil-/inspectorändringar.

- Ingen LLM.
- Ingen scaffold rematch.
- Ingen dossier selection.
- Försöker patcha live preview; fallback är full preview start.
- Ska inte köras på F3/integrations-versioner.

**Syntaxgrind (enda verifieringen i lanen).** Inget steg nedströms kontrollerar
en quick edit innan den når preview-VM:en, så `applyQuickEdits` avvisar hela
op-satsen (`parse_regression`, HTTP 422) när en ändrad fil får _fler_
parse-fel än den hade — mätt med `countParseErrors` (TS-parsern) server-side.
Redan trasiga filer får förbli lika trasiga; grinden stoppar bara
försämringar. Undantag: kodvyns spar-knapp skickar `guardSyntax: false`,
eftersom en människa måste kunna spara en halvskriven fil.

Två ingångar, samma lane: kodvyns spar och inspektorsmenyn i previewen. Menyn
öppnas vid muspekaren i inspect-läget och erbjuder ändra text, byt bild och ta
bort element. Klassificeringen (`src/lib/builder/inspect-element-actions.ts`)
avgör vad som faktiskt går att göra på det utpekade elementet innan menyn ritas —
ett val som inte går att utföra visas gråat med orsaken i klarspråk, aldrig som ett
val som tystnar. Text och bild går via `replace_text` med förekomstnummer;
borttagning går via `delete_jsx_node`, som är AST-baserad och vägrar när
borttagningen skulle göra filen oparsbar (`jsx_delete_unsafe`) eller när noden inte
går att adressera (`jsx_delete_unsupported`).

Kodankare: `src/lib/gen/quick-edit/`.

## Generationskostnad och credit-debitering

Sajtmaskins own-engine-genereringar debiteras efter loggad tokenusage, inte
enbart efter vald modellnivå. `/admin/genereringar` visar användaren, prompten,
den genererade versionen, tokenkategorierna, beräknad leverantörskostnad,
prisregeln och de credits som drogs.

### Varför inget webhook-flöde

Synkrona och strömmade modellkörningar ger usage i API-svaret. Det är den enda
källan som kan knytas exakt till Sajtmaskins `chatId`, `versionId` och `userId`.
OpenAI:s organisations-API för [usage](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage)
och [costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/costs)
är aggregerat i tidsbuckets och används för konto-/fakturaavstämning, inte som
hot path per slutanvändargenerering. En `OPENAI_ADMIN_KEY` ger organisationsvid
åtkomst och används server-side av den adminskyddade kontoavstämningen. Den får
finnas som Sensitive Vercel-hemlighet men aldrig exponeras till klienten; vanlig
`OPENAI_API_KEY` används av runtime-anropen.

OpenAI-webhooken i repot tar emot bakgrundsjobb som batch/fine-tuning. Den får
inte ett event för varje vanligt streamat Responses-/Chat-anrop och äger därför
inte debiteringen. Anthropic exponerar på samma sätt input, cache creation,
cache read och output i Messages-svarets usage-objekt.

### Formel och snapshot

Alla lagrade ekonomiska värden är heltal:

```text
providerCostOre = round(providerCostMicroUsd × usdToSekOre / 1 000 000)
billableOre     = round(providerCostOre × markupBasisPoints / 10 000)
credits         = ceil(billableOre / sekPerCreditOre)
```

Standardvärdena är X2,0, 10,50 SEK/USD och 3 SEK per credit. De kan ändras i
admin. Varje version fryser parametrarna när dess första billingrad skapas;
senare adminändringar skriver aldrig om historiska kredittransaktioner.

Tokenpriser läses från `config/ai_models/pricing.json`. Input delas upp i
ordinarie input, cache read och cache write. Reasoning ingår redan i
output-totalen och läggs inte på en andra gång. Modellernas dokumenterade
long-context-multiplikator appliceras per LLM-anrop.

Detta är en reproducerbar kostnadsberäkning från leverantörens usage och
offentliga rate card, inte leverantörens slutliga fakturarad. Avtalade rabatter,
regionalt inference-påslag och separat prissatta serververktyg kan ge avvikelse.
Organisations-API:t används därför fortsatt för periodisk avstämning.

### Debiteringsflöde

1. Varje LLM-anrop sparar `llm_usage`, inklusive cache read/write.
2. När finalize har lyckats etablerar slutflödet först en durabel
   `generation_billings`-rad. Raden sparar requestens unika claim-nyckel
   append-only utan att ändra den frysta prisregeln. Därefter väntar det in usage-skrivningarna och
   stämplar tidiga brief-/embeddingrader med `version_id`; ett fel i den
   best-effort-attachningen kan därför inte ta bort admin-retryvägen.
3. Settlement räknar sedan om hela versionen och låser billingraden.
4. Skillnaden mot redan dragna credits debiteras eller återbetalas. Användarsaldo,
   `transactions` och billingraden uppdateras i samma DB-transaktion. Ett positivt
   debiteringsdelta som överstiger saldot avvisas under användarradens lås; det
   får aldrig skriva ett negativt saldo eller en missvisande transaktionsrad.
5. Sena verifier-/repair-anrop triggar samma settlement igen endast när
   finalize-markören redan finns. Usage som skrivs medan finalize pågår får
   aldrig själv markera versionen som slutförd eller claima gratisgenereringen.
   Parallella försök kan därför inte dubbeldebitera.
6. Manuell LLM-repair av en äldre/importerad version som saknar marker kör en
   icke-gratis credit-preflight innan LLM-anropet och skapar sedan en explicit
   post-processing-marker (`free_generation_eligible = false`). Markern får
   samtidigt `usage_started_at = NOW()` från databasen innan repair-anropet;
   settlement och admin-omstämning räknar därför endast usage från och med den
   gränsen, inte äldre usage som redan låg på den importerade/historiska
   versionen. Varje ny repair kör samma credit-preflight och lägger till sin
   claim-nyckel, men konfliktuppdateringen ändrar varken usage-gränsen eller den
   frysta prisregeln. Kostnaden blir därmed avstämningsbar utan att verifieringen
   förbrukar kontots kostnadsfria första sajtgenerering. Själva VM-quality-gaten
   använder ingen LLM och skapar därför ingen ekonomisk marker på egen hand.

Anonyma användare får inte starta generation. Ett konto har i stället exakt en
kostnadsfri, slutförd own-engine-version; entitlementen claimas under samma
användarradslås som settlement och samma version förblir gratis vid idempotenta
omkörningar och sen usage. Testkonton får kostnadsspår men inget credit-drag.
Om usage eller ett verifierat modellpris saknas markeras raden för avstämning
utan ett osäkert reservdrag. Gratisrättigheten och avstämningsstatusen är
oberoende: den första slutförda versionen förblir gratis, men visas som
`no_usage`, `usage_incomplete`, `unpriced` eller `needs_reconciliation` tills
kostnadsunderlaget är komplett. Den befintliga fasta modellkostnaden används
fortfarande som förhandsgrind eftersom exakt slutusage är okänd före körningen.
Credits-checkens informations-API kräver dessutom explicit
`executionMode=codegen` för att annonsera gratisrättigheten; planläge, manuell
repair samt saknat eller okänt läge får aldrig återanvända den signalen.
Settlement lämnar en durabel `pending`-rad före debittransaktionen; admin kan
köra en idempotent omstämning av väntande billingrader. Om attachningen bröts
använder omstämningen de sparade claim-nycklarna för exakt attribuering utan
tidsgräns innan settlement. Den tar också upp redan avstämda rader när dagens
antal marker-avgränsade `llm_usage`-rader skiljer sig från snapshoten. En saknad billingrad
infereras medvetet inte från usage, eftersom `version_id` kan finnas innan
finalize har slutförts.

Dataägarna är `llm_usage` (anrop/tokens), `generation_billing_settings`
(operatörsregeln), `generation_billings` (snapshot per version), `transactions`
(faktisk saldoändring) och `config/ai_models/pricing.json` (rate card). Billing-
tabellerna saknar innehålls-FK så ekonomispåret överlever normal städning.

Kör `npm run db:migrate` före release och kontrollera därefter en ny generation
i `/admin/genereringar`. Periodsumman stäms av mot leverantörens konto-API.
