# shadcn Ecosystem Integration — Future Plan

Status: **delvis genomfört** (Nivå 0 klar, resten planerat)
Skapad: 2026-04-13
Kontext: [Toolkit Enrichment](../../../.cursor/plans/toolkit_enrichment_plan_dc42efbf.plan.md) — fas 1–5 genomförda

## Bakgrund

Under Toolkit Enrichment-arbetet (april 2026) upptäcktes att shadcn-ekosystemet har utvecklats betydligt bortom vad vi utnyttjar idag. Vi underhåller manuella datastrukturer (`SHADCN_COMPONENTS`, handskrivna section recipes, fontpar som strängar) där shadcn erbjuder maskinläsbara, strukturerade alternativ: MCP-server, blocks med metadata, `registry:font`-schemat, och community-registrys.

Det här dokumentet listar konkreta framtida investeringar, ordnade efter värde och risk.

---

## Nivå 0 — Statiska component patterns (GENOMFÖRD)

### Problem

Toolkit-sammanfattningen listar komponentnamn men inte *hur* de används. LLM:en ser "calendar" i listan men vet inte att den tar `mode="single"` + `onSelect`, att DatePicker = Calendar + Popover, eller att Drawer wrapprar vaul. Resultatet: statiska grids istället för interaktiva komponenter.

### Lösning

Ny statisk promptfil `config/prompt-static/03b-shadcn-component-patterns.md` med korta API-mönster för ~18 interaktiva komponenter. Laddas via `codegen-static-prompt.json` direkt efter `03-shadcn-ui-components.md`. ~250 tokens, alltid närvarande i prompten.

Täcker: Calendar, DatePicker, Command, Combobox, Drawer, Carousel, Chart, Form, InputOTP, Sheet, DataTable, Sidebar, Sonner, Empty, Spinner, InputGroup, next-themes.

**Status:** Genomförd 2026-04-13.

---

## Nivå 1 — Automatisk komponentsynk (kort sikt, låg risk)

### Problem

`src/lib/gen/data/shadcn-components.ts` underhålls manuellt. Varje gång shadcn lägger till en ny komponent (t.ex. `spinner`, `empty`, `button-group` som alla saknades fram tills idag) riskerar vi att hamna efter.

### Lösning

Skapa ett script (t.ex. `scripts/sync-shadcn-registry.ts`) som:

1. Anropar shadcn MCP-servern (`list_items_in_registries` med `@shadcn`) eller hämtar `https://ui.shadcn.com/r/registry.json`
2. Filtrerar `registry:ui`-items
3. Genererar en uppdaterad `SHADCN_COMPONENTS`-map (eller varnar om diff mot nuvarande)
4. Körs som en npm-script (`npm run shadcn:sync`) eller i CI

### Berörda filer

- `src/lib/gen/data/shadcn-components.ts` — output-mål
- `scripts/sync-shadcn-registry.ts` — nytt script
- `package.json` — ny script-entry

### Komplexitet

Låg. MCP-servern (`project-0-sajtmaskin-shadcn`) är redan konfigurerad och fungerar. Alternativt kan vi hämta registry.json direkt via HTTP.

### Öppna frågor

- Ska scriptet generera filen helt, eller bara varna om saknade poster?
- Export-namn (PascalCase) finns inte i registry.json — de ligger i komponentfilernas source. Vi kan antingen hämta varje komponents fil via MCP (`view_items_in_registries`) och parsa exporter, eller underhålla en minimal manuell mapping från subpath → exporter och bara automatisera *vilka subpaths som finns*.

---

## Nivå 2 — Blocks-metadata som section recipes (medelsikt, medel risk)

### Problem

Section recipes i `style-directions.ts` är handskrivna strängar som beskriver komponentkombinationer (t.ex. "Testimonial rail using Carousel + HoverCard author reveals"). De är bra men subjektiva och kan bli inaktuella.

### Lösning

