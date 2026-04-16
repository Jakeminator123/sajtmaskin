# Fas 1 — Prompt till streamstart

Vad som händer från knapptryck till att LLM-streamen startar.

**Ordlista:** `docs/architecture/glossary.md`. **Kod är source of truth.**

---

## Steg för steg (init = ny chatt)

### 1. Landningssidan → Builder

`startBuild()` i `use-landing-controller.ts`:
- `createProject()` → `appProjectId`
- `POST /api/prompts` → `promptId`
- `router.push("/builder?project=X&promptId=Y&buildMethod=freeform")`

### 2. Builder tar emot prompt-handoff

`deriveBuilderEntryState(searchParams)` i `builder-entry.ts` läser URL-params och bestämmer `entryKind`:

| Prioritet | Villkor | entryKind |
|-----------|---------|-----------|
| 1 | `templateId` finns | `template` |
| 2 | `source === "audit"` | `audit` |
| 3 | `prompt` eller `promptId` | `prompt-handoff` |
| 4 | `project` utan `chatId` | `project-restore` |
| 5 | Inget | `blank` |

Prompten fylls i inputfältet. **Ingen chatt skapas ännu.**

### 3. Användaren trycker "Skapa"

`useCreateChat` → `createNewChat()`:

1. Bygger optimistisk UI: user-meddelande + tom streaming-assistentbubbla.
2. **Prompt-formatering**: Om klienten redan har en brief → rå prompt. Annars `formatPrompt()`.
3. `formatPrompt()` lägger till `MÅL` / `TILLGÄNGLIGHET`-rubriker runt ostrukturerade prompter. Strukturerade prompter (≥ 2 kända rubriker) passerar oförändrade.
4. Bilagor appendas via `appendAttachmentPrompt()`.

### 4. Klienten bygger `meta`-objektet

```
meta = {
  promptOriginal, promptFormatted, isFirstPrompt: true,
  buildIntent, buildMethod, scaffoldMode, scaffoldId,
  designTheme, themeColors, palette,
  promptAssistModel, promptAssistMode, promptAssistDeep,
  modelTier, buildProfileId, imageGenerations,
  // Om brief genererades på klienten:
  brief: pendingBriefRef.current
}
```

### 5. Request till servern

`POST /api/engine/chats/stream` med:
```
{ message, modelId, thinking, imageGenerations, meta, system?, attachments? }
```

---

## Deep Brief

### Vad det är

Ett LLM-genererat strukturerat objekt som beskriver sajten. Produceras av `generateSiteBriefObject()` i `site-brief-generation.ts` med Vercel AI SDK `generateObject` + Zod-schema.

### Vad briefen innehåller (siteBriefSchema)

```
projectTitle, brandName,
pages[]: { name, sections[]: { name, purpose, heroPosition, ctaText } },
visualDirection: { styleKeywords[], colorScheme, mood },
imagery: { strategy, examples },
uiNotes, seo: { title, description },
domainProfile, motionLevel, qualityBar, seasonalHints,
mustHave[], avoid[], toneAndVoice[]
```

### Två vägar till brief

| Väg | Trigger | Källa |
|-----|---------|-------|
| **Klient-brief** | Användaren har brief-verktyget på | `meta.brief` i request |
| **Server auto-brief** | `shouldRunServerAutoBrief()` returnerar true | Genereras på servern i `tryGenerateServerAutoBrief()` |

### Server auto-brief policy (`server-auto-brief-policy.ts`)

Auto-brief körs **inte** om:
- `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF === "1"`
- Klienten redan skickade brief
- `promptSourceTechnical` eller `promptSourcePreservePayload`
- `promptType === "audit"`
- Follow-up (`followup_general` / `followup_technical`)
- Orchestration-reason: `technical_content_preserved` / `preserve_registry_payload`

### Modellval för brief

Bestäms via `resolveRunnableBriefModel()`:
- Default: `AUTO_BRIEF_MODEL_OPENAI` / `AUTO_BRIEF_MODEL_ANTHROPIC` (från `config/ai_models/manifest.json`)
- Om bara en API-nyckel finns → byter till tillgänglig leverantör
- Båda saknas → ingen brief

---

## Scaffold-val

Sker i `orchestrate.ts` → `matchScaffoldAuto()` i `matcher.ts`.

