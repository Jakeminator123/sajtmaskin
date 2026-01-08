# Förbättrat Prompt-flöde - Föreslaget Design

Detta dokument beskriver hur orchestrator-pipelinen BORDE fungera för att "kratta lite" på prompts och förbättra dem innan de skickas till v0 API.

---

## 🎯 SYFTE MED ORCHESTRATOR-PIPELINEN

**Huvudtanken**: Användarens input ska vara som den är, men orchestrator ska "kratta lite" för att:

1. ✅ **Specificera vad/vart saker ska ändras** - Hitta rätt kod-snippets
2. ✅ **Rättstava och formatera** - Gör prompten tydligare
3. ✅ **Ställa frågor** - Undvik missförstånd, få bättre instruktioner
4. ✅ **Hantera specialfall** - Bildgenerering, webbsökning, etc.

**VIKTIGT**: Orchestrator ska INTE ändra användarens intention, bara göra prompten mer effektiv och tydlig för v0 API.

---

## 🔐 VAD ÄR "UNIVERSAL GATEKEEPER"?

**Universal Gatekeeper** = Orchestrator Agent (`lib/orchestrator-agent.ts`)

**Roll**: Alla prompts går genom orchestratorn som en "portvakt" som avgör vad som ska hända:

- ✅ **image_only** → Generera bild, lägg till mediabibliotek, INGEN v0-anrop
- ✅ **web_search_only** → Söka på nätet, returnera info, INGEN v0-anrop
- ✅ **clarify** → Ställ frågor, INGEN v0-anrop
- ✅ **chat_response** → Bara svara, INGEN v0-anrop
- ✅ **code_only/image_and_code/web_and_code** → Anropa v0 för faktiska kodändringar

**Varför "Universal"?**

- ALLA prompts går härigenom (både initial generation och refinement)
- En enda entry point för all prompt-hantering
- Konsistent beteende överallt

**Varför "Gatekeeper"?**

- Avgör vad som ska hända FÖRE v0-anrop
- Kan stoppa/omdirigera prompts som inte behöver v0
- Förhindrar onödiga v0-anrop (sparar pengar och tid)

---

## 📊 FÖRESLAGET FLÖDE (Hur det BORDE fungera)

### FASE 1: PRE-VALIDERING (FÖRE generationen börjar visuellt)

```
Användaren skriver prompt
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 0: SNABB SEMANTIC ROUTER CHECK (2-5 sek)                     │
│  • Kör Semantic Router FÖRE att starta generationen visuellt       │
│  • Snabb analys: Är prompten vag eller specifik?                    │
│  • ROLL: Avgör om vi behöver ställa frågor FÖRST                   │
│  • ANVÄNDER: GPT-API (gpt-4o-mini) via AI SDK 6                    │
└─────────────────────────────────────────────────────────────────────┘
     ↓
    ┌─────────────────┐
    │  Är prompten vag?│
    └─────────────────┘
     ↓                    ↓
    JA                   NEJ
     ↓                    ↓
┌─────────────┐    ┌──────────────────────┐
│ STÄLL FRÅGOR│    │ FORTSÄTT TILL FASE 2 │
│ (clarify)   │    │ (starta generation)  │
└─────────────┘    └──────────────────────┘
     ↓                    ↓
Användaren svarar    (hoppa till FASE 2)
     ↓
Förbättrad prompt
     ↓
FORTSÄTT TILL FASE 2
```

**Implementation**:

- På startsidan: Kör Semantic Router FÖRE navigation
- I builder: Kör Semantic Router FÖRE `setLoading(true)`
- Om `clarify` → visa frågor, INGEN generation
- Om OK → fortsätt till FASE 2

---

### FASE 2: PROMPT-FÖRBÄTTRING (Under generationen)