Använd shadcn blocks-metadata som komplement/källa för recipes. Officiella blocks (405 st) inkluderar:

- **Dashboards** (`dashboard-01`): sidebar + charts + data table
- **Sidebars** (`sidebar-01` till `sidebar-16`): 16 varianter av navigationsmönster
- **Auth** (`login-01` till `login-05`, `signup-01` till `signup-05`): formulär-layouts
- **Charts** (50+ varianter): area, bar, line, pie, radar, radial, tooltips

Varje block har en description och en lista dependencies/registryDependencies. Dessa kan parsas till strukturerade "komponent-användningsmönster" som:

```
dashboard-01 → Sidebar + Chart + Table + Card + ScrollArea
sidebar-07   → Sidebar (collapsible, icons) + Breadcrumb + Separator
login-04     → Card + Form + Input + Button (split layout med bild)
```

### Berörda filer

- `src/lib/gen/data/style-directions.ts` — `sectionRecipes` kan bli delvis automatgenererade
- Eventuellt ny datafil `src/lib/gen/data/block-patterns.ts`
- `scripts/extract-block-patterns.ts` — nytt script

### Komplexitet

Medel. Blocks dependencies ger oss vilka *komponenter* som ingår, men inte *hur* de arrangeras (layout, visuell hierarki). Mänsklig curation behövs fortfarande för att matcha patterns mot style directions.

### Designbeslut

Vi importerar INTE hela block-filer i prompten. Vi extraherar deras *kompositionsmönster* — vilka komponenter som hör ihop och för vilket syfte.

---

## Nivå 3 — registry:font för fonthantering (medelsikt, låg risk)

### Problem

`fontPairings` i `style-directions.ts` innehåller Google Font-namn som strängar. LLM:en tolkar dem och genererar `next/font/google`-importer. Om ett fontnamn stavas fel eller inte finns i Google Fonts failar det tyst.

### Lösning

Skapa `registry:font`-items för varje fontpar och använd schemat som referens:

```json
{
  "type": "registry:font",
  "font": {
    "family": "'Playfair Display', serif",
    "provider": "google",
    "import": "Playfair_Display",
    "variable": "--font-display",
    "subsets": ["latin"]
  }
}
```

### Berörda filer

- `src/lib/gen/data/style-directions.ts` — `fontPairings` byter format till strukturerat schema
- `src/lib/gen/system-prompt.ts` — rendering av font direction
- Eventuellt: `data/font-registry/` med JSON-filer per fontpar

### Komplexitet

Låg-medel. Det viktiga steget är att `import`-fältet matchar exakt vad `next/font/google` förväntar sig (t.ex. `Playfair_Display` med understreck, inte `Playfair Display` med mellanslag). Det ger oss validering som vi saknar idag.

### Bonus

