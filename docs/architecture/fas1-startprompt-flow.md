# Fas 1 — Startprompt: prompt → streamstart

Vad som händer från knapptryck på landningssidan tills LLM-streamen startar (eller misslyckas).

**Senast uppdaterad:** 2026-04-20. **Kod är source of truth.** Ordlista: [glossary.md](./glossary.md).

---

## Init-flöde (ny chatt)

### 1. Landning → Builder

`startBuild()` i `src/components/landing-v2/use-landing-controller.ts`:
- `createProject()` → `appProjectId`
- `POST /api/prompts` → `promptId`
- `router.push("/builder?project=X&promptId=Y&buildMethod=freeform")`

### 2. Builder läser URL-handoff

`deriveBuilderEntryState(searchParams)` i `src/app/builder/builder-entry.ts`:

| Prio | Villkor | entryKind |
|---|---|---|
| 1 | `templateId` finns | `template` |
| 2 | `source === "audit"` | `audit` |
| 3 | `prompt` eller `promptId` | `prompt-handoff` |
| 4 | `project` utan `chatId` | `project-restore` |
| 5 | Inget | `blank` |

Prompten fylls i inputfältet via `useBuilderDerivedState`. **Ingen chatt skapas ännu.**

### 3. Modell- och promptverktyg

| Val | Var | Påverkar |
|---|---|---|
| Byggmodell (`selectedModelTier`) | UI | Codegen via `manifest.json` `buildProfiles` |
| Promptverktyg (`promptAssistModel`) | UI | Brief / rewrite — separat från codegen |
| Djup brief (`promptAssistDeep`) | UI | Endast första prompten i ny chat (`canUseDeepBrief = !chatId`) |

### 4. Klicka "Skapa" → klient-pipeline

`useCreateChat.requestCreateChat()`:

1. `applyDynamicInstructionsForNewChat()` (`useBuilderPromptActions.ts`)
   - `generateDynamicInstructions()` (`useInitBrief.ts`)
   - Vid deep brief: `POST /api/ai/brief` → `generateSiteBriefObject()` → `pendingBriefRef`
2. `createNewChat()` (`useCreateChat.ts`)
   - Om `pendingBriefRef` finns → rå prompt (briefen bärs i `meta.brief`)
   - Annars `formatPrompt()` (MÅL/TILLGÄNGLIGHET-wrapper)
   - Bilagor via `appendAttachmentPrompt()`
3. Bygger `meta`-objekt och `POST /api/engine/chats/stream` (SSE)

```ts
meta = {
  promptOriginal, promptFormatted, isFirstPrompt: true,
  buildIntent, buildMethod, scaffoldMode, scaffoldId,
  designTheme, themeColors, palette,
  promptAssistModel, promptAssistMode, promptAssistDeep,
  modelTier, buildProfileId, imageGenerations,
  brief?, // om klient-brief
}
```

### 5. Server: `create-chat-stream-post.ts`

```
parseChatRequestMeta(meta)
  → resolveModelSelection() → canonisk tier + engineModel
  → orchestratePromptMessage() → strategi (direct | phase | preserved)
  → Brief-resolution:
      effectiveBrief = clientBriefFromMeta ?? tryGenerateServerAutoBrief()
  → prepareGenerationContext() (orchestrate.ts)
      → resolveOrchestrationBase() (scaffold, route plan, contracts, BuildSpec, refs)
      → finalizeOrchestrationPrompts() (system prompt + scaffold variant)
  → createOwnEnginePipelineAndGenerationStream()
      → streamText({ model, system, messages, tools, maxSteps: 4 })
      → SSE: content, thinking, tool-call, done
  → finalizeAndSaveVersion() (autofix → validate → verify → persist)
```

---

## Deep Brief

LLM-genererat strukturerat objekt som beskriver sajten. Produceras av `generateSiteBriefObject()` i `src/lib/builder/site-brief-generation.ts` med Vercel AI SDK `generateObject` + `siteBriefSchema`.

### Schema (siteBriefSchema)

