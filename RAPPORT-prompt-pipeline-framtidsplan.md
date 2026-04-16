# Framtidsplan: Brief-driven designpipeline

**Datum:** 2026-04-16
**Status:** Utkast — väntar på granskning
**Författare:** Agent (baserat på diskussion med projektägare och föregående agent)

---

## Bakgrund

Sajtmaskins kodgenereringsmotor (own-engine) har idag flera parallella lager som
försöker styra designriktning:

| Lager | Typ | Fil | Vad det gör |
|-------|-----|-----|-------------|
| `inferDomain()` | Regex-keyword (11 domäner) | `src/lib/builder/domain-inference.ts` + `config/domain-rules.json` | Matchar "restaurang" → restaurang-hints |
| `buildDomainStructureHints()` | Switch per domän | `src/lib/gen/guidance-resolvers.ts` | 3-4 manuella hints per domän |
| `inferMotionProfile()` | Keyword-lista | `src/lib/gen/guidance-resolvers.ts` | "minimal" vs "lively" |
| `resolveQualityBarGuidance()` | Tone-analys | `src/lib/gen/guidance-resolvers.ts` | Premium/clean/dramatic |
| `resolveSeasonalPaletteGuidance()` | Keyword-matchning | `src/lib/gen/guidance-resolvers.ts` | Jul/vinter/höst-palett |
| `pickScaffoldVariant()` | Keyword-scoring + hash | `src/lib/gen/scaffold-variants/matcher.ts` | Väljer visuell variant |
| Brief-LLM | LLM-genererad | `src/lib/builder/site-brief-generation.ts` | Strukturerat designobjekt |

Alla dessa körs parallellt, vet inte om varandra, och skickas separat till
Kod-LLM:en. Det nya `## Design Priority`-blocket (just implementerat) löser
*prioritetskonflikten*, men inte grundproblemet: de deterministiska lagren
kan inte resonera. Ett hårdrocksband som säljer merch matchar kanske
`"ecommerce"` i domain-inference, men domän-hints för ecommerce säger
"storefront" — inte "rå, mörk estetik".

Brief-LLM:en *kan* resonera om det, men den körs i ett vakuum: den ser inte
vilken scaffold-variant som valts, och dess output når inte variant-pickern.

---

## Mål

Flytta designintelligens **uppåt** — från deterministiska gissare till
Brief-LLM:en — utan att ta bort de deterministiska lagren (som blir fallback).

```
IDAG:
  Prompt → [6 deterministiska gissare] + [Brief-LLM (blind)] → Kod-LLM

MÅL:
  Prompt → [Brief-LLM som ser variant-defaults + scaffold-kontext] → Kod-LLM
  (determinism kvar som fallback vid brief-miss)
```

---

## Föreslagna faser

### Fas A: Brief-LLM:en får variant-kontext

**Vad:** Utöka `generateSiteBriefObject()` så att den tar emot variant-defaults
och scaffold-information som input.

**Varför:** Idag körs briefen i `create-chat-stream-post.ts` *innan*
scaffold/variant-resolution (rad ~182-218). Pipeline-ordningen ska inte ändras
(det är för riskfyllt), men resultatet kan förbättras genom en **refinement-steg**:

1. Brief genereras som idag (från raw prompt)
2. Scaffold-matchning + variant-picking körs som idag (med briefen)
3. **Nytt:** Brief-LLM:en anropas en gång till med `{ originalBrief, variantDefaults }`
   för att harmonisera brief och variant

Alternativt (billigare): skicka variant-defaults som *hint* till första
brief-genereringen, utan att vända pipeline-ordningen. Det kräver att
scaffold-matchning körs snabbt (keyword-only, utan embedding) före briefen,
och att variant-picking körs deterministiskt enbart på prompten.

**Berörda filer:**
- `src/lib/builder/site-brief-generation.ts` — utöka input-typen
- `src/lib/api/engine/chats/create-chat-stream-post.ts` — orchestrering
- Brief-systemprompten (i `site-brief-generation.ts`) — ny instruktion

**Risk:** Medel. Latens ökar om vi lägger till ett extra LLM-anrop. Alternativet
(variant-hint i första anropet) kräver att vi skapar en "snabb" scaffold-matchare
som inte behöver brief-kontext.

**Uppskattad insats:** 2-3 dagar

---

### Fas B: Brief tar över guidance-fält

