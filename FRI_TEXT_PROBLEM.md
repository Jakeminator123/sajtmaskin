# Problem med "Fri Text"-flödet

## 🔴 PROBLEM BESKRIVNING

När användaren skriver en vag beskrivning på startsidan och navigerar till builder:

1. ✅ **Sidan börjar genereras** - Generation startar automatiskt
2. ❌ **Får frågor EFTER att generationen börjat** - Orchestrator detekterar att prompten är vag för sent
3. ❌ **Tre standardiserade val som är inaktuella** - Clarify-frågor kommer för sent
4. ❌ **Preview-fönstret slutar ladda eller måste uppdateras** - Generation avbryts mitt i, preview hänger sig

---

## 💡 VAD ORCHESTRATOR-PIPELINEN GÖR

**Kortfattat**: Orchestrator-pipelinen är en "förbehandling" som förbättrar prompts innan de skickas till v0 API.

**Steg för steg**:

1. **Semantic Router** - Analyserar prompten och bestämmer vad användaren VERKLIGEN vill göra

   - Om prompten är vag → returnerar `clarify` intent (behöver förtydligande)
   - Om prompten är specifik → returnerar `simple_code` (direkt till v0)

2. **Code Crawler** - Hittar relevanta koddelar om det behövs (för befintliga projekt)

3. **Semantic Enhancer** - Förbättrar vaga prompts ("gör headern snyggare" → konkreta CSS-instruktioner)

4. **Prompt Enricher** - Kombinerar allt till en strukturerad prompt för v0

5. **v0 API** - Bygger faktiska sajten

**Syfte**: Underlätta för v0 genom att göra prompts tydligare, specificera kod som ska editeras, och hantera specialfall (bildgenerering, webbsökning).

---

## 🐛 VARFÖR PROBLEMET UPPSTÅR

### Timing-problem

```
1. Användaren skriver "en snygg sajt" på startsidan
   ↓
2. Navigerar till /builder?prompt=en+snygg+sajt
   ↓
3. Builder-sidan skapar projekt automatiskt
   ↓
4. ChatPanel startar AUTOMATISK generation med initialPrompt
   ↓
5. Orchestrator börjar köra Semantic Router...
   ↓
6. Semantic Router detekterar att prompten är vag → clarify intent
   ↓
7. ❌ PROBLEM: Generationen har redan börjat, men nu behöver vi stoppa den för frågor!
   ↓
8. Preview-fönstret hänger sig (generation avbruten mitt i)
```

### Rotorsaken

**ChatPanel startar generation FÖRE orchestrator hinner analysera prompten.**

I `chat-panel.tsx` (rad 461-577):

- `useEffect` triggar automatiskt när `initialPrompt` finns
- Anropar `handleGenerate()` direkt
- Orchestrator körs INNE i `handleGenerate()`, men generationen har redan börjat visuellt

**Problemet**: UI visar "genererar..." medan orchestrator fortfarande analyserar om prompten är vag eller inte.

---

## 🔧 LÖSNINGSFÖRSLAG

### Alternativ 1: Pre-validering på startsidan (BÄST) ✅ REKOMMENDERAS

**Före navigation till builder**:

1. Kör Semantic Router på startsidan (snabb check, 2-5 sek)
2. Om prompten är vag → visa PromptWizardModal direkt, INGEN navigation
3. Om prompten är OK → navigera till builder

**Fördelar**:

- ✅ Användaren får frågor INNAN generationen börjar
- ✅ Inga avbrutna generationer
- ✅ Preview hänger sig inte
- ✅ Bättre UX (ingen förvirring)

**Nackdelar**:

- ⚠️ Extra API-anrop på startsidan (men snabbt: 2-5 sek)
- ⚠️ Liten fördröjning innan navigation (men bättre än avbruten generation)

**Implementation**: Se `FORBATTRAD_PROMPT_FLODE.md` för detaljerad implementation.

---

### Alternativ 2: Delad generation (MEDEL)

**I builder**:

1. Visa "Analyserar din förfrågan..." direkt
2. Kör Semantic Router FÖRST (utan att starta v0)
3. Om `clarify` → visa frågor, INGEN generation
4. Om `simple_code` eller `needs_code_context` → starta generation

**Fördelar**:

- Ingen pre-validering behövs
- Tydligare flöde

**Nackdelar**:

- Extra steg i builder
- Kan kännas långsamt

---

### Alternativ 3: Smart Clarify i realtid (KOMPLEX)

**Under generation**:

1. Starta generation direkt
2. Kör Semantic Router parallellt
3. Om `clarify` detekteras → pausa generation, visa frågor
4. Om användaren svarar → fortsätt med förbättrad prompt

**Fördelar**:

- Snabb start
- Kan rädda generationer som redan börjat

**Nackdelar**:

- Komplex implementation
- Kan skapa förvirring

