# Plan: Förbättra Orchestrator & Rensa Projektet

Detta dokument beskriver en stegvis plan för att förbättra orchestrator-logiken, fixa problem, ta bort oanvänd kod, och göra systemet smartare.

---

## 🎯 ÖVERGRIPANDE MÅL

1. ✅ **Fixa timing-problem** - Pre-validering så frågor kommer INNAN generationen börjar
2. ✅ **Ta bort oanvänd kod** - Rensa projektet från gamla/ersatta filer
3. ✅ **Förbättra prompt-hantering** - Gör orchestratorn smartare, inte bara "snygga till"
4. ✅ **Förhindra felaktiga v0-anrop** - Se till att `clarify` intent aldrig skickas till v0
5. ✅ **Optimera prompt-enricher** - Ta bort onödig standardiserad text

---

## 📋 FASE 1: FIXA KRITISKA PROBLEM (Prioritet: HÖG)

### Steg 1.1: Implementera Pre-validering

**Problem**: Frågor kommer för sent, JSON med `clarify` skickas till v0, preview hänger sig.

**Lösning**: Kör Semantic Router FÖRE generationen börjar visuellt.

**Filer att ändra**:

- `app/src/components/layout/home-page.tsx` - Lägg till pre-validering i `PromptInput.handleSubmit()`
- `app/src/components/builder/chat-panel.tsx` - Lägg till pre-validering FÖRE `setLoading(true)`

**Implementation**:

```typescript
// I home-page.tsx eller prompt-input komponent
const handleSubmit = async () => {
  if (!prompt.trim() || isLoading) return;

  setLoading(true); // Visa "Analyserar din förfrågan..."

  try {
    // Pre-validering: Kör Semantic Router FÖRE navigation
    const routerResult = await fetch("/api/orchestrate", {
      method: "POST",
      body: JSON.stringify({ prompt, validateOnly: true }),
    }).then((r) => r.json());

    if (routerResult.intent === "clarify") {
      // Visa PromptWizardModal direkt, INGEN navigation
      setShowWizard(true);
      setLoading(false);
      return;
    }

    // Om OK → navigera till builder
    router.push(`/builder?prompt=${encodeURIComponent(prompt)}`);
  } catch (error) {
    // Fallback: navigera ändå
    router.push(`/builder?prompt=${encodeURIComponent(prompt)}`);
  } finally {
    setLoading(false);
  }
};
```

**Alternativ**: Skapa en separat `/api/validate-prompt` endpoint som bara kör Semantic Router.

**Tidsestimat**: 2-3 timmar

---

### Steg 1.2: Förhindra att `clarify` intent skickas till v0

**Problem**: JSON med `clarify` intent skickas ibland till v0 API.

**Lösning**: Lägg till extra guard i orchestratorn och prompt-enricher.

**Filer att ändra**:

- `app/src/lib/orchestrator-agent.ts` - Lägg till extra kontroll FÖRE v0-anrop
- `app/src/lib/prompt-enricher.ts` - Lägg till guard för `clarify` intent

**Implementation**:

```typescript
// I orchestrator-agent.ts, FÖRE v0-anrop (rad ~1220)
if (intent === "clarify") {
  console.error(
    "[Orchestrator] ⚠️ CRITICAL: clarify intent should never reach v0!"
  );
  return {
    success: false,
    message: "Internal error: clarify intent reached v0",
    intent: "clarify",
    clarifyQuestion: routerResult.clarifyQuestion,
    workflowSteps,
  };
}

// I prompt-enricher.ts (rad ~172)
// Lägg till INSTRUCTIONS endast om det INTE är clarify intent
if (routerResult?.intent !== "clarify") {
  const actionLines: string[] = ["", "INSTRUCTIONS FOR IMPLEMENTATION:"];
  // ... resten av instruktionerna
  sections.push(actionLines.join("\n"));
}
```

**Tidsestimat**: 1 timme

---

## 📋 FASE 2: RENSA OANVÄND KOD (Prioritet: MEDEL)

### Steg 2.1: Ta bort `/app/src/app/api/generate/route.ts`

**Problem**: Gammal API route som ersatts av `/api/orchestrate`.

**Åtgärd**:

1. Sök efter alla användningar: `grep -r "/api/generate" app/src`
2. Om inga användningar finns → ta bort filen
3. Om användningar finns → migrera till `/api/orchestrate`

**Filer att ändra**:

- Ta bort: `app/src/app/api/generate/route.ts`
- Uppdatera: `app/src/lib/api-client.ts` (ta bort `generateWebsite()` om oanvänd)

**Tidsestimat**: 30 minuter

---

### Steg 2.2: Ta bort `generateWebsite()` från api-client.ts

**Problem**: Funktionen finns kvar men används inte längre.

**Åtgärd**:

1. Sök efter användningar: `grep -r "generateWebsite" app/src`
2. Om oanvänd → ta bort funktionen (rad 86-222)
3. Uppdatera dokumentationen i filen