**Vad:** Utöka brief-schemat (`siteBriefSchema`) med fält som idag produceras
deterministiskt:

```typescript
// Nya fält i Brief (optionella)
domainProfile?: string;        // "restaurant", "ecommerce", "heavy-metal-merch"
motionLevel?: "minimal" | "moderate" | "lively";
qualityBar?: "clean" | "premium" | "bold-dramatic";
seasonalHints?: string[];
```

**Varför:** Brief-LLM:en kan producera mer nyanserade värden. "heavy-metal-merch"
är bättre än "ecommerce" för ett hårdrocksband. "bold-dramatic" med
"distressed textures" är bättre än den generiska quality-bar-listan.

**Hur det fungerar med fallback:**

```typescript
// I buildDynamicContext() / resolveGuidanceBlocks():
const domainProfile = brief?.domainProfile
  ? brief.domainProfile as DomainProfile
  : inferDomain(userPrompt);  // deterministisk fallback
```

De deterministiska funktionerna (`inferDomain`, `inferMotionProfile`,
`resolveQualityBarGuidance`, `resolveSeasonalPaletteGuidance`) finns kvar
som fallback men körs bara när briefen inte har fältet.

**Berörda filer:**
- `src/lib/builder/site-brief-generation.ts` — brief-schema-utökning
- `src/lib/gen/guidance-resolvers.ts` — conditional: brief-fält > deterministisk
- `src/lib/gen/system-prompt.ts` — `buildDynamicContext()` skickar brief-fält till guidance

**Risk:** Låg-medel. Schema-utökningen är bakåtkompatibel (alla nya fält optionella).
Fallback-logiken säkerställer att inget går sönder om brief-fältet saknas.

**Uppskattad insats:** 1-2 dagar

---

### Fas C: Dossier-kedja istället för parallella vägar

**Vad:** Idag flödar dossier-data genom två parallella vägar till Kod-LLM:en:

1. `derive-variants-from-dossiers.ts` → variant JSON (buildtime) → `## Scaffold Variant`
2. `resolveTemplateGuidance()` → kompakta snippets (runtime) → `## Scaffold Research Priorities`

Briefen vet inte om någondera. Målet är att dossier-data → variant-defaults → Brief-LLM → en samlad designriktning.

**Hur:**

1. Variant-defaults (som redan innehåller dossier-deriverade `styleRules`,
   `sectionInventory`, `avoidPatterns`, `worldClassRubric`) skickas till Brief-LLM:en
   (Fas A)
2. Brief-LLM:en producerar en **harmoniserad** designriktning som tar hänsyn
   till variant, dossier-regler och användarens prompt
3. `## Scaffold Research Priorities` kan kortas ned (briefen har redan
   absorberat de viktigaste insikterna)

**Effekt:** Kod-LLM:en ser en röst (briefen) istället för tre parallella
designkällor som den måste väga mot varandra.

**Risk:** Medel. Kräver att Fas A är klar. Att korta ned research priorities
kan tappa information — behöver A/B-test.

**Uppskattad insats:** 1-2 dagar (efter Fas A)

---

### Fas D: Förenklad statisk prompt (frivillig)

**Vad:** Med briefen som enda designsammanfattare kan delar av den statiska
prompten trimmas ytterligare:

- `04-visual-design-quality.md` — OKLCh-hue-tabellen (rad 15-20) blir
  redundant om briefen redan har rätt färger. Kan kortas till "derive hue from
  brief palette" istället för att lista alla branscher.
- `06-images.md` — om briefen har `imagery`-fält med specifik bildstyrning,
  kan den statiska filen reduceras till bara Unsplash/placeholder-konventioner.

**Risk:** Låg. Craft-regler (spacing, shadows, typography-klasser) behålls alltid.

**Uppskattad insats:** 0.5 dagar

---

## Vad som INTE bör ändras

| Sak | Varför |
|-----|--------|
| Pipeline-ordning (brief → scaffold) | Dominoeffekter. Fungerar. |
| Scaffold-matchning (keyword + embedding) | Fungerar bra, beprövad |
| Variant JSON-format | Strukturen är bra, ingen förändring behövs |
| `useInitBrief` hook | Klient-brief och server-auto-brief samexisterar |
| `promptOrchestration.ts` | Tokenbudget för user-message, separat concern |
| `prependOrchestrationContinuityToFollowUp` | Follow-up-wrap, separat concern |
| Statiska craft-regler (spacing, shadows, imports) | Universella, designoberoende |

