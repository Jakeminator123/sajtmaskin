# Motor-status: Egen kodgenereringsmotor

> Senast uppdaterad: 2026-03-12 (plan-mode persistence, Phase 8 closure, research-lane sync)

## Arkitektur

```
Användarens prompt
       │
       ▼
┌──────────────────────────────┐
│  PROMPT ASSIST               │
│  - Polish: gpt-4.1-mini     │
│  - Deep Brief: gpt-5.4      │
│  (via AI Gateway)            │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  PRE-GENERATION              │
│  - Prompt-orkestrering       │
│  - Scaffold-matchning (10 st)│
│  - URL-komprimering          │
│  - Dynamisk kontext (KB)     │
│  - Brief -> system prompt    │
│  - buildSystemPrompt()       │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  GENERATION (4 tiers)        │
│  Fast:      gpt-4.1          │
│  Pro:       gpt-5.3-codex    │
│  Max:       gpt-5.4          │
│  Codex Max: gpt-5.1-codex-max│
│  (alla via OPENAI_API_KEY)   │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  POST-GENERATION             │
│  finalizeAndSaveVersion():   │
│  1. 7-stegs autofix          │
│  2. esbuild-validering       │
│  3. URL-expansion            │
│  4. Fil-parsning             │
│  5. Scaffold-merge + varning │
│  6. Import-checker (scaffold)│
│  7. Version-sparning         │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  PREVIEW & DELIVERY          │
│  - Preview-render (iframe)   │
│  - Nedladdning (zip)         │
│  - Deploy (Vercel API)       │
└──────────────────────────────┘
```

## Own-engine preview model

The default own-engine preview is **not** a full Node.js build of the generated
app. It is a fast internal preview surface that renders a self-contained HTML
view from the saved version files.

What that means in practice:

- the engine generates code and saves a version
- the preview route loads the saved files
- the preview layer builds self-contained HTML for the iframe
- this is cheaper and faster than booting a full sandbox for every generation
- it is useful for fast iteration, but it is not identical to a real deployed runtime

When you need something closer to a real Node.js runtime, the intended path is
Sandbox or actual deployment, not the default preview iframe.

## Own-engine runtime flow

```mermaid
flowchart TD
    userPrompt[Anvandarprompt] --> ingress[BuilderOrApiIngress]

    subgraph orchestration [OrchestrationLayer]
        ingress --> promptNormalization[PromptNormalisering]
        promptNormalization --> contextOrchestration[ContextOrchestration]
        contextOrchestration --> scaffoldSelection[RuntimeScaffoldSelection]
        scaffoldSelection --> capabilityInference[CapabilityInference]
        capabilityInference --> systemPromptAssembly[SystemPromptAssembly]
        systemPromptAssembly --> modelResolution[ModelResolution]
    end

    subgraph generation [GenerationLayer]
        modelResolution --> ownEngine[OwnEngineGenerationPipeline]
        ownEngine --> streamedOutput[StreamedAiOutput]
        streamedOutput --> outputComplete{OutputKomplett}
        outputComplete -->|Nej| awaitingInput[AwaitingInputIngenVersion]
        outputComplete -->|Ja| accumulatedContent[AccumulatedGenerationContent]
    end

    subgraph finalization [FinalizationLayer]
        accumulatedContent --> autofix[Autofix]
        autofix --> syntaxValidation[SyntaxValidationAndRepair]
        syntaxValidation --> urlExpansion[UrlExpansionAndImageMaterialization]
        urlExpansion --> parseGeneratedFiles[ParseGeneratedFiles]
        parseGeneratedFiles --> mergeFiles[MergeWithScaffoldOrPreviousVersion]
        mergeFiles --> importChecks[ImportChecks]
        importChecks --> previewPreflight[PreviewPreflight]
        previewPreflight --> sanityChecks[ProjectSanityChecks]
        sanityChecks --> persistAssistant[PersistAssistantMessage]
        persistAssistant --> persistVersion[PersistVersionFiles]
    end

    subgraph preview [RuntimePreviewLayer]
        persistVersion --> previewPassed{PreviewPreflightPassed}
        previewPassed -->|Ja| previewUrl[GenerateOwnPreviewUrl]
        previewPassed -->|Nej| previewBlocked[VersionSavedPreviewBlocked]
        previewUrl --> previewRender[GetApiPreviewRender]
        previewRender --> loadFiles[LoadFilesFromPostgres]
        loadFiles --> buildHtml[BuildSelfContainedPreviewHtml]
        buildHtml --> iframePreview[IframeRuntimePreview]
    end

    subgraph postGeneration [PostGenerationControlLayer]
        previewUrl --> postChecks[PostChecks]
        previewBlocked --> postChecks
        postChecks --> versionDiffing[VersionDiffing]
        versionDiffing --> healthChecks[PreviewHealthSeoRouteChecks]
        healthChecks --> qualityGate[QualityGateSandbox]
        qualityGate --> repairNeeded{RepairNeeded}
        repairNeeded -->|Ja| autofixFollowup[AutofixFollowupRequest]
        autofixFollowup --> ingress
        repairNeeded -->|Nej| accepted[VersionAcceptedReadinessState]
    end

    subgraph deployment [DeploymentLayer]
        accepted --> publishRequested{PublishRequested}
        publishRequested -->|Ja| loadPersistedVersion[LoadPersistedVersionFiles]
        loadPersistedVersion --> predeployFixes[PredeployFixes]
        predeployFixes --> blobMaterialization[BlobMaterialization]
        blobMaterialization --> vercelDeploy[VercelDeploymentApi]
        vercelDeploy --> deployedRuntime[PermanentDeployedRuntime]
    end
```