Community-registryn [Fonttrio](https://fonttrio.com) har redan en stor samling `registry:font`-items som kan användas som källa.

---

## Nivå 4 — components.json v4-format och registrys (långsikt, medel risk)

### Problem

Vår `components.json` använder äldre schema utan `registries`-fält. Det påverkar inte generering men hindrar oss från att:

- Använda community-registrys (t.ex. `@shadcnblocks`, prompt-kit)
- Dra nytta av `npx shadcn add @registry/component`-flödet i development
- Använda `registry:base` för design system presets

### Lösning

Uppgradera till v4-format:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "registries": {
    "@shadcn": "https://ui.shadcn.com/r/{name}.json"
  },
  "tailwind": { ... },
  "aliases": { ... }
}
```

### Berörda filer

- `components.json` — uppgradering
- Eventuellt: `config/prompt-static/03-shadcn-ui-components.md` om instruktioner om registrys ska med i prompts

### Komplexitet

Medel. Risken är att shadcn CLI-beteende ändras med det nya formatet och påverkar hur vi installerar komponenter. Kräver testning.

---

## Nivå 5 — Dedikerad sajtmaskin-component-mcp (GENOMFÖRD — förenklad variant)

### Problem

Nivå 0 (statiska component patterns) ger depth för de vanligaste komponenterna men är manuellt underhållen och begränsad till ~18 mönster. När shadcn lägger till nya komponenter eller ändrar API:er hamnar vi efter.

### Distinktion från Cursor-MCP

| MCP-server | Används av | Transport |
|---|---|---|
| `project-0-sajtmaskin-shadcn` (Cursor) | Utvecklare i Cursor IDE | Cursor MCP-protokoll (lokal) |
| **sajtmaskin-component-mcp** (ny) | Genererings-LLM i `orchestrate.ts` | HTTP/fetch mot lokal cache eller shadcn-registret |

Cursor-MCP:n är **inte** tillgänglig för genererings-LLM:en — den körs i en API-route/serverless function utan Cursor-transport.

### Lösning

Ett pre-generation-steg i `orchestrate.ts` (efter `inferCapabilities`, före `buildDynamicContext`) som:

1. Baserat på capabilities + prompt-keywords, identifierar 3-5 relevanta shadcn-komponenter
2. Hämtar deras examples via HTTP mot en lokal cache (synkad från `ui.shadcn.com/r/`)
3. Injicerar som `## Component References` i dynamisk kontext (~400-1500 tokens)

### Implementation

- **Lokal cache:** `data/shadcn-registry-cache/` med JSON-filer per komponent, synkade via `npm run shadcn:sync`
- **Fetch-modul:** `src/lib/gen/data/shadcn-registry-fetch.ts` — läser lokal cache, fallback till Nivå 0 patterns
- **Orchestration-hook:** nytt steg i `resolveOrchestrationBase()` som bygger `componentReferences`
- **Prompt-rendering:** ny sektion i `buildDynamicContext()` med demokod för matchade komponenter

### Fallback

Om cachen saknas eller är tom: Nivå 0 (statiska patterns) används alltid som baseline. Component references är ett *tillägg*, inte en ersättning.

### Uppskattad insats

2-3 dagar. Huvudarbetet är cache-synk-scriptet och orchestration-hooken. Prompt-rendering och fallback är trivialt.

---

## Prioritetsordning

| Nivå | Beskrivning | Värde | Risk | Uppskattad insats |
|------|-------------|-------|------|-------------------|
| 0 | Statiska component patterns | Hög — ger API-depth utan runtime-kostnad | Låg | **Genomförd** |
| 1 | Automatisk komponentsynk | Hög — eliminerar manuellt underhåll | Låg | 2-4 h |
| 2 | Blocks-metadata → section recipes | Medel — rikare recipes, bättre first-pass | Medel | 4-8 h |
| 3 | registry:font-schema för fontpar | Medel — validerade fontnamn, bättre konsistens | Låg | 2-3 h |
| 4 | components.json v4-uppgradering | Låg nu — möjliggör community-registrys | Medel | 1-2 h |
| 5 | Dedikerad sajtmaskin-component-mcp | Hög — on-demand API-depth från registret | Medel | **Genomförd** (förenklad: lokal cache + orchestration-hook) |

---

## Relation till genomfört arbete

Toolkit Enrichment (april 2026) löste de akuta problemen:

- `@tanstack/react-table` och `@react-three/rapier` installerade (dep-bugfix)
- Grupperad komponentvägledning i `## Your Toolkit` (prompt-förbättring)
- Konkreta fontpar per style direction (data-utökning)
- Section recipes per style direction (data-utökning)
- 9 saknade shadcn-komponenter tillagda i registret
- lucide-react KNOWN_PACKAGES fixad (^0.563 → ^1)
- Capability-inference gaps: needsCalendar, needsCommandSearch, needsThemeToggle + berikade hints
- **Nivå 0:** Statiska component patterns (`03b-shadcn-component-patterns.md`) — API-depth för ~18 interaktiva komponenter

Arbetet ovan bygger vidare på den grunden — det ersätter den inte.
