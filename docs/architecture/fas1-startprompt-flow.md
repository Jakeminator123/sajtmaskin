# Fas 1 — Startprompt: LLM-flöde och scaffold-kedja

Detaljerad kartläggning av vad som händer från att användaren skriver en prompt
till att own-engine-strömmen startar (eller misslyckas).

---

## Flödesöversikt (mindmap-stil)

```
Användaren skriver prompt på landingssidan
│
├── startBuild()  [use-landing-controller.ts]
│   ├── createProject()
│   ├── POST /api/prompts  →  promptId
│   └── router.push("/builder?project=X&promptId=Y&buildMethod=freeform")
│
└── Builder tar emot prompt-handoff
    │
    ├── deriveBuilderEntryState()  [builder-entry.ts]
    │   └── entryKind: "prompt-handoff" | "template" | "audit" | "blank"
    │
    ├── resolvedPrompt → initialPrompt i ChatInterface  [useBuilderDerivedState.ts]
    │   └── Förifylls i inputfältet, INGEN chat skapas ännu
    │
    ├── Användaren väljer modell + promptverktyg + djup brief
    │   ├── Byggmodell (selectedModelTier): fast | pro | max | codex | anthropic
    │   │   └── Mappar till provider-modell via manifest.json buildProfiles
    │   ├── Promptverktyg (promptAssistModel): openai/gpt-5.4, anthropic/claude-opus-4.6, ...
    │   │   └── Separat från byggmodell — styr brief/rewrite, inte codegen
    │   └── Djup brief (promptAssistDeep): boolean, default true
    │       └── Gäller BARA första prompten i ny chat (canUseDeepBrief = !chatId)
    │
    └── Användaren klickar skicka → requestCreateChat()
        │
        ├── 1. applyDynamicInstructionsForNewChat()  [useBuilderPromptActions.ts]
        │   ├── generateDynamicInstructions()  [useInitBrief.ts]
        │   │   ├── Om assist = "off": skippar, bygger enkel addendum
        │   │   ├── Om deep brief:
        │   │   │   ├── POST /api/ai/brief  (client-side deep brief)
        │   │   │   │   ├── generateSiteBriefObject()  [site-brief-generation.ts]
        │   │   │   │   ├── Använder createDirectModel() → OPENAI_API_KEY / ANTHROPIC_API_KEY
        │           │   │   │   ├── Schema: siteBriefSchema (enda schemat; null vid fail → server auto-brief)
        │   │   │   │   └── Returnerar brief-objekt med briefQuality: "full" | "server-auto" | "none"
        │   │   │   └── Brief sparas i pendingBriefRef
        │   │   └── Om shallow: bygger prompt-addendum från heuristik
        │   └── Sätter customInstructions + pendingBriefRef
        │
        ├── 2. createNewChat()  [useCreateChat.ts]
        │   ├── Formaterar prompt:
        │   │   ├── Om pendingBriefRef finns: skickar råtext (briefen bärs i meta.brief)
        │   │   └── Om ingen brief: formatPrompt() wrapper (MÅL/TILLGÄNGLIGHET)
        │   ├── Bygger promptMeta med: brief, modelId, modelTier, scaffold, palette, etc.
        │   └── POST /api/engine/chats/stream  (SSE)
        │
        └── 3. Server: create-chat-stream-post.ts
            │
            ├── parseChatRequestMeta(meta)
            ├── resolveModelSelection() → canonisk tier + engineModel
            ├── orchestratePromptMessage() → strategi (direct/phase/preserved)
            │
            ├── Brief-resolution:
            │   ├── clientBriefFromMeta = meta.brief (från steg 1)
            │   ├── Om client-brief saknas: shouldRunServerAutoBrief()?
            │   │   └── tryGenerateServerAutoBrief() → server-side fallback
            │   └── effectiveBrief = clientBriefFromMeta ?? serverAutoBrief
            │   └── ⚠️ DUBBEL BRIEF: båda kan köras om client-brief
            │       inte hinner med innan create-chat startar
            │
            ├── Orchestrering: prepareGenerationContext()  [orchestrate.ts]
            │   ├── resolveOrchestrationBase()
            │   │   ├── Scaffold-val:
            │   │   │   ├── off → ingen scaffold
            │   │   │   ├── manual → getScaffoldById(scaffoldId)
            │   │   │   ├── persisted → befintlig scaffold
            │   │   │   └── auto → matchScaffoldAuto() (keyword + embedding)
            │   │   ├── Route plan: buildRoutePlan()
            │   │   ├── Pre-generation contracts: inferPreGenerationContracts()
            │   │   ├── BuildSpec: deriveBuildSpec()
            │   │   └── Component references: loadShadcnExamples() + community blocks
            │   │
            │   └── finalizeOrchestrationPrompts()
            │       ├── buildDynamicContext() → system prompt med alla lager
            │       ├── composeEngineSystemPrompt()
            │       └── Scaffold variant, template guidance, structural files
            │
            ├── Pipeline: createOwnEnginePipelineAndGenerationStream
            │   ├── createGenerationPipeline()  [engine.ts]
            │   │   ├── getOpenAIModel(engineModel) → AI SDK provider
            │   │   ├── streamText({ model, system, messages, tools, maxSteps })
            │   │   │   ├── tools = getAgentTools()  ← NYCKEL FÖR TOOL-ONLY BUG
            │   │   │   │   ├── suggestIntegration  (nu med execute → non-blocking)
            │   │   │   │   ├── requestEnvVar        (nu med execute → non-blocking)
            │   │   │   │   ├── askClarifyingQuestion (INGEN execute → blocking)
            │   │   │   │   └── emitPlanArtifact      (INGEN execute → plan mode)
            │   │   │   └── maxSteps: 4 (tillåter multi-step efter tool result)
            │   │   └── createCodeGenSSEStream() → SSE events
            │   │
            │   └── createOwnEngineGenerationStream()  [generation-stream.ts]
            │       ├── Parserar SSE: content, thinking, tool-call, done
            │       ├── emitOwnEngineToolCallSse() för tool calls
            │       ├── accumulatedContent byggs från content-events
            │       └── Vid done: finalizeAndSaveVersion() eller handleEmptyGeneration()
            │
            └── Finalize-pipeline (om kod genererades):
                ├── autofix
                ├── url_expand
                ├── validate_syntax (ev. LLM-fixer)
                ├── materialize_images
                ├── verifier
                └── parse_merge_preflight → version sparas
```