---

## 📋 REKOMMENDATION

**Alternativ 1 (Pre-validering)** är bäst eftersom:

- ✅ Användaren får feedback INNAN generationen börjar
- ✅ Inga avbrutna generationer
- ✅ Bättre UX (ingen förvirring om preview hänger sig)
- ✅ Enklare implementation (bara flytta Semantic Router-checken)

**Implementation**:

1. Lägg till en `validatePrompt()` funktion som kör Semantic Router
2. I `PromptInput.handleSubmit()` → validera FÖRE navigation
3. Om vag → visa PromptWizardModal
4. Om OK → navigera till builder

---

## 🔍 RELATERADE PROBLEM

### Preview-fönstret hänger sig

**Orsak**:

- Generation avbryts mitt i när `clarify` detekteras
- v0 API-anropet kanske redan startat men avbryts
- Preview iframe väntar på demoUrl som aldrig kommer

**Lösning**:

- Stoppa generationen TIDIGARE (pre-validering)
- Eller vänta på orchestrator-resultat FÖRE att starta v0-anrop

### Standardiserade val är inaktuella

**Orsak**:

- Clarify-frågor genereras baserat på prompten
- Men prompten kan ha ändrats eller är för vag för att generera bra alternativ

**Lösning**:

- Använd Smart Clarify (genererar specifika frågor baserat på kodkontext)
- Eller förbättra Semantic Router för att generera bättre clarify-frågor

### ❌ PROBLEM: JSON med `clarify` intent skickas till v0 API

**Beskrivning**:

När Semantic Router returnerar `clarify` intent, skickas ibland JSON-strukturen direkt till v0 API istället för att stoppa generationen:

```
USER REQUEST: Create a modern, responsive website.

{
  "mode": "clarify",
  "questions": [...],
  "reasoning": "..."
}
```

**Orsak**:

- Race condition: `ChatPanel` startar generation (`setLoading(true)`) FÖRE orchestratorn hinner analysera prompten
- Om Semantic Router misslyckas eller tar för lång tid, kan prompten skickas till v0 ändå
- `enhancedPrompt` kan innehålla JSON-strukturen från Semantic Router

**Lösning**:

- **Pre-validering** löser detta genom att köra Semantic Router FÖRE generationen börjar
- Orchestratorn HAR logik för att stoppa vid `clarify` (rad 847-887 i `orchestrator-agent.ts`), men den nås inte i tid
- Med pre-validering stoppas generationen INNAN den börjar visuellt

### ⚠️ PROBLEM: "INSTRUCTIONS FOR IMPLEMENTATION" läggs alltid till

**Beskrivning**:

`prompt-enricher.ts` lägger alltid till standardiserad text "INSTRUCTIONS FOR IMPLEMENTATION" även när det inte behövs:

```
INSTRUCTIONS FOR IMPLEMENTATION:
1. IMPLEMENT the requested changes
2. PRESERVE the overall structure and design
3. TEST that all functionality still works
```

**Orsak**:

- `prompt-enricher.ts` (rad 172-206) lägger alltid till denna text utan att kontrollera om den behövs
- Texten läggs till även för enkla prompts där den inte ger värde

**Lösning**:

- Lägg till guard i `prompt-enricher.ts` för att inte lägga till instruktioner när `routerResult?.intent === "clarify"`
- Eller gör instruktionerna mer kontextuella baserat på intent-typen

---

---

## 🔐 VAD ÄR "UNIVERSAL GATEKEEPER"?

**Universal Gatekeeper** = Orchestrator Agent (`lib/orchestrator-agent.ts`)

**Roll**: Alla prompts går genom orchestratorn som en "portvakt" som avgör vad som ska hända:

- ✅ **image_only** → Generera bild, lägg till mediabibliotek, **INGEN v0-anrop**
- ✅ **web_search_only** → Söka på nätet, returnera info, **INGEN v0-anrop**
- ✅ **clarify** → Ställ frågor, **INGEN v0-anrop**
- ✅ **chat_response** → Bara svara, **INGEN v0-anrop**
- ✅ **code_only/image_and_code/web_and_code** → Anropa v0 för faktiska kodändringar

**Varför "Universal"?**

- ALLA prompts går härigenom (både initial generation och refinement)
- En enda entry point för all prompt-hantering
- Konsistent beteende överallt

**Varför "Gatekeeper"?**

- Avgör vad som ska hända FÖRE v0-anrop
- Kan stoppa/omdirigera prompts som inte behöver v0
- Förhindrar onödiga v0-anrop (sparar pengar och tid)

**Se `FORBATTRAD_PROMPT_FLODE.md` för detaljerad beskrivning av föreslaget flöde och hur orchestrator ska "kratta lite" på prompts.**

---

**Skapad**: 2025-01-XX  
**Status**: Problem identifierat, lösning föreslagen
