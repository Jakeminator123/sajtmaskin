# AI SDK 6 & Universal Gatekeeper - Förklaring

Detta dokument förklarar vad AI SDK 6 är, varför den används, och varför termen "Universal Gatekeeper" finns.

---

## 🤔 VAD ÄR AI SDK 6?

**AI SDK 6** = Vercel AI SDK version 6 (`"ai": "^6.0.7"` i package.json)

**Det är INTE ett nytt API** - det är ett **wrapper/abstraction layer** över OpenAI API.

### Hur det fungerar:

```
AI SDK 6 (Vercel)
     ↓
@ai-sdk/openai (adapter)
     ↓
OpenAI API (samma API som du skulle använda direkt)
```

**Under huven**: AI SDK 6 använder fortfarande OpenAI API, men ger dig:

- ✅ Bättre streaming (`streamText`)
- ✅ Strukturerad output (`generateText`)
- ✅ Tool calling
- ✅ Enhetlig API för olika modeller

---

## ❓ VARFÖR ANVÄNDS AI SDK 6 ISTÄLLET FÖR OPENAI SDK DIREKT?

### Nuvarande användning i projektet:

**AI SDK 6 används för**:

- ✅ Semantic Router (`semantic-router.ts`) - `generateText` från `ai` package
- ✅ Semantic Enhancer (`semantic-enhancer.ts`) - `generateText` från `ai` package

**OpenAI SDK används direkt för**:

- ✅ Bildgenerering (`orchestrator-agent.ts`) - `new OpenAI().images.generate()`
- ✅ Web Search (`orchestrator-agent.ts`) - `new OpenAI().responses.create()`

### Varför denna mix?

**AI SDK 6 för Semantic Router/Enhancer**:

- ✅ Bättre streaming (kan visa "thinking" i realtid)
- ✅ Strukturerad output (JSON parsing är enklare)
- ✅ Enhetlig API (samma kod för olika modeller)

**OpenAI SDK direkt för bild/web search**:

- ✅ Native tools (`web_search` tool finns bara i OpenAI SDK)
- ✅ Bildgenerering (`images.generate()`) är enklare direkt
- ✅ Mindre abstraktion = mer kontroll

---

## 🔐 VARFÖR FINNS ORDET "UNIVERSAL GATEKEEPER"?

**"Universal Gatekeeper"** är bara ett **beskrivande namn** för Orchestrator Agent.

**Varför detta namn?**

- **"Universal"** = ALLA prompts går härigenom (både generation och refinement)
- **"Gatekeeper"** = Avgör vad som ska hända FÖRE v0-anrop (kan stoppa/omdirigera)

**Det är INTE en teknisk term** - det är bara ett beskrivande namn för att förklara orchestratorns roll.

**Du kan kalla det vad du vill**:

- Orchestrator Agent
- Prompt Processor
- Pre-v0 Handler
- Eller bara "orchestratorn"

---

## 💡 VAD SKA ANVÄNDAS FÖR "FÖRPROMPTBEHANDLING"?

### Nuvarande setup (rätt sätt):

**Alla "förpromptbehandlingar" använder GPT-API (OpenAI)**:

1. **Semantic Router** → `gpt-4o-mini` via AI SDK 6 (`generateText`)
2. **Semantic Enhancer** → `gpt-4o-mini` via AI SDK 6 (`generateText`)
3. **Code Crawler** → INGEN AI (bara strängmatchning)
4. **Prompt Enricher** → INGEN AI (bara formatering)
5. **Bildgenerering** → `gpt-image-1`/`dall-e-3` via OpenAI SDK direkt
6. **Web Search** → `gpt-4o-mini` + `web_search` tool via OpenAI SDK direkt

**v0 API anropas ENDAST** efter att prompten är förbättrad.

---

## 🚨 VIKTIGT: v0 API ÄR HELT SEPARAT FRÅN AI SDK 6

### v0 API använder sin egen SDK (`v0-sdk`)

**v0 API är INTE samma sak som AI SDK 6!**

```
v0 API (Vercel Platform API)
     ↓
v0-sdk (separat SDK, "v0-sdk": "^0.15.3")
     ↓
Vercel's v0 Platform API (hostad kodgenerering)
```

**v0 API**:

- ✅ Använder **`v0-sdk`** (separat SDK från AI SDK 6)
- ✅ Använder **`V0_API_KEY`** (inte `OPENAI_API_KEY`)
- ✅ Genererar faktisk kod (React/Next.js komponenter)
- ✅ Returnerar `demoUrl`, `chatId`, `files`
- ✅ Har inget med AI SDK 6 att göra

**AI SDK 6**:

- ✅ Använder **`ai`** package (`"ai": "^6.0.7"`)
- ✅ Använder **`OPENAI_API_KEY`** (via OpenAI API)
- ✅ Används för Semantic Router/Enhancer (text-generering)
- ✅ Wrapper över OpenAI API
- ✅ Har inget med v0 API att göra

### Tre separata SDK:er i projektet:

1. **AI SDK 6** (`ai`) → Semantic Router/Enhancer → `OPENAI_API_KEY`
2. **v0 SDK** (`v0-sdk`) → Kodgenerering → `V0_API_KEY`
3. **OpenAI SDK** (`openai`) → Bildgenerering/Web Search → `OPENAI_API_KEY`