## Modellmappning (egen motor)

Canonical build profiles live in `docs/schemas/model-build-profiles.md`.

| Build profile | Fallback-v0-ID | OpenAI-modell | Användning |
|---------------|----------------|---------------|------------|
| **Fast** (`fast`) | `v0-max-fast` | `gpt-4.1` | Snabba ändringar, enkla sidor |
| **Pro** (`pro`) | `v0-1.5-md` | `gpt-5.3-codex` | Kodspecialiserad, balanserad |
| **Max** (`max`) | `v0-1.5-lg` | `gpt-5.4` | Flaggskepp, bäst reasoning |
| **Codex Max** (`codex`) | `v0-gpt-5` | `gpt-5.1-codex-max` | Kodgenerering med xhigh reasoning |

Default selected profile: **Max** (`max`)

## API-nycklar

| Flöde | Nyckel |
|-------|--------|
| Kodgenerering | `OPENAI_API_KEY` (direkt mot OpenAI) |
| Prompt Assist | `AI_GATEWAY_API_KEY` (Vercel AI Gateway) |
| Deep Brief | `AI_GATEWAY_API_KEY` (gateway-only) |
| V0-fallback | `V0_API_KEY` (bara om `V0_FALLBACK_BUILDER=y`) |

## Scaffold-system (10 scaffolds)

base-nextjs, landing-page, saas-landing, portfolio, blog, dashboard, auth-pages, ecommerce, content-site, app-shell

Matcher: keyword-baserad med ordgräns-regex, svenska + engelska, med
embedding-baserad fallback när keyword-matchningen bara ger generiska defaultfall.
Scaffold-kontext injiceras i system prompt (inte user message).
Import-checker körs efter merge.

## Implementerat