```
Förbättrad/validerad prompt
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 1: SEMANTIC ROUTER (gpt-4o-mini via AI SDK 6)                │
│  • Klassificerar intent (simple_code, needs_code_context, etc.)    │
│  • Bestämmer om Code Crawler ska köras                             │
│  • ROLL: Klassificering och routing                                │
│  • ANVÄNDER: GPT-API (gpt-4o-mini) via AI SDK 6                   │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 2: CODE CRAWLER (INGEN AI - bara snabb strängmatchning)      │
│  • Hittar relevanta koddelar baserat på hints                      │
│  • Returnerar kodsnippets med radnummer                            │
│  • ROLL: Specificera VAD/VART saker ska ändras                    │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 3: SEMANTIC ENHANCER (gpt-4o-mini via AI SDK 6)              │
│  • Tar vag prompt och gör den mer specifik                         │
│  • Lägger till konkreta tekniska instruktioner                     │
│  • ROLL: Rättstava och förbättra prompten semantiskt               │
│  • ANVÄNDER: GPT-API (gpt-4o-mini) via AI SDK 6                   │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 4: PROMPT ENRICHER (INGEN AI - bara formatering)             │
│  • Kombinerar: enhanced prompt + kodkontext + bilder + webbresultat│
│  • Formaterar för v0:s förståelse                                   │
│  • ROLL: Formatera prompten så den blir tydlig för v0 API          │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 5: V0 API (Vercel)                                          │
│  • Tar emot berikad prompt                                          │
│  • Genererar/refaktorerar kod                                       │
│  • Returnerar demoUrl för preview                                   │
│  • ROLL: BYGGER faktiska sajter                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 SPECIALFALL OCH UNDANTAG

### 1. Bildgenerering (`image_only`)

**Flöde**:

```
Prompt: "generera en bild av en solnedgång"
     ↓
Semantic Router → image_only intent
     ↓
Image Generator → Genererar bild
     ↓
Sparar till Vercel Blob Storage
     ↓
Lägger till i mediabiblioteket
     ↓
RETURNERAR (ingen v0-anrop!)
```

**Varför stoppar här?**

- Användaren vill bara generera bild, inte ändra kod
- Bilden sparas i mediabiblioteket för senare användning
- Ingen kodändring behövs

---

### 2. Webbsökning (`web_search_only`)

**Flöde**:

```
Prompt: "kolla på apple.com"
     ↓
Semantic Router → web_search intent
     ↓
Web Search → Söker på nätet
     ↓
Returnerar sökresultat och sammanfattning
     ↓
RETURNERAR (ingen v0-anrop!)
```

**Varför stoppar här?**

- Användaren vill bara få information, inte ändra kod
- Information visas i chatten
- Ingen kodändring behövs

---

### 3. Kombinationer (`image_and_code`, `web_and_code`)

**Flöde**:

```
Prompt: "generera en hero-bild och lägg till den i headern"
     ↓
Semantic Router → image_and_code intent
     ↓
Image Generator → Genererar bild
     ↓
Sparar till Vercel Blob Storage
     ↓
Code Crawler → Hittar header-kod
     ↓
Semantic Enhancer → Förbättrar prompten
     ↓
Prompt Enricher → Kombinerar bild-URL + kodkontext
     ↓
