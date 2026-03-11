---
name: v0 Prompt Architecture Analysis
overview: En genomgång av vad som läckte från v0, hur deras promptbyggande faktiskt fungerar (systemprompten + pipeline), och hur sajtmaskin redan implementerar liknande mönster – plus identifierade luckor.
todos:
  - id: analyze-gap-streaming
    content: Bedöm om streaming post-processing (LLM Suspense-mönster) är värt att implementera för sajtmaskin
    status: pending
  - id: analyze-gap-autofix
    content: Kartlägg vilka vanligaste generationsfel som uppstår och om en autofix-modell/deterministisk fix skulle hjälpa
    status: pending
  - id: docs-injection
    content: Utvärdera intent-detektion + dynamisk docs-injektion (ROADMAP-punkt E, embeddings) för AI SDK / design system-relaterade prompts
    status: pending
isProject: false
---

# v0 Prompt Architecture – Analys och Jämförelse

## Vad som faktiskt läckte

Det som cirkulerat offentligt (GitHub-repo `2-fly-4-ai/V0-system-prompt`, Reddit r/LocalLLaMA nov 2024) är v0:s **systemprompter** – den statiska "interna påminnelsen" som finns i varje konversation. De är ~8 000–16 000 tokens långa och läckte via att interna taggar som `<thinking>` råkade följa med i svaret, eller via tidiga prompt-injection-försök (som v0 sedan blockerade med felkod `PROMPT_LEAKING`).

---

## v0:s Systempromptsstruktur (från läckt material)

### 5 fasta block i varje systemprompter:

**Block 1 – Identitet & mandat**

```
- v0 is an advanced AI coding assistant created by Vercel.
- v0 responds using the MDX format and has access to specialized MDX types.
- v0's emphasis: React, Next.js App Router, modern web development.
```

**Block 2 – Utdataformat (MDX-typer)**
Exakta regler per block-typ:

- `tsx file="path" type="react"` – React Project (multi-file, Next.js)
- `type="nodejs"` / `type="python"` / `type="html"` / `type="markdown"`
- Mermaid-diagram, LaTeX, etc.
- **Nyckelregel**: `BEFORE creating a React Project, v0 THINKS through structure, styling, images, formatting, frameworks` – explicit `<thinking>`-steg

**Block 3 – MDX-komponenter**
Definierar komponenter som `<Steps>` för flerstegsprocesser.

**Block 4 – Capabilities**
Vad användaren kan göra (bifoga filer, preview, URL-screenshot etc.).

**Block 5 – Beteende & säkerhet**

- `ALWAYS uses <Thinking> BEFORE providing a response`
- `REFUSAL_MESSAGE = "I'm sorry. I'm not able to assist with that."`
- `ALL DOMAIN KNOWLEDGE USED BY v0 MUST BE CITED`
- Stylingregler: `MUST USE bg-primary / text-primary-foreground`, `DOES NOT use indigo or blue unless specified`

---

## v0:s Pipeline (det som INTE läckte, men Vercel beskrivit publikt)

Enligt [Vercels blogginlägg](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent) är systemprompten bara **del 1 av 3**:

```
Steg 1: Dynamic System Prompt
  → Statisk kärna (det som läckte)
  → + Dynamisk injektion baserat på intent-detektion (embeddings + keyword)
  → Ex: om prompt rör AI SDK → injicera aktuell AI SDK-dokumentation

Steg 2: LLM Suspense (streaming-manipulation)
  → Find-and-replace på fel imports under streaming
  → Lucide-icon-substitution: "VercelLogo" → "Triangle as VercelLogo"
  → Mönstret körs inom 100ms, ingen extra modell-call

Steg 3: Autofixers (efter streaming)
  → Deterministiska fixes (saknade deps i package.json)
  → Liten fine-tuned modell: fixar JSX/TS-fel, QueryClientProvider etc.
  → Körs inom 250ms
```

**Slutsats**: Det som läckte (systemprompten) är ca 20% av "moaten". Resten är inference-infrastruktur.

---

## Skillnad: Ny chatt vs Fortsättningsprompt

v0 har en distinktion som **inte är explicit i systemprompten** men framgår av källkodsnivå-analyser:

- **Ny chatt**: systemprompten skickas i sin helhet. `project="Project Name"` tilldelas ett nytt ID. v0 konstruerar en full app-grund.
- **Fortsättning**: samma `project_id` återanvänds. v0 hämtar bara aktuella filer, skickar `<edit>` istället för fullständig komponent. Bara ändrade filer skickas.

Nyckelregel: `v0 MUST MAINTAIN the same project ID unless working on a completely different project.`

---

## Sajtmaskins nuvarande promptbyggande (kartlagt)

Din app har redan ett sofistikerat lager i `src/lib/builder/promptAssist.ts` och `promptOrchestration.ts`:

### Ny chatt (wizard/brief-flöde)

```
User input
  → orchestratePromptMessage()       # budget-beslut: direct/summarize/phase_plan
  → buildDynamicInstructionAddendum  # genererar strukturerat ##-format:
      ## Build Intent
      ## Project Context
      ## Pages & Sections
      ## Interaction & Motion
      ## Visual Identity
      ## Quality Bar
      ## Imagery
      ## Original Request
  → formatPromptForV0()              # detekterar att prompt redan är strukturerad → pass-through
  → POST /api/v0/chats/stream
```

### Fortsättningsprompt (freeform)

```
User input
  → orchestratePromptMessage()       # summarize/direct
  → formatPromptForV0()              # bygger MÅL/SEKTIONER/STIL/CONSTRAINTS-block om ostrukturerat
  → appendAttachmentPrompt()
  → POST /api/v0/chats/{chatId}/stream
```

### System-promptkonstruktion

- `resolveBuildIntentSystemPrompt()` → lägger till intent-specifik guidance (`template`, `website`, `app`)
- Re-skickas bara om system-prompten förändrats (tracked via `lastSentSystemPromptRef`)

---

## Vad sajtmaskin redan gör som matchar v0:s mönster


| v0-mönster                               | Sajtmaskins motsvarighet                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dynamic system prompt (intent-detektion) | `resolveBuildIntentSystemPrompt` + `buildDynamicInstructionAddendum`                      |
| Strukturerat MDX-block-format            | `## Build Intent`, `## Visual Identity` etc. i `buildDynamicInstructionAddendumFromBrief` |
| Budget/tokenhantering                    | `orchestratePromptMessage` med `phase_plan_build_polish` för långa prompts                |
| Lucide-icon awareness                    | Implicit via systemprompten v0 redan har                                                  |
| Re-send guard                            | `lastSentSystemPromptRef` i `useSendMessage`                                              |
| Media-katalog injection                  | `enhancePromptForV0` i `prompt-utils.ts`                                                  |


---

## Identifierade luckor (jämfört med v0:s pipeline)

1. **Ingen streaming-manipulation (LLM Suspense)**: Sajtmaskin post-processar inte genererat innehåll under streaming. v0 gör find-and-replace på fel-imports i realtid.
2. **Ingen post-generation autofix**: v0 kör en liten fine-tuned modell på genererade filer efter streaming. Sajtmaskin har CSS-autofix (nämnt i `atgardsmatris.txt`) men det är begränsat.
3. **Ingen intent-detektion för dynamisk docs-injektion**: v0 detekterar AI SDK-relaterade prompts och injicerar aktuell dokumentation. Sajtmaskin saknar motsvarighet (embeddings-plan finns i ROADMAP men ej aktiverat för detta).
4. `**<thinking>`-steget syns ej för slutanvändaren**: v0 löser detta via `<Thinking>` MDX-komponent. Din app exponerar inte reasoning-steget.

---

## Nyckellärdom för sajtmaskins promptkonstruktion

Utifrån analysen är det tydligt att v0:s "hemlighet" är kombinationen av:

- **Extremt specificerade output-format-regler** (MDX-typer med exakta syntaxregler)
- `**THINK BEFORE YOU ACT`-mönster** explicit i systemprompten
- **Deterministisk post-processing** som kompenserar för LLM-osäkerhet (Suspense + Autofixers)

Sajtmaskins `buildDynamicInstructionAddendumFromBrief` täcker punkt 1 och delvis 2, men punkt 3 är svag. Det är där v0:s "dubbelsiffriga förbättring i success rate" kommer ifrån.