| Modul | Filer | Status |
|-------|-------|--------|
| Kodgenerering (4 tiers) | `src/lib/gen/engine.ts` | Fungerar |
| Systemprompt (~17K tokens) | `src/lib/gen/system-prompt.ts` | Fungerar |
| 12 suspense-regler | `src/lib/gen/suspense/rules/*` | Fungerar |
| 7-stegs autofix | `src/lib/gen/autofix/*` | Fungerar |
| Scaffold-import-checker | `src/lib/gen/autofix/rules/scaffold-import-checker.ts` | Ny |
| finalizeAndSaveVersion | `src/lib/gen/stream/finalize-version.ts` + `src/lib/gen/stream/finalize-*.ts` | Förbättrad |
| Empty-output guard | `src/lib/gen/stream/finalize-version.ts` + stream routes | Ny |
| AI SDK stream-event loggning | `src/lib/gen/stream-format.ts` | Ny |
| Merge med varningar | `src/lib/gen/version-manager.ts` | Förbättrad |
| esbuild syntax-validering | `src/lib/gen/autofix/syntax-validator.ts` | Fungerar |
| LLM fixer | `src/lib/gen/autofix/llm-fixer.ts` | Fungerar |
| Säkerhetsmodul | `src/lib/gen/security/*` | Fungerar |
| 50 docs-snippets + KB | `src/lib/gen/data/docs-snippets.ts` | Fungerar |
| 792 Lucide-ikoner | `src/lib/gen/data/lucide-icons.ts` | Fungerar |
| Preview-render | `src/lib/gen/preview/*` | Fungerar |
| Projekt-scaffold | `src/lib/gen/project-scaffold.ts` | Fungerar |
| 10 scaffolds | `src/lib/gen/scaffolds/*/manifest.ts` | Alla klara |
| Plan-mode + review-step | `src/app/api/v0/chats/stream/route.ts`, `src/app/api/v0/chats/[chatId]/stream/route.ts`, `src/components/builder/BuildPlanCard.tsx` | Ny |
| Readiness + launch-gating | `src/app/api/v0/chats/[chatId]/readiness/route.ts`, builder-UI, deploy-actions | Ny |

## Kända kvarvarande begränsningar

- Extern template-research är nu kanoniskt normaliserad under
  `research/external-templates/`, men rå discovery och repo-cache är fortfarande
  build-time/research-time och inte runtime-input
- Preview stubs approximerar shadcn -- inte pixelperfekt
- Ingen scaffold-medveten retry vid generingsfel
- Multipage/site-planering finns nu i planartefakten och persisteras for
  own-engine-chatten, men scaffold-medveten retry saknas fortfarande
- Plan-mode är i praktiken own-engine-only; v0-fallback bypassar fortfarande den
  review-driven vägen

## Nya skydd och beteenden

- Första generationer som returnerar `contentLen: 0` sparas inte längre som scaffold-baserade fejkversoner.
- Create/send-streams loggar nu en sammanfattning av AI SDK-eventtyper och tool-calls för enklare felsökning av tomma streams.
- Scaffold-serialisering känner nu igen fler svenska kreativa nyckelord (`djungel`, `70-talet`, `kamouflage`, `taktisk`, m.fl.) och instruerar modellen att skriva om placeholder-copy tydligare.
- Systemprompten instruerar nu modellen att undvika preview-osäkra globala beroenden som `Canvas` och `Autoplay`; klienttunga bibliotek ska importeras explicit eller ges fallback.
- Follow-up-streamen anvander nu samma agent-tools som create-streamen, sa modellen kan stanna och skicka `askClarifyingQuestion` / integrationssignaler aven efter forsta versionen.
- Capability inference markerar nu databasprompter separat (`needsDatabase`) och hintar uttryckligen att modellen inte far gissa Prisma/Supabase/SQLite/provider utan bekraftelse.
- Env-audit for admin skiljer nu pa `local_only`, `environment_specific`, `shared_runtime` och target-tackning pa Vercel, sa lokal `.env.local` och Vercel-targets kan granskas utan blind sync.
- Create/send-streams kan nu koras i ett riktigt plan-lage for own-engine chats,
  med rikare `PlanArtifact`, blocker-fragor, review-card och en explicit
  approve -> build-brygga.
- Planner-svaret persisteras nu med canonical `uiParts` i chat-lagret, sa
  own-engine-chat reload kan aterskapa review-kortet utan att vara beroende av
  lokal-only state.
- Den gamla klientorkestratorn `usePlanExecution.ts` ar borttagen; approve ->
  build ags nu av den serverdrivna promptbryggan.
