# Plan 05 – AC-schema completion

Prioritet: **Hög**
Uppskattad insats: ~3–5 timmar

Baseras på `LLM/AC-schema.txt`. Varje AC-item validerat mot kodbasen 2026-03-02.

---

## Sammanfattning

| # | AC-item | Status | Validering |
|---|---------|--------|------------|
| 1 | Start/kategori: inga model-parametrar | **DONE** | Verifierat i `page.tsx` och `category/[type]/page.tsx` |
| 2 | Builder header: enda stället för model + assist | **DONE** | Bara `BuilderHeader.tsx` har model/assist UI |
| 3 | Förbättra: /api/ai/chat eller /api/ai/brief | **DONE** | `usePromptAssist.ts` anropar båda beroende på deep |
| 4 | Skicka: /api/v0/chats/stream | **DONE** | `useCreateChat.ts` och `useSendMessage.ts` |
| 5 | Provider=off: inga /api/ai/*-anrop | **DONE** | "off" i PROMPT_ASSIST_MODEL_OPTIONS, hook short-circuits |
| 6 | Endast server-env: API-nycklar | **DONE** | Inga AI-nycklar i client-side kod |
| 7a | Tydlig feltext: AI Gateway nyckel | **DONE** | Explicit felmeddelande + setup-text |
| 7b | Tydlig feltext: v0 Model API nyckel | **DONE** | normalizeV0Error bevarar v0-specifik text + setup-hint |
| 8 | UI visar aktiv provider + modell + deep | **DONE** | Tooltip på model-knapp + Wand2-ikon för deep |
| 9 | Debug visar faktisk provider/model | **DONE** | buildModelInfoSteps inkluderar provider/assist/deep |
| 10 | Ingen dold fallback utan info | **DONE** | Toast vid brief→shallow, guardrail, warnLog vid model fallback |

**Done: 11/11** | **Partial: 0/11** | **Not done: 0/11**

---

## Items att åtgärda

### AC-5: Provider=off

**Problem:** Användaren kan inte stänga av prompt assist.

**Filer:**
- `src/lib/builder/defaults.ts` – `PROMPT_ASSIST_MODEL_OPTIONS`
- `src/lib/hooks/usePromptAssist.ts` – logik för preprocessing
- `src/components/builder/BuilderHeader.tsx` – dropdown UI

**Uppgifter:**
- [x] Lägg till `{ value: "off", label: "Av – skicka direkt", group: "disabled" }` i `PROMPT_ASSIST_MODEL_OPTIONS`
- [x] I `usePromptAssist.ts`: om modell === "off", returnera original prompt utan API-anrop
- [x] I `BuilderHeader.tsx`: visa "off" i dropdown med separator
- [x] Verifiera: när off är valt, görs inga fetch-anrop till `/api/ai/*`

---

### AC-7b: Tydligare v0-feltext

**Problem:** `normalizeV0Error` mappar "api key" till generisk text.

**Filer:**
- `src/app/api/v0/chats/stream/route.ts` – `normalizeV0Error` funktion
- `src/app/api/v0/chats/[chatId]/stream/route.ts` – samma mönster

**Uppgifter:**
- [x] Uppdatera `normalizeV0Error`: behåll specifik text för v0 key errors
- [x] Returnera `setup: "Kontrollera V0_API_KEY i miljövariabler"` i felsvaret
- [ ] Testa med saknad V0_API_KEY

---

### AC-8: UI visar provider + modell + deep

**Problem:** Bara model tier (ex "Max Fast") visas. Provider och deep-status inte synliga.

**Filer:**
- `src/components/builder/BuilderHeader.tsx` – model button och assist dropdown
- `src/lib/hooks/v0-chat/helpers.ts` – `buildModelInfoSteps`

**Uppgifter:**
- [x] Visa aktiv prompt-assist-provider i header (t.ex. "Gateway: gpt-5.2" eller "v0: v0-1.5-md" eller "Av")
- [x] Visa deep-brief-status som indikator (ikon eller badge) när deep är aktivt
- [x] Alternativ: compact tooltip på model-knappen som visar fullständig info
- [x] Uppdatera `buildModelInfoSteps` att inkludera provider

---

### AC-9: Debug visar provider/model

**Problem:** Debug visar model tier men inte vilken provider som faktiskt anropades.

**Filer:**
- `src/lib/hooks/v0-chat/helpers.ts` – `buildModelInfoSteps`
- `src/components/builder/BuilderHeader.tsx` – debug toggle

**Uppgifter:**
- [x] Lägg till `Provider: gateway` / `Provider: v0` / `Provider: off` i model info steps
- [x] Lägg till `Assist model: gpt-5.2` / `v0-1.5-md` / `off` i model info
- [x] Visa i debug-panel eller som utökad tooltip

---

### AC-10: Ingen dold fallback utan info

**Problem:** Tre dolda fallbacks identifierade.

**Fallback 1: Brief → shallow**
- Fil: `src/lib/hooks/usePromptAssist.ts` (rad ~305–309)
- Problem: Om deep brief misslyckas, faller tillbaka till shallow utan att informera användaren
- [x] Visa toast: "Deep brief misslyckades, använde enkel förbättring istället"

**Fallback 2: Model selection fallback**
- Fil: `src/lib/v0/modelSelection.ts` (rad ~23–33)
- Problem: Om begärd modell är ogiltig, faller tillbaka till `v0-max-fast` tyst
- [x] Logga och visa info om fallback skedde (t.ex. i debug-panel)

**Fallback 3: Guardrails returnerar original**
- Fil: `src/lib/hooks/usePromptAssist.ts` (rad ~131–189)
- Problem: Om guardrails misslyckas, returneras originalprompten utan info
- [x] Visa info om att prompten skickades oförändrad (t.ex. diskret badge)

---

## Uppdatera AC-schema.txt efter completion

- [x] Bocka av alla genomförda items i `LLM/AC-schema.txt`
- [x] Lägg till datum för varje avbockat item
- [x] Ta bort eventuella items som inte längre är relevanta
