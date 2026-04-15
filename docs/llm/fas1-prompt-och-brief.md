# Fas 1 — Prompt och Brief (pedagogisk genomgång)

Syfte: förstå vad som faktiskt händer från knapptryck till att LLM-streamen
startar. Skrivet för att reda ut vanliga förväxlingar.

---

## Ordlista — vanliga ord i Fas 1

| Ord | Vad det betyder i Sajtmaskin | Förväxlingsrisk |
|-----|------------------------------|-----------------|
| **Prompt** | Rå text som användaren skriver i inputfältet | — |
| **Deep Brief** | LLM-genererat strukturerat objekt (sidor, färger, stil, CTA, målgrupp, etc.) som skapas *från* prompten | Förväxlas med "rewrite" eller "improve" — men briefen ändrar inte prompten, den skapar ett separat dataunderlag |
| **Server Auto-Brief** | Samma Deep Brief men genererad av servern som fallback om klienten inte skickade en | Förväxlas med "dubbel brief" — det är inte ett nytt koncept, bara en reservväg |
| **Prompt Rewrite** | "Förbättra"-knappen — en LLM skriver om prompten till bättre svenska/engelska. Resultatet syns *i inputfältet*. Ingen brief skapas. | Förväxlas med Deep Brief — men rewrite ändrar text, brief skapar struktur |
| **Prompt Polish** | "Skriv om"-knappen — lättare copy-edit av prompten. Billigare modell. Resultatet syns *i inputfältet*. | Förväxlas med rewrite — skillnaden är depth |
| **formatPrompt()** | Mekanisk wrapper som lägger till MÅL / TILLGÄNGLIGHET-rubriker runt prompten. Ingen LLM involverad. | Förväxlas med rewrite/polish — men detta är ren strängmanipulation |
| **Prompt Orchestration** | Server-side budget/trunkering/strategi. Bestämmer om prompten är "direct", "phase_plan_build_refine" eller "preserved". | Förväxlas med brief — men orchestration handlar om *budget*, inte *berikande* |
| **Build Intent** | `"website"`, `"app"` eller `"template"`. Klassificerar *vad* användaren vill bygga. | Förväxlas med Build Profile — intent = typ av sak, profile = vilken modell |
| **Build Profile / Model Tier** | `fast`, `pro`, `max`, `codex`, `anthropic`. Vilken LLM som kör codegen. | Förväxlas med Assist Model — detta styr *kodgenereringen*, inte briefen |
| **Assist Model** | Vilken LLM som kör brief/rewrite/polish. Separat val i UI. | Förväxlas med Build Profile — dessa är *två olika modellval* |
| **Scaffold** | Startpunkt/mall för projektstrukturen (landing-page, blog, dashboard, etc.) | Förväxlas med template — scaffold styr genereringens ramverk, template är galleri-produkter |
| **Spec File** | (`sajtmaskin.spec.json`) — ett äldre/parallellt sätt att ge strukturerad input till codegen. Brief konverteras till spec via `briefToSpec()`. | Spec-first är idag `active: false` — briefen har tagit den rollen |
| **`pendingBriefRef`** | React ref som håller brief-objektet mellan brief-generering och chat-skapande | — |
| **`meta.brief`** | Briefen som skickas till servern i SSE-anropets metadata | — |
| **`customInstructions`** | Fältet för användarens egna extra instruktioner (+ ev. palette/spec-suffix) | Briefen läggs INTE i customInstructions längre — den skickas separat via meta.brief |

---

## Vad händer steg för steg (init = ny chatt)

### Steg 1 — Användaren skriver och klickar skicka

```
Användaren har skrivit: "Skapa en hemsida för min restaurang Gustavs Krog
med meny, boka bord och om oss"

Inställningar i UI:
├── Byggmodell: pro (gpt-5.3-codex)
├── Promptverktyg: openai/gpt-5.4
└── Djup/-Deep brief: ✅ (default on)
```

Knappen triggar `requestCreateChat()` i `useBuilderPromptActions.ts`.