### Tre möjliga scaffold-lägen

| Läge | Beteende |
|------|----------|
| `off` | Inget scaffold |
| `manual` | Användaren valde ett specifikt scaffold-id |
| `auto` | Keyword + embedding-matchning |

### Auto-matchning (steg)

1. **Keyword-matchning** (synkron): 9 nyckelordslistor (landing, saas, portfolio, blog, dashboard, app, auth, ecommerce, content) med tvåspråkiga termer. Hospitality-veto: restaurang/frisör etc. blockerar ecommerce om inte starka e-handelsord finns.

2. **Embedding-matchning** (parallell): `searchScaffoldsWithDiagnostics()` vektoriserar prompten via OpenAI och jämför mot förberäknade scaffold-vektorer med cosine-similarity.

3. **Merge-policy**: Embeddings kan override:a keyword-resultatet om:
   - Score ≥ 0.35 (generell) / 0.45 (generiskt keyword-resultat)
   - Safety guards: auth-scaffold kräver auth-keywords, ecommerce blockeras av hospitality, etc.
   - Icke-generiskt keyword: embedding vinner om `embeddingScore >= keywordStrength × 0.82`

### Persisted scaffold (follow-up)

Vid follow-up: `persistedScaffoldId` från snapshot → `getScaffoldById()` direkt — ingen ny matchning om inget tvingar det.

---

## Capability-inferens

`inferCapabilities(prompt)` i `capability-inference.ts` — **deterministisk regex**, ingen LLM.

Flaggor: `needsMotion`, `needs3D`, `needsCharts`, `needsDatabase`, `needsAuth`, `needsAppShell`, `needsDataUI`, `needsForms`, `needsEcommerce`, `needsCarousel`, `needsPremiumVisuals`, `needsCalendar`, `needsCommandSearch`, `needsThemeToggle`.

Dessa boostar scaffold-matchning och påverkar vilka filer som inkluderas i prompt-kontexten.

---

## Route Plan

`buildRoutePlan()` i `route-plan.ts` bestämmer vilka URL-routes sajten ska ha.

**Provenance** (varifrån routes kommer):

| Källa | Prioritet |
|-------|-----------|
| Brief (`pages[]`) | Primär om den har routes |
| Scaffold-defaults | Blog → `/blog/[slug]`, ecommerce → `/products`, etc. |
| Prompt-patterns | Regex: `/about`, `/contact`, `/pricing`, etc. |

**Output:** `RoutePlan` med `routes[]`, `siteType` (one-page/brochure/content-heavy/app-shell), `provenance`.

**Follow-up-frys:** Befintliga routes bevaras. Nya routes läggs bara till om användaren uttryckligen ber om det (`hasExplicitAddRouteIntent`). Borttag kräver explicit remove-verb + path.

---

## Init vs Follow-up

| | Init | Follow-up |
|---|---|---|
| Brief | Klient eller server auto-brief | Vanligtvis ingen; delta-brief vid redesign |
| Scaffold | `matchScaffoldAuto()` | `persistedScaffoldId` |
| Routes | Fri planering | Fryst med explicita add/remove |
| Continuity | Ingen | `prependOrchestrationContinuityToFollowUp()` |
| `isFirstPrompt` | `true` | `false` |

---

## Kodfiler (huvudflöde)

| Steg | Fil |
|------|-----|
| Landning → builder | `src/app/(landing)/use-landing-controller.ts` |
| URL-parsing | `src/app/builder/builder-entry.ts` |
| Klient skapar chatt | `src/lib/hooks/chat/useCreateChat.ts` |
| Follow-up skickar | `src/lib/hooks/chat/useSendMessage.ts` |
| Prompt-formatering | `src/lib/builder/promptAssist.ts` |
| Deep Brief | `src/lib/builder/site-brief-generation.ts` |
| Auto-brief policy | `src/lib/builder/server-auto-brief-policy.ts` |
| Scaffold-matchning | `src/lib/gen/scaffolds/matcher.ts` |
| Embedding-sökning | `src/lib/gen/scaffolds/scaffold-search.ts` |
| Capability-inferens | `src/lib/gen/capability-inference.ts` |
| Route plan | `src/lib/gen/route-plan.ts` |
| Server init-handler | `src/lib/api/engine/chats/create-chat-stream-post.ts` |