```
projectTitle, brandName,
pages[]: { name, sections[]: { name, purpose, heroPosition, ctaText } },
visualDirection: { styleKeywords[], colorScheme, mood },
imagery: { strategy, examples },
uiNotes, seo: { title, description },
domainProfile, motionLevel, qualityBar, seasonalHints,
mustHave[], avoid[], toneAndVoice[]
```

`briefQuality`: `"full" | "server-auto" | "none"`. Endast `siteBriefSchema` finns — `simplifiedBriefSchema` är borttaget.

### Två vägar till brief

| Väg | Trigger | Källa |
|---|---|---|
| Klient-brief | Användaren har brief-verktyget på | `meta.brief` |
| Server auto-brief | `shouldRunServerAutoBrief() === true` | `tryGenerateServerAutoBrief()` |

### Server auto-brief körs **inte** om

- `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF === "1"`
- Klienten redan skickade brief
- `promptSourceTechnical` eller `promptSourcePreservePayload`
- `promptType === "audit"`
- Follow-up (`followup_general` / `followup_technical`)
- Orchestration-reason: `technical_content_preserved` / `preserve_registry_payload`

### Modellval för brief

`resolveRunnableBriefModel()`:
- Default: `AUTO_BRIEF_MODEL_OPENAI` / `AUTO_BRIEF_MODEL_ANTHROPIC` (från `config/ai_models/manifest.json`)
- Om bara en API-nyckel finns → byter till tillgänglig leverantör
- Båda saknas → ingen brief

---

## Scaffold-val

I `orchestrate.ts` → `matchScaffoldAuto()` (`src/lib/gen/scaffolds/matcher.ts`).

| Läge | Beteende |
|---|---|
| `off` | Inget scaffold |
| `manual` | Användaren valde specifikt scaffold-id |
| `auto` | Keyword + embedding-matchning |
| `persisted` | Follow-up: `getScaffoldById(persistedScaffoldId)` |

### Auto-matchning

1. **Keyword** (synkron): 9 listor (landing, saas, portfolio, blog, dashboard, app, auth, ecommerce, content) tvåspråkigt. Hospitality-veto: restaurang/frisör blockerar ecommerce om inte starka e-handelsord finns.
2. **Embedding** (parallell): `searchScaffoldsWithDiagnostics()` → OpenAI embeddings vs förberäknade scaffold-vektorer (cosine).
3. **Merge-policy**: Embeddings kan override:a keyword om score ≥ 0.35 (eller 0.45 mot generiskt keyword) och safety guards passerar (auth kräver auth-keywords, etc.).

---

## Capability-inferens

`inferCapabilities(prompt)` i `src/lib/gen/capability-inference.ts` — **deterministisk regex**, ingen LLM.

Flaggor: `needsMotion`, `needs3D`, `needsCharts`, `needsDatabase`, `needsAuth`, `needsAppShell`, `needsDataUI`, `needsForms`, `needsEcommerce`, `needsCarousel`, `needsPremiumVisuals`, `needsCalendar`, `needsCommandSearch`, `needsThemeToggle`.

Boostar scaffold-matchning och styr prompt-kontext.

---

## Route Plan

`buildRoutePlan()` i `src/lib/gen/route-plan.ts`.

| Källa | Prioritet |
|---|---|
| Brief (`pages[]`) | Primär om den har routes |
| Scaffold-defaults | Blog → `/blog/[slug]`, ecommerce → `/products`, ... |
| Prompt-patterns | Regex: `/about`, `/contact`, `/pricing`, ... |

Output: `RoutePlan { routes[], siteType, provenance }`.

---

## Follow-up (befintlig chatt)

`useSendMessage` → `POST /api/engine/chats/[chatId]/stream` → `chat-message-stream-post.ts`.

| Aspekt | Init | Follow-up |
|---|---|---|
| Deep Brief | Klient eller server auto | Ingen (delta-brief vid redesign) |
| Scaffold | `auto`/`manual` | `persisted` |
| Previous files | Inga | Senaste version (`resolveFollowUpPreviousFiles()`) |
| File context | Ingen wrapping | Befintliga filer + change scope |
| Routes | Fri planering | Frysta — explicit add/remove krävs |
| Continuity | Ingen | `prependOrchestrationContinuityToFollowUp()` |
| `isFirstPrompt` | `true` | `false` |
| `generationMode` | `"init"` | `"followUp"` |
| Follow-up intent | N/A | `classifyFollowUpIntent()` |
| Clarification | Pre-generation contracts | `checkFollowUpClarification()` |
| Context policy | N/A | `deriveFollowUpContextPolicy()` (`light` / `normal`) |