---

## Follow-up (uppföljning i befintlig chat)

Follow-up skiljer sig från init på fyra sätt:

```
Användaren skickar ny prompt i befintlig chat (chatId finns)
│
├── useSendMessage() eller requestCreateChat() om chatId saknas
│   ├── Ingen deep brief körs (canUseDeepBrief = false)
│   ├── formatPrompt() wrapping (MÅL/TILLGÄNGLIGHET) — inte brief
│   └── POST /api/engine/chats/[chatId]/stream
│
└── Server: chat-message-stream-post.ts
    │
    ├── Hämtar befintlig chat (engineChat) + persisted scaffold
    ├── resolveFollowUpPreviousFiles()
    │   └── Läser senaste versionens filer från DB
    │
    ├── Follow-up-specifik logik:
    │   ├── followUpIntent: classifyFollowUpIntent()
    │   │   └── "neutral" | "clear-redesign" | "copy-change" | ...
    │   ├── followUpClarification: checkFollowUpClarification()
    │   │   └── Kan trigga askClarifyingQuestion om beslut behövs
    │   ├── deriveFollowUpContextPolicy()
    │   │   └── "light" för enkla ändringar, "normal" för tyngre
    │   └── buildFileContext() — wraps user prompt med:
    │       ├── Befintliga filer (komprimerade)
    │       ├── Change scope hints
    │       └── Continuity-instruktioner
    │
    ├── Orchestrering (samma som init men med skillnader):
    │   ├── scaffoldMode = "persisted" (inte "auto")
    │   ├── generationMode = "followUp"
    │   ├── brief skickas INTE — utgår från befintlig scaffold + filer
    │   ├── Route plan fryser ofta befintliga routes
    │   └── Capability-heavy follow-ups behåller contextPolicy: "normal"
    │
    └── Pipeline + finalize (samma kedja som init)
```

### Viktiga skillnader init vs follow-up

| Aspekt | Init (ny chat) | Follow-up (befintlig chat) |
|--------|---------------|---------------------------|
| Deep Brief | Ja (om assist är på) | Nej |
| Server auto-brief | Ja (fallback) | Nej |
| Scaffold-val | auto/manual | persisted |
| Previous files | Inga | Senaste version |
| File context | Ingen wrapping | Befintliga filer + change scope |
| Follow-up intent | N/A | Klassificeras |
| Clarification | Möjlig via contracts | Möjlig via follow-up check |
| generationMode | "init" | "followUp" |

---

## API-routing (direkt provider, inte gateway)

Alla LLM-anrop i builder-flödet går via direkta provider-API:er:

| Syfte | Funktion | Nyckel |
|-------|----------|--------|
| Codegen (own-engine) | `getOpenAIModel()` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` |
| Brief / prompt-assist | `createDirectModel()` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` |
| Prompt rewrite/polish | `createDirectModel()` | samma |

`PromptAssistProvider` är nu `"openai" | "anthropic"` — den gamla `"gateway"`-etiketten
är borttagen ur runtime-typer. HTTP-scheman accepterar `"gateway"` för bakåtkompatibilitet
och normaliserar till `"openai"` server-side.

