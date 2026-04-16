# Utredning: Follow-up regenererar hela projektet

**Datum:** 2026-04-16
**Chat:** `37bacd6e-b2ba-4aa5-9e3c-0b1248e71935`
**Init-version:** `10c76e1e` (20260416-040443)
**Follow-up-version:** `7f974f05` (20260416-041649)

---

## Sammanfattning

En follow-up i chat `37bacd6e` producerade ~13 000 output tokens och 31 filer
(init hade 26 filer, 13 278 tokens). LLM:en genererade i princip ett helt nytt
projekt istället for att bara modifiera de berorda filerna. Nya sidor skapades
(`app/ekonomi/page.tsx`) och totala filantalet okade med 5.

## Bevis

| Metrik | Init (040443) | Follow-up (041649) |
|--------|--------------|-------------------|
| generationKind | create | followup |
| Output tokens | 13 278 | 13 072 |
| Input tokens | 14 741 | 42 599 |
| Preflight files | 26 | 31 |
| Duration ms | 284 509 | 182 047 |
| Autofix fixes | 23 | 25 |
| import-validator | 6 | **17** |
| Syntax errors | 2 (page, dream-duel) | 1 (ekonomi/page) |
| Integrations | 0, envVars=0 | 1, envVars=2 |

Lyckade follow-ups i andra chattar visar:
- `08b3f8fc`: 501 output tokens (riktad andring)
- `b8139b25`: 605 output tokens (riktad andring)
- `8e65919a`: 1 579 output tokens (medelstorlek)

## Vad som skickas till LLM:en vid follow-up

Systemet gor ratt saker:

1. **Continuity-block** (`prependOrchestrationContinuityToFollowUp`):
   - modelTier, promptStrategy, scaffoldId, buildIntent, lastVersionId
   - buildSpec: changeScope, contextPolicy, previewPolicy, stylePack
   - briefSummary: projectTitle, brandName, styleKeywords, toneKeywords
   - Instruktion: "Do not discard previous work unless the user asks to."

2. **previousFiles**: Laddas fran senaste versionen via `resolveFollowUpPreviousFiles`
   och skickas som markdown via `buildFileContext` (max 140K tecken, max 8 filer
   med innehall). Alla filsokvagar listas.

3. **Statisk regel** (`07-existing-files-do-not-regenerate-unless-explicit.md`):
   - "only return files you need to CREATE or MODIFY"
   - "Do NOT regenerate the entire project for small changes"
   - "Files you omit from your response are kept unchanged"

4. **buildSpec**: `changeScope` harlett fran follow-up-prompten via `inferChangeScope`.
   Default for follow-up: `local-layout`. Vid `redesign` scope tillatls bredare.

5. **Merge-logik** (`finalize-merge.ts`): Follow-up-output mergas med previousFiles
   -- nya filer overwriter, oroade filer behalles. Problemet ar inte i merge utan
   i att LLM:en emitterade for manga filer.

## Orsaksanalys

**Grundproblemet ar att LLM:en ignorerade follow-up-reglerna.** Systemet skickar
ratt instruktioner, men LLM:en valde anda att generera 31 filer/13K tokens.

Mojliga bidragande faktorer:

### 1. Promptens komplexitet (troligast)

Follow-up-prompten var 330 tecken och troligen "svar"-kraving — t.ex. "lagg till
en Stripe-betalningssida med flera komponenter". Nar prompten beskriver ett helt
nytt funktionsomrade (betalningar, nya sidor, nya routes) kan LLM:en tolka det
som ett redesign-uppdrag.

### 2. changeScope-inferens kan vara for generost

`inferChangeScope` for follow-up defaultar till `local-layout` men kan bli
`integration` eller `page-addition` vid starka signaler. Om prompten matchade
`page-addition` + `integration` kan det ha givit LLM:en mer "frihet".

Dock: `changeScope` styr idag bara `forbiddenPatterns` och `contextPolicy` —
det finns ingen hard grans pa antal filer LLM:en far emittera.