**Tidsestimat**: 15 minuter

---

### Steg 2.3: Optimera `code-parser.ts`

**Problem**: Stor fil (~600+ rader) som bara används för Sandpack fallback (används sällan).

**Åtgärd**:

1. Överväg att flytta Sandpack-logik till separat fil: `sandpack-fallback.ts`
2. Eller behåll som backup om v0 API skulle misslyckas
3. Dokumentera tydligt att detta är fallback

**Tidsestimat**: 1 timme (om flyttning)

---

### Steg 2.4: Överväg att ta bort `@codesandbox/sandpack-react`

**Problem**: Stort dependency (~2MB) som används sällan.

**Åtgärd**:

1. Kontrollera om v0 API alltid fungerar i praktiken
2. Om ja → ta bort dependency och Sandpack-fallback
3. Om nej → behåll som backup

**Tidsestimat**: 30 minuter

---

## 📋 FASE 3: FÖRBÄTTRA PROMPT-HANTERING (Prioritet: MEDEL-HÖG)

### Steg 3.1: Förbättra Semantic Router

**Nuvarande**: Klassificerar intent, men kan vara för aggressiv med `clarify`.

**Förbättringar**:

- Förbättra confidence-thresholds
- Lägg till "fast-path" för enkla prompts (hoppa över routing)
- Förbättra clarify-frågor så de är mer specifika

**Filer att ändra**:

- `app/src/lib/semantic-router.ts`

**Tidsestimat**: 2-3 timmar

---

### Steg 3.2: Förbättra Semantic Enhancer

**Nuvarande**: Förbättrar vaga prompts, men kan vara för generisk.

**Förbättringar**:

- Använd kodkontext mer aktivt när den finns
- Generera mer specifika tekniska instruktioner
- Behåll användarens ursprungliga intention bättre

**Filer att ändra**:

- `app/src/lib/semantic-enhancer.ts`

**Tidsestimat**: 2-3 timmar

---

### Steg 3.3: Optimera Prompt Enricher

**Nuvarande**: Lägger till standardiserad text även när det inte behövs.

**Förbättringar**:

- Ta bort "INSTRUCTIONS FOR IMPLEMENTATION" för enkla prompts
- Gör instruktionerna mer kontextuella baserat på intent
- Lägg till instruktioner endast när kodkontext finns

**Filer att ändra**:

- `app/src/lib/prompt-enricher.ts`

**Tidsestimat**: 1-2 timmar

---

## 📋 FASE 4: GÖRA ORCHESTRATORN SMARTARE (Prioritet: MEDEL)

### Steg 4.1: Förbättra Smart Clarify

**Nuvarande**: Genererar specifika frågor baserat på kodkontext.

**Förbättringar**:

- Använd Code Crawler-resultat mer aktivt
- Generera fler alternativ när flera matchningar finns
- Förbättra frågeformuleringen

**Filer att ändra**:

- `app/src/lib/orchestrator-agent.ts` (Smart Clarify-logik)

**Tidsestimat**: 2 timmar

---

### Steg 4.2: Lägg till Fast-Path för enkla prompts

**Nuvarande**: Alla prompts går genom Semantic Router.

**Förbättringar**:

- Detektera enkla mönster ("gör X blå", "ändra Y till Z")
- Hoppa över Semantic Router för dessa
- Sparar ~2-5 sekunder per enkel ändring

**Filer att ändra**:

- `app/src/lib/orchestrator-agent.ts`

**Tidsestimat**: 2 timmar

---

### Steg 4.3: Förbättra Auto-Repair

**Nuvarande**: Detekterar kända problem efter v0-generering.

**Förbättringar**:

- Utöka lista över kända problem
- Förbättra repair-logiken
- Lägg till fler auto-fixes

**Filer att ändra**:

- `app/src/lib/orchestrator-agent.ts` (Auto-repair-logik)

**Tidsestimat**: 2-3 timmar

---

## 📋 FASE 5: SKAPA SAKNAS KOMPONENTER (Prioritet: LÅG)

### Steg 5.1: Skapa `/app/src/components/templates/`

**Problem**: TemplateGallery, LocalTemplateCard, PreviewModal importeras men finns inte.

**Åtgärd**:

1. Skapa mappen och komponenterna
2. Eller ta bort importen om de inte behövs

**Filer att skapa**:

- `app/src/components/templates/TemplateGallery.tsx`
- `app/src/components/templates/LocalTemplateCard.tsx`
- `app/src/components/templates/PreviewModal.tsx`

**Tidsestimat**: 3-4 timmar (om skapas)

---

## 📊 PRIORITERING & TIDSESTIMAT

### Hög prioritet (Gör först):

1. **Fase 1.1: Pre-validering** - 2-3 timmar
2. **Fase 1.2: Förhindra clarify → v0** - 1 timme
3. **Fase 3.3: Optimera Prompt Enricher** - 1-2 timmar