**Sammanfattning**: AI SDK 6 används INTE för v0 API. v0 API har sin egen SDK (`v0-sdk`) och sin egen API-nyckel (`V0_API_KEY`).

---

## 🎯 SAMMANFATTNING

### AI SDK 6 vs OpenAI SDK vs v0 SDK

| Aspekt            | AI SDK 6                       | OpenAI SDK                  | v0 SDK                 |
| ----------------- | ------------------------------ | --------------------------- | ---------------------- |
| **Package**       | `"ai": "^6.0.7"`               | `"openai": "^6.9.1"`        | `"v0-sdk": "^0.15.3"`  |
| **Vad är det?**   | Wrapper över OpenAI API        | Direkt OpenAI API           | Vercel v0 Platform API |
| **API-nyckel**    | `OPENAI_API_KEY`               | `OPENAI_API_KEY`            | `V0_API_KEY`           |
| **Använder GPT?** | ✅ Ja (via OpenAI API)         | ✅ Ja (direkt)              | ❌ Nej (Vercel's API)  |
| **Fördelar**      | Streaming, strukturerad output | Full kontroll, native tools | Kodgenerering, demoUrl |
| **När använda?**  | Semantic Router, Enhancer      | Bildgenerering, Web Search  | Kodgenerering (v0 API) |

### "Universal Gatekeeper"

- **Är bara ett beskrivande namn** för Orchestrator Agent
- **Inte en teknisk term** - du kan kalla det vad du vill
- **Beskriver rollen**: Alla prompts går härigenom, avgör vad som ska hända

### Alla "förpromptbehandlingar" använder GPT-API

- ✅ Semantic Router → GPT-4o-mini (via AI SDK 6)
- ✅ Semantic Enhancer → GPT-4o-mini (via AI SDK 6)
- ✅ Bildgenerering → GPT-image-1/DALL-E-3 (via OpenAI SDK)
- ✅ Web Search → GPT-4o-mini (via OpenAI SDK)

**v0 API anropas ENDAST** efter att prompten är förbättrad och klar.

---

## 🔧 KAN MAN ANVÄNDA OPENAI SDK DIREKT ISTÄLLET?

**Ja, absolut!** Du kan byta ut AI SDK 6 mot OpenAI SDK direkt:

**Istället för**:

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const result = await generateText({
  model: openai("gpt-4o-mini"),
  prompt: "...",
});
```

**Kan du använda**:

```typescript
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const result = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "..." }],
});
```

**Fördelar med OpenAI SDK direkt**:

- ✅ Enklare (en API istället för två)
- ✅ Full kontroll
- ✅ Mindre dependencies

**Nackdelar**:

- ⚠️ Måste hantera streaming själv
- ⚠️ Måste hantera JSON parsing själv
- ⚠️ Måste hantera errors själv

**Rekommendation**: Behåll AI SDK 6 för Semantic Router/Enhancer (ger bättre streaming och strukturerad output), men använd OpenAI SDK direkt för bild/web search (som redan görs).

---

## ❓ VARFÖR BLANDA IN AI SDK 6? ÄR DEN ANVÄNDBAR FÖR v0 API?

### Kort svar: **NEJ, AI SDK 6 är INTE användbar för v0 API**

**v0 API**:

- ✅ Är ett **helt separat API** från Vercel
- ✅ Använder sin egen SDK (`v0-sdk`)
- ✅ Har inget med AI SDK 6 att göra
- ✅ Genererar kod server-side på Vercel's servrar
- ✅ Returnerar färdig kod + demoUrl

**AI SDK 6**:

- ✅ Är en wrapper över **OpenAI API**
- ✅ Används för **text-generering** (Semantic Router/Enhancer)
- ✅ Har inget med v0 API att göra
- ✅ Använder `OPENAI_API_KEY` (inte `V0_API_KEY`)

### Varför används AI SDK 6 i projektet?

**AI SDK 6 används FÖRE v0 API-anropet** för att:

1. **Semantic Router** → Klassificera användarens intent (behöver v0? bild? web search?)
2. **Semantic Enhancer** → Förbättra vaga prompts innan de skickas till v0

**Men v0 API själv använder INTE AI SDK 6** - den använder `v0-sdk`.

### Är AI SDK 6 användbar för v0 API?

**NEJ** - v0 API är ett helt separat API som:

- Har sin egen SDK (`v0-sdk`)
- Har sin egen API-nyckel (`V0_API_KEY`)
- Genererar kod på Vercel's servrar (inte lokalt)
- Returnerar färdig kod + demoUrl

**AI SDK 6 är bara användbar för "förpromptbehandling"** (Semantic Router/Enhancer) som använder OpenAI API direkt.

### Sammanfattning

- ✅ **AI SDK 6** → Används för Semantic Router/Enhancer (text-generering via OpenAI)
- ✅ **v0 SDK** → Används för kodgenerering (v0 Platform API)
- ✅ **OpenAI SDK** → Används för bildgenerering/web search (direkt OpenAI API)

**Alla tre är separata SDK:er med olika syften!**

---

**Skapad**: 2025-01-XX  
**Status**: Förklaring av AI SDK 6 och Universal Gatekeeper