---

## Rekommenderad ordning

```
Fas A (variant → brief)   ← störst påverkan, löser kärnproblemet
  ↓
Fas B (brief-fält > determinism)   ← enkel, bakåtkompatibel
  ↓
Fas C (dossier-kedja)   ← kräver Fas A
  ↓
Fas D (trimma statisk)   ← frivillig, låg risk
```

Fas A och B kan eventuellt göras parallellt om brief-schemat utökas i samma svep.

---

## Risker och mitigeringar

| Risk | Mitigation |
|------|-----------|
| Extra LLM-anrop i Fas A (latens + kostnad) | Variant-hint-alternativet kräver bara ett anrop |
| Brief-schema-bloat | Alla nya fält optionella; validering via Zod |
| Brief-miss → ingen designriktning | Deterministiska fallbacks behålls |
| Regression i designkvalitet | Snapshot-tester av `buildDynamicContext()` output före/efter |
| Dossier-trimning tappar info | A/B-test med faktiska genereringar |

---

## Relaterade implementerade ändringar (2026-04-16)

Dessa ändringar gjordes som förberedelse och löser det mest akuta problemet:

1. **`## Design Priority`-block** — explicit hierarki i `buildDynamicContext()`.
   Priority 89, `required: true`. Löser prioritetskonflikten.
2. **`04-visual-design-quality.md`** — "primary design driver"-frasen borttagen,
   ersatt med hänvisning till Design Priority-hierarkin.
3. **Server auto-brief policy** — `looksStructuredWebsitePrompt`-blockeringen
   borttagen. Strukturerade prompts får nu alltid auto-brief.
4. **Docs/glossary/schema** — uppdaterade att reflektera ändringarna.

---

## Implementerade faser (2026-04-16, session 2)

### Prompt-omstrukturering (förberedelse)

16 `prompt-static`-filer konsoliderades till 3 `Core Rules` (`config/prompt-core/`) +
12 `Directives` (`config/prompt-directives/`). Ny `directive-loader.ts` med mtime-cache.
Nya backoffice-sidor. Glossary + terminology uppdaterade med Core Rules, Directives,
Directive Cascade.

### Fas B: Brief tar över guidance-fält — GENOMFÖRD

- **Brief-schema utökat** (`siteBriefSchema`) med 4 nya optionella fält:
  `domainProfile`, `motionLevel`, `qualityBar`, `seasonalHints`.
- **Brief-LLM instruerad** — `BRIEF_SYSTEM_PROMPT` utökat med konkreta fältinstruktioner.
- **`resolveGuidanceBlocks()`** accepterar brief-värden som Level 1-2 overrides.
  Nya hjälpfunktioner: `mapBriefMotionLevel()`, `resolveQualityBarFromBrief()`.
- **`buildDynamicContext()`** skickar brief-fält till guidance-resolvers.
- **Bakåtkompatibelt:** alla nya fält optionella; deterministisk fallback bevarad.

### Fas D: Förenklad statisk prompt — GENOMFÖRD

- **OKLCh-hue-tabell trimmad** — 6 branschspecifika rader → 3 koncisa rader
  ("använd brief-palette, sedan variant-tokens, sedan subject-derived").
- **Visual-design-direktivet injiceras** som Level 4-default i `buildDynamicContext()`.
  Craft-regler (art direction, typografi, spacing, polish) når nu modellen
  via direktivsystemet istället för den statiska prompten.
- **Priority-regler tillagda** för visuella design-block i token-budget-systemet.
- Samma trim applicerad på legacy `prompt-static/04-visual-design-quality.md`.

---

## Filindex (berörda av framtidsplanen)

| Fil | Fas | Ändring |
|-----|-----|---------|
| `src/lib/builder/site-brief-generation.ts` | A, B | Utöka input + schema |
| `src/lib/api/engine/chats/create-chat-stream-post.ts` | A | Orchestrering av refinement |
| `src/lib/gen/guidance-resolvers.ts` | B | Conditional: brief > determinism |
| `src/lib/gen/system-prompt.ts` | B, C | Skicka brief-fält, trimma research |
| `src/lib/gen/orchestrate.ts` | C | Trimma `resolveTemplateGuidance` |
| `config/prompt-static/04-visual-design-quality.md` | D | OKLCh-tabell |
| `config/prompt-static/06-images.md` | D | Bildstyrning |
