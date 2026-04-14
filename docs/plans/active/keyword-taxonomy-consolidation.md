# Keyword Taxonomy Consolidation

## Bakgrund

Keyword-matchning lever idag på tre ställen som inte delar data:

| Fil | Vad | Format | ~Rader keywords |
|-----|-----|--------|-----------------|
| `src/lib/gen/scaffolds/matcher.ts` | 11 const-arrayer: `LANDING_KEYWORDS`, `SAAS_KEYWORDS`, `PORTFOLIO_KEYWORDS`, `PORTFOLIO_MEDIA_KEYWORDS`, `PORTFOLIO_ART_DIRECTION_KEYWORDS`, `BLOG_KEYWORDS`, `DASHBOARD_KEYWORDS`, `APP_KEYWORDS`, `AUTH_KEYWORDS`, `ECOMMERCE_KEYWORDS`, `CONTENT_KEYWORDS`, `HOSPITALITY_SERVICE_KEYWORDS`, `STRONG_ECOMMERCE_INTENT` | TypeScript string[] | ~340 |
| `src/lib/gen/data/style-directions.ts` | `keywords` fält per `StyleDirectionPreset` (14 presets, inline) | TypeScript inline arrays | ~130 |
| `src/lib/gen/scaffolds/scaffold-search.ts` | `SWEDISH_TO_ENGLISH_HINTS` + `ENGLISH_TO_SWEDISH_HINTS` i `expandQuery()` | Regex → hint-strängar | ~30 |

Problemet: tre separata keyword-vokabulärer, inga delade termer, risk för inkonsistens (svenska termer saknas i ett system men finns i ett annat).

## Mål

Skapa **en** kanonisk keyword-taxonomi under `config/` som alla tre system läser. Inga runtime-beteendeändringar — bara att keyword-data centraliseras.

## Instruktioner till agent

### Steg 1: Skapa taxonomi-filen

Skapa `config/keyword-taxonomy.json` (eller `config/keyword-taxonomy.ts` om du föredrar typsäkerhet).

Strukturen ska vara:

```ts
type KeywordCategory = {
  id: string;                    // t.ex. "ecommerce", "saas", "portfolio"
  keywords: string[];            // alla keywords (en + sv blandat)
  subcategories?: {
    id: string;                  // t.ex. "strong_ecommerce_intent", "hospitality_veto"
    keywords: string[];
  }[];
};
```

Populera från befintliga keyword-arrayer i de tre filerna. Slå ihop keywords som finns i flera system — en term ska bara listas en gång per kategori. Alla befintliga keywords måste finnas kvar (ingen får tappas).

Kategorier att skapa (baserat på befintliga arrayer):

- `landing` — från `LANDING_KEYWORDS`
- `saas` — från `SAAS_KEYWORDS` + relevanta `style-directions` keywords
- `portfolio` — från `PORTFOLIO_KEYWORDS` + subcategories: `media` (från `PORTFOLIO_MEDIA_KEYWORDS`), `art_direction` (från `PORTFOLIO_ART_DIRECTION_KEYWORDS`)
- `blog` — från `BLOG_KEYWORDS`
- `dashboard` — från `DASHBOARD_KEYWORDS`
- `app` — från `APP_KEYWORDS`
- `auth` — från `AUTH_KEYWORDS`
- `ecommerce` — från `ECOMMERCE_KEYWORDS` + subcategories: `strong_intent` (från `STRONG_ECOMMERCE_INTENT`), `hospitality_veto` (från `HOSPITALITY_SERVICE_KEYWORDS`)
- `content` — från `CONTENT_KEYWORDS`
- `docs` — från `documentation_clarity` keywords i style-directions
- `nature` — från `nature_organic` keywords
- `luxury` — från `luxury_noir` keywords
- `retro` — från `retro_atmosphere` keywords
- `brutalist` — från `bold_brutalist` keywords
- `playful` — från `playful_cards` keywords
- `warm_local` — från `warm_editorial` keywords (restaurang, café, frisör, etc.)
- `tech_dev` — från `tech_terminal` keywords

### Steg 2: Skapa loader

Skapa `src/lib/gen/data/keyword-taxonomy.ts` med:

```ts
export function getCategoryKeywords(categoryId: string): string[]
export function getSubcategoryKeywords(categoryId: string, subcategoryId: string): string[]
export function getAllCategories(): KeywordCategory[]
```

### Steg 3: Refaktorera matcher.ts

Ersätt alla `const LANDING_KEYWORDS = [...]` med importer från taxonomy-loadern:

```ts
const LANDING_KEYWORDS = getCategoryKeywords("landing");
const SAAS_KEYWORDS = getCategoryKeywords("saas");
// etc.
const HOSPITALITY_SERVICE_KEYWORDS = getSubcategoryKeywords("ecommerce", "hospitality_veto");
const STRONG_ECOMMERCE_INTENT = getSubcategoryKeywords("ecommerce", "strong_intent");
```

`countKeywordMatches`, `buildKeywordScores`, `applyBriefKeywordBoost` och resten av matcher-logiken ska **inte** ändras — bara keyword-datan byter källa.

### Steg 4: Refaktorera style-directions.ts

Varje `StyleDirectionPreset.keywords`-array ska antingen:
- Läsa från taxonomin via `getCategoryKeywords("luxury")` etc.
- Eller kombinera flera kategorier: `[...getCategoryKeywords("saas"), ...getCategoryKeywords("landing").filter(k => ["corporate", "enterprise"].includes(k))]`

Behåll inline-keywords bara för preset-specifika termer som inte passar i någon taxonomi-kategori.

### Steg 5: Refaktorera scaffold-search.ts expandQuery()

`SWEDISH_TO_ENGLISH_HINTS` och `ENGLISH_TO_SWEDISH_HINTS` ska byggas från taxonomin istället för handskrivna regex-par. Varje taxonomi-kategori med blandade sv/en-termer kan generera hints automatiskt.

### Steg 6: Verifiera

1. `npm run typecheck` — inga fel
2. `npx vitest run src/lib/gen/system-prompt.test.ts` — alla gröna
3. `npx vitest run src/lib/gen/llm-input-scenarios.test.ts` — alla gröna
4. `npx vitest run src/lib/gen/scaffolds/` — alla gröna (om det finns tester)
5. Granska att **inga keywords tappades** — totalt antal unika keywords före och efter ska vara samma eller fler.

### Viktiga regler

- **Ingen beteendeändring.** Scoringlogik, trösklar, guardrails — allt ska vara identiskt efter refaktorn. Bara keyword-datan byter adress.
- **Signal ownership** (`signal-ownership.mdc`): keyword-taxonomin blir den kanoniska källan. Inga lokala keyword-listor ska finnas kvar efter refaktorn.
- **Befintliga filer att läsa först:**
  - `src/lib/gen/scaffolds/matcher.ts` (rad 23–361 — alla keyword-arrayer)
  - `src/lib/gen/data/style-directions.ts` (alla presets med `keywords` fält)
  - `src/lib/gen/scaffolds/scaffold-search.ts` (`expandQuery` + hint-tabeller)
  - `.cursor/rules/signal-ownership.mdc` (ägarmatris)
  - `config/prompt-heuristic-tokens.json` (exempel på liknande centraliserad keyword-fil)