---

## API-routing (direkt provider, ingen gateway)

| Syfte | Funktion | Nyckel |
|---|---|---|
| Codegen (own-engine) | `getOpenAIModel()` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` |
| Brief / prompt-assist | `createDirectModel()` | samma |
| Prompt rewrite/polish | `createDirectModel()` | samma |

`PromptAssistProvider` är `"openai" | "anthropic"`. HTTP-scheman accepterar `"gateway"` för bakåtkompatibilitet och normaliserar till `"openai"` server-side.

---

## Tools tillgängliga i streamText

`getAgentTools()`. `maxSteps: 4` tillåter multi-step efter tool-result.

| Tool | `execute` | Effekt |
|---|---|---|
| `suggestIntegration` | Ja | Non-blocking — modellen fortsätter koda |
| `requestEnvVar` | Ja | Non-blocking |
| `askClarifyingQuestion` | Nej | Blocking — frågar användaren |
| `emitPlanArtifact` | Nej | Plan mode |

---

## Kodfiler (huvudflöde)

| Steg | Fil |
|---|---|
| Landning → builder | `src/components/landing-v2/use-landing-controller.ts` |
| URL-parsing | `src/app/builder/builder-entry.ts` |
| Klient skapar chatt | `src/lib/hooks/chat/useCreateChat.ts` |
| Follow-up skickar | `src/lib/hooks/chat/useSendMessage.ts` |
| Init brief-orchestration | `src/lib/hooks/chat/useInitBrief.ts` |
| Prompt-formatering | `src/lib/builder/prompt-assist/` |
| Deep Brief | `src/lib/builder/site-brief-generation.ts` |
| Auto-brief policy | `src/lib/builder/server-auto-brief-policy.ts` |
| Orchestration | `src/lib/gen/orchestrate.ts` |
| Scaffold-matchning | `src/lib/gen/scaffolds/matcher.ts` |
| Embedding-sökning | `src/lib/gen/scaffolds/scaffold-search.ts` |
| Capability-inferens | `src/lib/gen/capability-inference.ts` |
| Route plan | `src/lib/gen/route-plan.ts` |
| Server init-handler | `src/lib/api/engine/chats/create-chat-stream-post.ts` |
| Server follow-up-handler | `src/lib/api/engine/chats/chat-message-stream-post.ts` |

---

## Kända problem (2026-04-20)

| ID | Område | Status |
|---|---|---|
| P2 | Dubbel brief: client+server kan båda köra om klient-brief inte hinner före request | Öppet |
| P4 | `ProjectEnvVarsPanel` visar inte preview-merge-lagret (placeholders + project-env + generated) | Öppet |
| P6 | Anthropic-grenen loggar inte `brief.full` i devLog (asymmetrisk logging) | Öppet |
| P7 | Flera överlappande prompt-lager: Deep Brief, Rewrite, Polish, formatPrompt, server-auto-brief | Öppet |
| P10 | UI-kosmetik under generering (rå JSX i chat, knappar disabled, badge-inkonsistens) | Öppet |

Lösta tidigare: P1 tool-only output (execute lades till), P3 brief-schema (simplified borttaget), P5 NEXT_PUBLIC_SITE_URL (klassad som harmless), P8 preview overlay race (bootstrap-guard), P9 Unsplash garbage queries (sanitize + viability check).

---

## Förenklingskandidater

- Slå ihop brief-vägarna (client vs server-auto) eller gör dem strikt sekventiella.
- Symmetrisera brief-loggning OpenAI/Anthropic.
- Reducera prompt-lager: en kanonisk path (Deep Brief eller Rewrite, inte båda).
- Synliggör placeholder-merge i env-panelen.