v0 API → Uppdaterar kod med bilden
```

**Varför fortsätter här?**

- Användaren vill både generera bild OCH ändra kod
- Bilden genereras först, sedan används i kodändringen

---

## 🎯 TYDLIGA REGLER FÖR ORCHESTRATOR

### 1. Användarens input är helig

- ✅ Behåll användarens ursprungliga intention
- ✅ Ändra INTE vad användaren vill göra
- ✅ Bara göra prompten mer specifik och tydlig

### 2. "Kratta lite" betyder:

- ✅ Hitta rätt kod-snippets (Code Crawler)
- ✅ Rättstava och formatera (Semantic Enhancer)
- ✅ Ställa frågor för att undvika missförstånd (Semantic Router → clarify)
- ✅ Formatera för v0:s förståelse (Prompt Enricher)

### 3. INTE "kratta lite" betyder:

- ❌ Ändra användarens intention
- ❌ Lägga till saker användaren inte bad om
- ❌ Ta bort viktig information från prompten

---

## 📋 FÖRESLAGET IMPLEMENTERING-FLÖDE

### På startsidan (PromptInput)

```typescript
const handleSubmit = async () => {
  if (!prompt.trim() || isLoading) return;

  // FASE 1: Pre-validering FÖRE navigation
  setLoading(true); // Visa "Analyserar din förfrågan..."

  try {
    // Snabb Semantic Router check
    const routerResult = await routePrompt(prompt, false);

    if (routerResult.intent === "clarify") {
      // Visa PromptWizardModal direkt
      setShowWizard(true);
      setLoading(false);
      return; // INGEN navigation ännu
    }

    // Om OK → navigera till builder
    router.push(`/builder?prompt=${encodeURIComponent(prompt)}`);
  } catch (error) {
    // Fallback: navigera ändå (orchestrator hanterar det senare)
    router.push(`/builder?prompt=${encodeURIComponent(prompt)}`);
  } finally {
    setLoading(false);
  }
};
```

### I builder (ChatPanel)

```typescript
const handleGenerate = async (prompt: string, type?: string) => {
  // FASE 1: Pre-validering FÖRE setLoading(true)
  try {
    const routerResult = await routePrompt(prompt, !!existingCode);

    if (routerResult.intent === "clarify") {
      // Visa frågor direkt, INGEN generation
      addMessage(
        "assistant",
        routerResult.clarifyQuestion || "Kan du förtydliga?"
      );
      setClarifyOptions(routerResult.clarifyOptions || []);
      return; // STOPPA här, starta INTE generation
    }

    // Om OK → fortsätt med generation
    setLoading(true); // Nu är det säkert att starta
    // ... resten av generationen
  } catch (error) {
    // Fallback: starta generation ändå
    setLoading(true);
    // ... resten av generationen
  }
};
```

---

## 🔍 PROBLEM SOM LÖSES MED DETTA FLÖDE

### Problem 1: Frågor kommer för sent

**Lösning**: Pre-validering FÖRE generationen börjar visuellt

### Problem 2: Preview hänger sig

**Lösning**: Inga avbrutna generationer → preview väntar aldrig på demoUrl som aldrig kommer

### Problem 3: Standardiserade val är inaktuella

**Lösning**: Frågor genereras FÖRE generationen, baserat på faktisk prompt

### Problem 4: Race condition

**Lösning**: Orchestrator-analys FÖRE `setLoading(true)`

### Problem 5: JSON med `clarify` intent skickas till v0 API

**Beskrivning**: När Semantic Router returnerar `clarify` intent, skickas ibland JSON-strukturen direkt till v0 API istället för att stoppa generationen.

**Lösning**: Pre-validering förhindrar detta genom att:

- Kör Semantic Router FÖRE generationen börjar
- Stoppar om `clarify` detekteras
- Förhindrar att prompten någonsin når v0 när `clarify` intent finns

**Teknisk detalj**: Orchestratorn HAR logik för att stoppa vid `clarify` (rad 847-887 i `orchestrator-agent.ts`), men den nås inte i tid på grund av race condition. Pre-validering löser detta.

---

## 💡 SAMMANFATTNING

**Universal Gatekeeper** = Orchestrator Agent som alla prompts går genom

**Föreslaget flöde**:

1. **Pre-validering** → Kör Semantic Router FÖRE generationen börjar
2. **Prompt-förbättring** → Code Crawler → Semantic Enhancer → Prompt Enricher
3. **Specialfall** → Bildgenerering, webbsökning stoppar INNAN v0-anrop
4. **v0 API** → Får berikad prompt och bygger sajten

**Tydliga regler**:

- Användarens input är helig
- "Kratta lite" = förbättra, inte ändra intention
- Ställ frågor FÖRE generationen börjar

---

**Skapad**: 2025-01-XX  
**Status**: Föreslaget design för förbättrat flöde