### 3. Brief saknas vid follow-up

`metaBrief` satts explicit till `null` i follow-up-handleren (rad 190-193).
Briefen fran init nar LLM:en bara via `briefSummary` i continuity-blocket
(projectTitle, brandName, 4 styleKeywords, 3 toneKeywords). All detaljerad
designriktning (colorPalette, typography, pages[], visualDirection) ar borta.

Det innebar att LLM:en inte har starkt nog kontext for att "behalla befintlig
design" — den ser bara en kort sammanfattning och befintliga filer.

### 4. Variant-picking koers om vid follow-up

`buildDynamicContext` korer `pickScaffoldVariant` aven vid follow-up. Med
`brief = null` anvands bara prompt + scaffoldId for att valja variant. Det kan
ge en annan variant an vid init, vilket i sin tur ger nya theme tokens och
font pairings — LLM:en kan da tolka det som "designen har andrats, jag bor
regenerera globals.css och layout.tsx".

## Jamforelse med lyckade follow-ups

| Chat | Output tokens | Typ | Resultat |
|------|--------------|-----|----------|
| `08b3f8fc` | 501 | followup | Riktad andring (liten patch) |
| `b8139b25` | 605 | followup | Riktad andring |
| `8e65919a` | 1 579 | followup | Medelstorlek, riktad |
| **`37bacd6e`** | **13 072** | **followup** | **Full regenerering** |
| `c8338648` | 12 059 | followup | Full regenerering (med fel) |

De lyckade follow-ups har **<2000 output tokens**. De misslyckade har **>10 000**.

## Foreslagna atgarder

### Kort sikt (kan goras nu)

1. **Logga `changeScope` i generationsloggen** sa att vi kan se om det var
   `local-layout`, `integration`, `page-addition` eller `redesign`.

2. **Logga antal emitterade filer vs antal previousFiles** i summary.md for
   att snabbt identifiera "full regen" follow-ups.

### Medellang sikt

3. **Varning vid overdriven follow-up-output**: Om LLM:en returnerar fler an
   `previousFiles.length * 0.8` filer i en follow-up med `changeScope !== "redesign"`,
   logga en varning. (Inte blockera — LLM:en kan ha ratt.)

4. **Bevara init-variant vid follow-up**: Spara `variantId` i orchestration
   snapshot och ateranvand den vid follow-up istallet for att kora
   `pickScaffoldVariant` pa nytt. Forhindrar variant-drift.

5. **Utoka briefSummary i continuity-blocket**: Inkludera `colorPalette`
   (primary, secondary, accent) och `typography` fran init-briefen. Det ger
   LLM:en starkare signal om befintlig design.

### Lang sikt (relaterat till framtidsplanen)

6. **Delta-brief** vid tunga follow-ups: Nar `changeScope === "integration"`
   eller `page-addition`, kor en mini-brief som bara beskriver det nya
   (Stripe-integration), inte hela sajten. Mata in i `buildDynamicContext`.

## Env-variabel-koppling

Follow-up-versionen (`7f974f05`) detekterade 1 integration (Stripe) med 2
envVars. De ovriga ~18 env-nycklarna kommer fran att LLM:en regenererade kod
som refererar till Supabase, Clerk, PostHog osv. — troligen fran den breda
regenereringen av hela projektet.

**Om follow-up bara andrat relevanta filer** hade den genererade koden bara
innehallit Stripe-referenser, och env-panelen hade bara visat 2 nya nycklar.

---

## Slutsats

Problemet ar **inte i merge-logiken** (den fungerar korrekt — nya filer
overskriver, gamla behalles). Problemet ar att **LLM:en emitterar for manga
filer** trots att reglerna sager "only return files you need to CREATE or MODIFY".

De mest lovande atgarderna ar (4) att fryna varianten vid follow-up och (5)
att ge LLM:en starkare designkontext via utokad briefSummary. Bada forhindrar
att LLM:en "tappar" den befintliga designen och kanner behov av att regenerera.