---

## Kända problem (2026-04-15)

### P1 — Tool-only output (fixat)
Modellen anropar `suggestIntegration`/`requestEnvVar` men genererar ingen kod.
**Orsak:** Verktygen saknade `execute`-funktioner, så AI SDK multi-step-loopen
avbröts efter tool calls utan att modellen fick tool-resultat att fortsätta med.
**Fix:** `execute` tillagt på non-blocking tools.

### P2 — Dubbel brief
Client-side deep brief och server auto-brief kan köras parallellt.
Om client-brief inte hinner med innan create-chat startar skickas
ingen `meta.brief`, och servern triggar sin egen auto-brief.

### P3 — Brief schema för stor för Anthropic structured output
`siteBriefSchema` har >24 optional parameters → `grammar compilation`-fel
hos Anthropic. Fallback till `simplifiedBriefSchema` misslyckas ibland också.

### P4 — Env-panel visar inte preview-placeholders
`ProjectEnvVarsPanel` jämför bara sparade projektvariabler.
Preview-merge-lagret (placeholders + preview-token + project-env + generated)
syns inte i UI, vilket ger intryck av "saknas" för nycklar som tier-2 redan
skulle ha via placeholder.

### P5 — Placeholder-lucka: NEXT_PUBLIC_SITE_URL
Flaggas som relevant i `detect-integrations.ts` men finns inte i
`40-generated-site-integration-placeholders.env.txt`.

### P6 — Brief-loggning asymmetrisk
OpenAI-grenen loggar `brief.full` i devLog. Anthropic-grenen gör det inte.
Om du kör Anthropic som prompt-assist syns brief-resultatet inte i lokala loggar.

### P7 — Överlappande prompt-lager
Flera omskrivningsvägar existerar parallellt:
- Deep Brief (strukturerad brief → meta.brief)
- Prompt Rewrite ("Förbättra"-knappen)
- Prompt Polish ("Skriv om"-knappen)
- formatPrompt() (MÅL/TILLGÄNGLIGHET-wrapper)
- Server-side prompt orchestration
- Server auto-brief (fallback)

### P8 — "Laddar preview..." fastnar trots att sajten renderas (fixat)
Preview-overlayen ("Laddar preview...") förblir synlig trots att VM:en kör
och sajten renderas i iframen. Användaren kan inte interagera med sajten.
**Orsak:** Race condition i SSE-hantering:
1. SSE `done` → `setPreviewPending(true)` (stream-handlers.ts:764)
2. SSE `preview-ready` → `setPreviewPending(false)` (stream-handlers.ts:673)
3. `.then()` i useCreateChat.ts:306 → `setPreviewPending(data.previewPending)` → sätter tillbaka `true`
4. Bootstrap-effekten i useBuilderVmPreview.ts ser att URL redan är live → early return utan att cleara `previewPending`
**Fix:** Lade till `setPreviewPending(false)` i bootstrap-effektens early-return-guard
(useBuilderVmPreview.ts:225) när preview-URL redan är en live tier-2-URL.

### P9 — Unsplash-query parsar garbage (fixat)
Image-materialization skickar meningslösa queries (t.ex. `}`) till Unsplash API.
**Orsak:** `sanitizeQuery()` i image-materializer.ts strippar template literals
och backticks men inte code artifacts ({, }, [, ], <, >, ;, =). Ingen
minimilängd-check på den sanitiserade queryn.
**Fix:** Lade till stripping av code-tecken + `isViableImageQuery()` guard
(kräver minst 3 word-tecken).

### P10 — UI-kosmetik under generering
Noterade under testgenerering 2026-04-15:
- Rå JSX-kod visas i chatpanelen (`<div style={{ ... }}>`) istället för att
  döljas bakom fillistan
- "Förbättra" / "Skriv om"-knappar förblir disabled efter avslutad generering
- "Inga versioner ännu" visas under aktiv generering (borde visa progress)
- Filbadge-inkonsekvens under streaming: `site-footer.tsx 352` (utan L-suffix)
  vs `85L` — normaliseras först efter avslut
- "Lansering"-sektionen visar "1 varning" + "verifying" under pågående
  quality gate — oklart om detta ska exponeras för slutanvändare

---

## Förenklingskandidater (notering, inte beslut)

- Konsolidera "gateway"-etiketten till "openai-class" eller ta bort den.
- Slå ihop eller tydliggör brief-vägarna (client vs server auto).
- Reducera brief-schemat så det klarar Anthropic structured output.
- Ge env-panelen synlighet för preview-placeholder-lagret.
- Symmetrisera brief-loggning mellan providers.
- Undvik att `.then()` i useCreateChat.ts blindt skriver `previewPending`
  från done-data — kontrollera om `preview-ready` redan clearat den.