**Totalt**: ~4-6 timmar

### Medel prioritet (Gör sedan):

4. **Fase 2.1-2.2: Rensa oanvänd kod** - 45 minuter
5. **Fase 3.1-3.2: Förbättra Router/Enhancer** - 4-6 timmar
6. **Fase 4.1-4.3: Göra orchestratorn smartare** - 6-8 timmar

**Totalt**: ~11-15 timmar

### Låg prioritet (Gör sist):

7. **Fase 2.3-2.4: Optimera Sandpack** - 1.5 timmar
8. **Fase 5.1: Skapa templates** - 3-4 timmar

**Totalt**: ~4.5-5.5 timmar

---

## 🎯 REKOMMENDERAD ORDNING

1. **Vecka 1**: Fase 1 (Kritiska problem) + Fase 3.3 (Prompt Enricher)
2. **Vecka 2**: Fase 2 (Rensa kod) + Fase 3.1-3.2 (Förbättra Router/Enhancer)
3. **Vecka 3**: Fase 4 (Göra orchestratorn smartare)
4. **Vecka 4**: Fase 5 (Saknade komponenter) + Fase 2.3-2.4 (Optimeringar)

---

## ✅ DEFINITION OF DONE

### FASE 1: FIXA KRITISKA PROBLEM ✅ KLART

- [x] **Steg 1.1**: Pre-validering implementerad (`/api/validate-prompt`, `prompt-input.tsx`, `chat-panel.tsx`)
- [x] **Steg 1.2**: Guards mot clarify → v0 (`orchestrator-agent.ts`, `prompt-enricher.ts`)
- [x] Dokumentation uppdaterad
- [x] Inga nya buggar introducerade

### FASE 2: RENSA OANVÄND KOD ✅ KLART

- [x] **Steg 2.1**: `/api/generate/route.ts` borttagen
- [x] **Steg 2.2**: `generateWebsite()` borttagen från `api-client.ts`
- [x] **Steg 2.3**: `code-parser.ts` dokumenterad som fallback
- [x] **Steg 2.4**: Sandpack behållen som fallback (dokumenterat)
- [x] Dokumentation uppdaterad

### FASE 3: FÖRBÄTTRA PROMPT-HANTERING ✅ KLART

- [x] **Steg 3.1**: Semantic Router förbättrad (fast-path, confidence thresholds, bättre clarify)
- [x] **Steg 3.2**: Semantic Enhancer förbättrad (aktiv kodkontext-användning)
- [x] **Steg 3.3**: Prompt Enricher optimerad (kontextuella instruktioner)
- [x] Dokumentation uppdaterad

### FASE 4: GÖRA ORCHESTRATORN SMARTARE ✅ KLART

- [x] **Steg 4.1**: Smart Clarify förbättrad (fler elementtyper, bättre frågor)
- [x] **Steg 4.2**: Fast-Path implementerad (i Semantic Router)
- [x] **Steg 4.3**: Auto-Repair utökad (Three.js, React imports, placeholder images)
- [x] Dokumentation uppdaterad

### FASE 5: SKAPA SAKNAS KOMPONENTER ✅ KLART

- [x] **Steg 5.1**: Template-komponenter ersatta med inline-implementationer
- [x] Dokumentation uppdaterad

---

## ✅ SAMMANFATTNING

**Alla faserna är implementerade och klara!**

- ✅ Kritiska problem fixade
- ✅ Oanvänd kod borttagen
- ✅ Prompt-hantering förbättrad
- ✅ Orchestratorn smartare
- ✅ Saknade komponenter hanterade
- ✅ Dokumentation uppdaterad

---

## 📝 ANTECKNINGAR

- **Pre-validering** är den viktigaste fixen - löser flera problem samtidigt
- **Rensa kod** bör göras tidigt för att minska komplexitet
- **Förbättra prompts** gör systemet smartare, inte bara snabbare
- **Testa noggrant** efter varje fase för att säkerställa att inget går sönder

---

**Skapad**: 2025-01-XX  
**Status**: ✅ **ALLT IMPLEMENTERAT OCH KLART**  
**Version**: Orchestrator Agent v5.0

---

## 📝 SLUTSTATUS

Alla punkter i planen är implementerade:

- ✅ **Fase 1**: Kritiska problem fixade (Pre-validering, Guards)
- ✅ **Fase 2**: Oanvänd kod borttagen (`/api/generate`, `generateWebsite()`)
- ✅ **Fase 3**: Prompt-hantering förbättrad (Router, Enhancer, Enricher)
- ✅ **Fase 4**: Orchestratorn smartare (Smart Clarify, Fast-Path, Auto-Repair)
- ✅ **Fase 5**: Template-komponenter hanterade (inline-implementationer)

**Se `ANDERINGAR_OCH_UPPTACKTER.md` för detaljerad sammanfattning av alla ändringar.**