### Steg 2 — Deep Brief körs (steg [A])

```
requestCreateChat()
└── applyDynamicInstructionsForNewChat(message)
    ├── pendingBriefRef.current = null  (rensa gammal)
    ├── pendingSpecRef.current = null
    │
    └── await generateDynamicInstructions(message, {
          forceDeepBrief: true,
          skipAddendum: true,      ← VIKTIGT: vi vill INTE blanda brief i text
          onBrief: (brief) => {
            pendingBriefRef.current = brief   ← sparar brief-objektet
          }
        })
```

Inuti `generateDynamicInstructions` (i `useInitBrief.ts`):

```
1. Kolla att modell är giltig och att deep brief är på
2. POST /api/ai/brief med:
   ├── prompt: "Skapa en hemsida för min restaurang..."
   ├── provider: "openai"
   ├── model: "openai/gpt-5.4"
   └── temperature: 0.2

3. Servern (site-brief-generation.ts):
   ├── generateSiteBriefObject()
   │   ├── FÖRSÖK 1: siteBriefSchema (fullt schema)
   │   │   └── generateObject() via AI SDK
   │   │       → strukturerat objekt med:
   │   │         projectTitle: "Gustavs Krog"
   │   │         brandName: "Gustavs Krog"
   │   │         oneSentencePitch: "En restaurang i..."
   │   │         targetAudience: "Matintresserade i..."
   │   │         pages: [
   │   │           { name: "Start", path: "/", sections: [hero, menu-preview, cta] },
   │   │           { name: "Meny", path: "/meny", sections: [menu-full, gallery] },
   │   │           { name: "Boka", path: "/boka", sections: [booking-form, contact] },
   │   │           { name: "Om oss", path: "/om-oss", sections: [about, team, map] }
   │   │         ]
   │   │         visualDirection: { style: "warm", palette: "earth tones", ... }
   │   │         seo: { titleTemplate: "...", description: "..." }
   │   │         mustHave: ["dark mode toggle", ...]
   │   │         avoid: ["generic stock photos", ...]
   │   │
   │   └── FALLBACK (om Anthropic/schema-fel):
   │       └── (simplifiedBriefSchema borttaget — enda schemat nu)
   │
   └── Returnerar brief-objekt till klienten

4. onBrief(brief) → pendingBriefRef.current = brief  ✅
5. Toast: "Brief klar — own-engine kan starta."
```

**Det du minns är korrekt:** briefen *broderar ut* en kort prompt till en rik,
schema-liknande struktur med sidor, sektioner, färger, stil, målgrupp etc.
Denna struktur matchas sedan mot scaffold-registry och route plan i Fas 2.

### Steg 3 — Chatten skapas (steg [B])

```
requestCreateChat() fortsätter:
└── await createNewChat(message, options, systemOverride)
    │
    ├── Bygger promptMeta med:
    │   ├── brief: pendingBriefRef.current  ← briefen från steg 2
    │   ├── modelId, modelTier, scaffold, palette, etc.
    │   └── Om brief SAKNAS (timeout/fail): ingen meta.brief
    │       └── prompten wrappas med formatPrompt() istället
    │
    └── POST /api/engine/chats/stream (SSE)
        med body: { message, meta: { brief, ... } }
```

### Steg 4 — Server tar emot

```
create-chat-stream-post.ts:
├── parseChatRequestMeta(meta) → extraherar brief, tier, scaffold etc.
├── resolveModelSelection() → kanonisk modell-ID
├── orchestratePromptMessage() → budget/strategi (INTE brief-relaterat)
│
├── BRIEF RESOLUTION:
│   ├── clientBrief = meta.brief   (från steg 2, om den hann)
│   ├── Om clientBrief finns → effectiveBrief = clientBrief  ✅
│   └── Om clientBrief SAKNAS:
│       ├── shouldRunServerAutoBrief()? → policy-check:
│       │   ├── Inte audit, technical, follow-up
│       │   ├── Inte redan strukturerad website-prompt (>120 tecken, >2 rubriker)
│       │   └── Om alla villkor uppfyllda: → tryServerAutoBrief()
│       └── effectiveBrief = serverAutoBrief ?? null
│
└── → brief + prompt + modell → Fas 2 (orkestrering)
```

