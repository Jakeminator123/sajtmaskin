# Orchestrator Pipeline - Översikt

Detta dokument beskriver den "förbehandlings"-pipeline du har skapat för att underlätta för v0 API genom att förbättra prompts innan de skickas till v0.

---

## 🎯 SYFTE

Underlätta för v0 API genom att:

- ✅ Fixa felstavningar och göra prompts tydligare
- ✅ Specificera trolig kod som ska editeras
- ✅ Kolla upp filer i projektet
- ✅ Generera bilder till mediabiblioteket (utan att ändra kod)
- ✅ Söka på nätet för inspiration/information

---

## 📊 PIPELINE-FLÖDE

```
Användarprompt
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 1: SEMANTIC ROUTER (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY)   │
│  • Klassificerar intent (simple_code, needs_code_context, etc.)    │
│  • Bestämmer om Code Crawler ska köras                             │
│  • ROLL: Bara klassificering, förbättrar INTE prompten             │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 2: CODE CRAWLER (INGEN AI - bara snabb strängmatchning)      │
│  • Hittar relevanta koddelar baserat på hints                      │
│  • Returnerar kodsnippets med radnummer                            │
│  • ROLL: Bara hitta kod, föreslår INTE ändringar                   │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 3: SEMANTIC ENHANCER (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY)│
│  • Tar vag prompt ("gör headern snyggare") och förbättrar den      │
│  • Lägger till konkreta tekniska instruktioner                     │
│  • ROLL: Semantisk prompt-förbättring                               │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 4: PROMPT ENRICHER (INGEN AI - bara formatering)             │
│  • Kombinerar: enhanced prompt + kodkontext + bilder + webbresultat│
│  • Formaterar för v0:s förståelse                                   │
│  • ROLL: Kombinera allt till slutlig prompt                        │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 5: V0 API (v0-sdk, V0_API_KEY)                              │
│  • Tar emot berikad prompt                                          │
│  • Genererar/refaktorerar kod                                       │
│  • Returnerar demoUrl för preview                                   │
│  • ROLL: ENDA komponenten som BYGGER sajter!                       │
│  • VIKTIGT: v0 API är HELT SEPARAT från AI SDK 6                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 MODULER OCH SKRIPT

### 1. **Orchestrator Agent** (`lib/orchestrator-agent.ts`)

**Roll**: Huvudkoordinator som styr hela flödet

**Ansvar**:

- Koordinerar alla steg i pipelinen
- Hanterar specialfall (bildgenerering, webbsökning)
- Bestämmer när varje modul ska köras
- Hanterar bildgenerering (OpenAI SDK, gpt-image-1/dall-e-3, OPENAI_API_KEY) → sparar till mediabibliotek
- Hanterar webbsökning (OpenAI SDK, Responses API med web_search tool, OPENAI_API_KEY)
- Anropar v0 API för kodgenerering (v0-sdk, V0_API_KEY)

**Använder AI**: ❌ Nej (delegerar till andra moduler)

---

### 2. **Semantic Router** (`lib/semantic-router.ts`)

**Roll**: Klassificerar användarens intent

**Ansvar**:

- Analyserar prompten semantiskt
- Bestämmer vad användaren VERKLIGEN vill göra
- Klassificerar intent: `simple_code`, `needs_code_context`, `web_search`, `image_gen`, `web_and_code`, `image_and_code`, `clarify`, `chat_response`
- Extraherar hints för Code Crawler
- Bestämmer om Code Crawler ska köras

**Använder AI**: ✅ Ja (gpt-4o-mini via AI SDK 6, OPENAI_API_KEY)

**Output**: `RouterResult` med intent, confidence, hints, etc.

---

### 3. **Code Crawler** (`lib/code-crawler.ts`)

**Roll**: Hittar relevanta koddelar i projektet

**Ansvar**:

- Söker igenom projektfiler baserat på hints
- Hittar relevanta kodsektioner med strängmatchning
- Returnerar kodsnippets med radnummer
- Analyserar projektstruktur (komponenter, routing)

**Använder AI**: ❌ Nej (bara snabb strängmatchning - ~100ms)

**Output**: `CodeContext` med relevanta filer, struktur, routing-info

**VIKTIGT**: Crawler är för ENRICHMENT, inte validation. Om inget hittas ska v0 fortfarande anropas.

---

### 4. **Semantic Enhancer** (`lib/semantic-enhancer.ts`)

**Roll**: Förbättrar prompten semantiskt

**Ansvar**:

- Tar en vag prompt ("gör headern snyggare")
- Gör den mer specifik och teknisk
- Lägger till konkreta instruktioner (pixelvärden, färger, CSS-egenskaper)
- Använder kodkontext för att göra förbättringar mer relevanta

**Använder AI**: ✅ Ja (gpt-4o-mini via AI SDK 6, OPENAI_API_KEY)

**Exempel**:

- Input: "gör headern snyggare"
- Output: "Förbättra headerns design: lägg till subtil box-shadow, öka padding till 16px 24px, använd gradient bakgrund (från #1a1a2e till #16213e), animera nav-länkar med smooth hover transition"

**Output**: `EnhancementResult` med förbättrad prompt

---

### 5. **Prompt Enricher** (`lib/prompt-enricher.ts`)

**Roll**: Kombinerar allt till slutlig prompt för v0

**Ansvar**:

- Kombinerar: enhanced prompt + kodkontext + bilder + webbresultat
- Formaterar allt i en strukturerad prompt som v0 kan förstå
- Lägger till instruktioner baserat på intent
- Organiserar information i tydliga sektioner

**Använder AI**: ❌ Nej (bara formatering och kombination)

**Output**: En komplett, strukturerad prompt-sträng för v0

---

### 6. **Web Search** (i `orchestrator-agent.ts`)

**Roll**: Söker på nätet för information/inspiration

**Ansvar**:

- Använder OpenAI Responses API med `web_search` tool
- Söker efter information om webbplatser, designtrender, etc.
- Returnerar sökresultat med länkar och snippets
- Kan användas för att inspirera kodändringar

**Använder AI**: ✅ Ja (OpenAI SDK, gpt-4o-mini + Responses API web_search tool, OPENAI_API_KEY)

**Trigger**: Intent `web_search` eller `web_and_code`

**Output**: `webSearchResults` array med länkar och snippets

---

### 7. **Image Generator** (i `orchestrator-agent.ts`)

**Roll**: Genererar bilder till mediabiblioteket (utan att ändra kod)

**Ansvar**:

- Genererar bilder via OpenAI Images API (gpt-image-1 eller dall-e-3)
- Sparar bilder till Vercel Blob Storage
- Returnerar publika URLs för bilderna
- Kan användas för att lägga till bilder i sajten (om `image_and_code`)

**Använder AI**: ✅ Ja (OpenAI SDK, gpt-image-1 eller dall-e-3, OPENAI_API_KEY)

**Trigger**: Intent `image_gen` eller `image_and_code`

**Output**: `generatedImages` array med URLs och prompts

**VIKTIGT**: Om `image_only` → returnerar bara bilder, anropar INTE v0. Om `image_and_code` → genererar bilder OCH uppdaterar kod.

---

## ⚠️ VIKTIGT: CLARIFY INTENT SKA ALDRIG SKICKAS TILL v0

**Problem**: När Semantic Router returnerar `clarify` intent, skickas ibland JSON-strukturen direkt till v0 API istället för att stoppa generationen.

**Orsak**: Race condition där `ChatPanel` startar generation (`setLoading(true)`) FÖRE orchestratorn hinner analysera prompten.

**Lösning**: Pre-validering (se `FORBATTRAD_PROMPT_FLODE.md`) förhindrar detta genom att köra Semantic Router FÖRE generationen börjar.

**Teknisk detalj**: Orchestratorn HAR logik för att stoppa vid `clarify` (rad 847-887 i `orchestrator-agent.ts`), men den nås inte i tid. Pre-validering löser detta.

---

## 📋 INTENT-TYPER

| Intent               | Beskrivning                       | Anropar v0? | Använder Code Crawler?    |
| -------------------- | --------------------------------- | ----------- | ------------------------- |
| `simple_code`        | Enkla kodändringar                | ✅ Ja       | ❌ Nej                    |
| `needs_code_context` | Ändringar som kräver kodanalys    | ✅ Ja       | ✅ Ja                     |
| `web_search`         | Bara söka/researcha               | ❌ Nej      | ❌ Nej                    |
| `image_gen`          | Bara generera bilder              | ❌ Nej      | ❌ Nej                    |
| `web_and_code`       | Söka OCH uppdatera kod            | ✅ Ja       | ⚠️ Kanske                 |
| `image_and_code`     | Generera bilder OCH uppdatera kod | ✅ Ja       | ⚠️ Kanske                 |
| `clarify`            | Behöver förtydligande             | ❌ Nej      | ⚠️ Kanske (Smart Clarify) |
| `chat_response`      | Bara svara, ingen action          | ❌ Nej      | ❌ Nej                    |

---

## 🔄 SPECIALFALL

### Smart Clarify

När intent är `clarify` OCH Code Crawler hittar flera matchande element:

- Genererar en specifik fråga som listar alla alternativ
- Användaren kan välja vilket element de menar
- Använder AI för att generera naturlig fråga

### Fast-Path

För enkla prompts kan Semantic Router hoppas över:

- Direkt till v0 utan routing
- Sparar ~2-5 sekunder för enkla ändringar
- Trigger: Enkla mönster som "gör X blå", "ändra Y till Z"

### Auto-Repair

Efter v0-generering:

- Detekterar kända problem (t.ex. felaktiga Three.js-imports)
- Kör automatisk "repair"-refinement
- Fixar preview-problem automatiskt

---

## 💡 SAMMANFATTNING

**Moduler som använder AI**:

1. ✅ Semantic Router (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY) - Klassificerar intent
2. ✅ Semantic Enhancer (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY) - Förbättrar prompten
3. ✅ Web Search (OpenAI SDK, gpt-4o-mini + Responses API, OPENAI_API_KEY) - Söker på nätet
4. ✅ Image Generator (OpenAI SDK, gpt-image-1/dall-e-3, OPENAI_API_KEY) - Genererar bilder
5. ✅ Smart Clarify (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY) - Genererar specifika frågor

**Moduler som INTE använder AI**:

1. ❌ Code Crawler - Bara strängmatchning (~100ms)
2. ❌ Prompt Enricher - Bara formatering och kombination
3. ❌ Orchestrator Agent - Bara koordinering

**Vad som BYGGER sajter**:

- **ENDAST v0 API** (v0-sdk, V0_API_KEY) bygger faktiska sajter
- Alla andra moduler berikar bara prompten
- **VIKTIGT**: v0 API är HELT SEPARAT från AI SDK 6 - se `AI_SDK_6_FORKLARING.md`

---

## 📁 FILSTRUKTUR

```
app/src/lib/
├── orchestrator-agent.ts    # Huvudkoordinator
├── semantic-router.ts       # Intent-klassificering (AI)
├── code-crawler.ts         # Kod-sökning (ingen AI)
├── semantic-enhancer.ts    # Prompt-förbättring (AI)
└── prompt-enricher.ts      # Prompt-kombination (ingen AI)
```

---

**Skapad**: 2025-01-XX  
**Senast uppdaterad**: 2025-01-XX