---

## Varför kan Deep Brief "missas"? (din fråga 2)

Sekvensen i koden är:

```
requestCreateChat()
├── [A] await applyDynamicInstructionsForNewChat(message)
│       └── await generateDynamicInstructions(...)  ← VÄNTAR på brief
│           └── POST /api/ai/brief  (kan ta 3-15s)
│
└── [B] await createNewChat(message)  ← startar EFTER att [A] är klar
```

**I dagens kod väntar [B] faktiskt på [A]** — de körs i sekvens med `await`.
Briefen HAR tid att genereras innan chatten skapas.

Men: om briefen **failar** (timeout, parse-error, schema-error), kastas felet
i `useInitBrief.ts` och `pendingBriefRef.current` förblir `null`. Då:

1. `createNewChat` ser att `pendingBriefRef.current === null`
2. Prompten wrappas med `formatPrompt()` istället (MÅL/STIL/TILLGÄNGLIGHET)
3. Servern ser att `meta.brief` saknas → kan köra server auto-brief

Det är alltså inte en parallellitets-race — det är en **fail-fallback-kedja**.
Men resultatet är osynligt för användaren (ingen tydlig notis att briefen
misslyckades, förutom en toast som är lätt att missa).

---

## orchestratePromptMessage() — din fråga 3

**Nej, den suger inte upp saker från briefen.** Den hanterar en helt annan sak:

```
orchestratePromptMessage() bestämmer:
├── Är prompten för lång? → strategi: "phase_plan_build_refine" eller "preserved"
├── Är prompten lagom? → strategi: "direct" (skicka som den är)
├── Behöver den fasplanering? → strategi: "phase_plan_build_refine"
└── Returnerar: { optimizedPrompt, strategy, budget, ... }
```

Det är en **budget/trunkerings-gate**, inte en brief-consumer.
Briefen konsumeras senare i Fas 2 av `buildDynamicContext()`.

---

## Vad Fas 1 faktiskt "gjort" vid överlämning till Fas 2

| Signal | Från | Till Fas 2 |
|--------|------|-----------|
| Rå prompt | Användaren | `prompt` (user-turn) |
| Brief (strukturerat objekt) | Deep Brief LLM | `brief` → scaffold-val, route plan, dynamisk kontext |
| Modellval (tier) | UI | `selectedModelTier` → vilken LLM som kör codegen |
| Scaffold-hint | UI (auto/manual) | `scaffoldMode`, `scaffoldId` |
| Prompt-strategi | `orchestratePromptMessage` | `promptStrategy` (direct/phase/preserved) |
| Build intent | Klassificering | `"website"` / `"app"` / `"template"` |
| Custom instructions | Användarens egna + palette/spec | `customInstructions` |

---

## Follow-up — vad som INTE körs

Vid follow-up (befintlig chatt):

- Deep Brief körs **INTE** (briefen är per-init)
- Server auto-brief körs **INTE**
- `formatPrompt()` wrapping körs istället
- Scaffold är "persisted" (den som valdes vid init)
- Befintliga filer laddas och wrappas i user-turnen

Det finns **ingen summering** av briefen vid follow-up — den "försvinner".
Det finns dock en `orchestration_snapshot` som bevarar viss scaffold/routing-info
från init, men brief-specifika signaler (visuell riktning, toneOfVoice) tappas.

---

## Kopplingen du minns: "brief som matchade mot textfiler"

Det du beskriver stämmer. Briefen producerar strukturerade fält som sedan
matchar mot **tre** nedströms-system i Fas 2:

```
Brief-objekt
│
├── pages[] → buildRoutePlan()
│   └── Briefens sidor blir routes i appen
│
├── styleKeywords + domainHints → matchScaffoldAuto()
│   └── Keyword-boost (+2 per matchad kategori)
│   └── Embedding-query berikas med brief-fragment
│   └── → väljer t.ex. "landing-page" eller "ecommerce"
│
├── visualDirection + toneAndVoice → buildDynamicContext()
│   └── Blir ## Pages & sections, ## Visual identity, etc.
│   └── → system prompt-block med prioritet 82 (av 100)
│
├── mustHave / avoid → buildDynamicContext()
│   └── Blir constraints i prompten
│
└── seo → buildDynamicContext()
    └── Blir SEO-block med prioritet 62
```

Så ja: briefen *broderar ut* prompten, och den schemaaktiga strukturen
konsumeras systematiskt av orkestreringen. Det är inte en "prompt-förbättring"
— det är en **semantisk expansion** som driver scaffold-val, route plan och
systemprompten.

---

## FAQ — vanliga frågor om Fas 1

### F1: Vad gör `formatPrompt()` egentligen? Kan den krympa text?

`formatPrompt()` **lägger till** rubriker runt prompten — den tar aldrig bort
eller skriver om användarens text. Så här ser output ut:

```
MÅL

Skapa en hemsida för min restaurang Gustavs Krog med meny, boka bord och om oss

SEKTIONER
hero, meny, bokningsformulär, om oss

STIL
warm, modern

TILLGÄNGLIGHET
- Use semantic HTML (header, nav, main, footer)
- Ensure color contrast ratio meets WCAG AA (4.5:1)
- All images must have descriptive alt text
- Interactive elements must be keyboard accessible
```

Funktionen:
1. Kollar först om prompten redan är "strukturerad" (`isStructuredPrompt`):
   om den har `##`-rubriker, `MÅL`, `CONSTRAINTS` etc. → **returneras orörd**.
2. Annars extraherar den keyword-matchningar (sektioner, stil, constraints, URLs)
   med regex — ren strängmanipulation, ingen LLM.
3. Lägger till TILLGÄNGLIGHET-krav som **inte redan finns** i prompten.
4. Returnerar allt ihopslaget med `\n\n`.

**Den krymper aldrig text.** Risken är snarare att den *lägger till brus* som
gör prompten längre och mer mekanisk. Det var nog det du upplevde som "pannkaka"
— en kort, naturlig prompt blev en stelbent struktur med rubriker som modellen
tolkade överdrivet bokstavligt.

**Viktigt: `formatPrompt()` körs bara som fallback.** När Deep Brief finns
skickas rå user-text och briefen bär strukturen separat. Wrappern behövs bara
om brief saknas (fail/timeout).

### F2: Om Deep Brief misslyckas — gör server auto-brief samma sak?

Ja, **exakt samma funktion** (`generateSiteBriefObject`) körs av både klient-
brief (`POST /api/ai/brief`) och server auto-brief (`tryGenerateServerAutoBrief`).
Schema, systemprompt och fallback-logik är identiska.

Skillnaden:

| | Client Deep Brief | Server Auto-Brief |
|---|---|---|
| Vem triggar | Klienten (React) | Servern (fallback) |
| Modell | Användarens valda assist-modell | `resolveRunnableBriefModel()` (bästa tillgängliga) |
| Timeout | `PROMPT_ASSIST_TIMEOUT_MS` (klient) | `req.signal` (server request lifetime) |
| Logg | Toast i UI | Server devLog |

Resultatet *borde* vara likvärdigt givet samma prompt. Men modellvalet kan
skilja sig: om klienten kör Anthropic som assist-modell och den failar, kan
serverns fallback välja OpenAI istället — och ge en annorlunda brief.

### F3: Spec File vs `briefToSpec()` — hur såg det ut?

**Spec File** (`sajtmaskin.spec.json`) var ett äldre format som skulle ge
*all* strukturerad input i en enda JSON-fil:

```json
{
  "version": "1.0",
  "business": { "name": "Gustavs Krog", "tagline": "", "tone": ["warm"], "audience": "" },
  "theme": { "primary": "#3b82f6", "secondary": "#6366f1", "font": "system", "styleKeywords": [] },
  "pages": [{ "path": "/", "name": "Home", "sections": ["hero", "features", "cta"] }],
  "constraints": { "noNewDependencies": true, "originalPrompt": "..." }
}
```

**`briefToSpec()`** konverterar en Deep Brief till detta format. Jämfört med
briefen är spec-formatet **mycket fattigare**: inget `mustHave`/`avoid`, ingen
`imagery`, inga `uiNotes`, enklare sida-representation (bara stränglistor
istället för objekt med heading/bullets).

**`promptToSpec()`** är ännu smalare: skapar en minimal spec med default-värden
och bara `"Home"` som enda sida — den vet ingenting om användarens intention.

Spec-first är `active: false` sedan ~2026-04-08. Briefen har tagit den rollen
och levererar rikare data direkt via `meta.brief` → `buildDynamicContext()`.
Spec-koden lever kvar men körs bara om `specMode: true` är explicit satt.

### F4: `pendingBriefRef` och `meta.brief`

Dessa är **två steg i samma kedja**, inte separata system:

```
pendingBriefRef.current          meta.brief
       │                              │
       │  React ref som håller        │  JSON-fält i HTTP-body
       │  briefen i klienten          │  som skickas till servern
       │                              │
       └──── sätts i steg 2 ────────────→ läses i steg 3 ───→ server
             (onBrief callback)            (createNewChat)
```

Om briefen failar: `pendingBriefRef.current` förblir `null` → `meta.brief`
skickas inte → servern ser att brief saknas.

### F5: Hur många filer skickas? Init vs Follow-up

**Init (ny chatt):** Inga filer skickas. Allt kommer från prompten + briefen +
scaffolden. Modellen genererar *alla* filer från scratch.

**Follow-up (befintlig chatt):**

```
resolveFollowUpPreviousFiles(chatId, baseVersionId)
└── Hämtar alla filer från senaste version i engine_versions.files_json
    └── Wrappas i user-turnen:
        ├── "## Existing Project Files (reference)"
        ├── Komprimerade filinnehåll (budget-styrt)
        ├── "## Follow-up Editing Mode"
        └── "## Requested Changes" + användarens nya prompt
```

Antalet filer beror på versionen men är typiskt 10-30 filer (layout.tsx,
page.tsx per route, components, globals.css, etc.). Budget-systemet kan
trunkera eller utelämna filer vid tight context.

| | Init | Follow-up |
|---|---|---|
| Filer skickade | 0 | Alla från senaste version (10-30 st) |
| Brief | Ja (om på) | Nej |
| Scaffold | Auto/manual | Persisted |
| Prompt wrapper | Ingen (raw) / formatPrompt() | File context + continuity headers |
| Summering av brief | N/A | **Ingen** — briefen försvinner |

### F6: Anthropic schema-error — API-nyckel eller schema-storlek?

Felet är **inte** relaterat till API-nyckeln eller dess format. Det specifika
felet är:

```
Schemas contains too many optional parameters (34), which would make
grammar compilation inefficient. Reduce the number of optional parameters
in your tool schemas (limit: 24).
```

Detta är en **Anthropic-specifik begränsning i deras structured output/tool-use
API**. Anthropic kompilerar JSON-schemat till en grammar, och den grammatiken
blir för stor om schemat har >24 optional-params. OpenAI har inte samma
begränsning.

`siteBriefSchema` är nu det enda schemat (alla fält obligatoriska, 0 optionals).
`simplifiedBriefSchema` (34 optionals) är borttaget. Om genereringen misslyckas
returneras `null` och server auto-brief tar vid som säkerhetsnät.

### F7: `BUILD_INTENT_GUIDANCE` — konsoliderat

`BUILD_INTENT_GUIDANCE` finns nu i en gemensam modul: `src/lib/gen/intent-guidance.ts`.
Både `system-prompt.ts` (codegen) och `promptAssist.ts` (rewrite/polish) importerar
samma källa — ingen manuell synk behövs längre.
