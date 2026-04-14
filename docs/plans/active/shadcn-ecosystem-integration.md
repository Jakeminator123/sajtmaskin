# shadcn Ecosystem Integration — Future Plan

Status: **delvis genomfört** (Nivå 0 + 1 + 4 + 5 klara, Nivå 2–3 planerat)
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

## Nivå 1 — Automatisk komponentsynk (GENOMFÖRD)

### Problem

`src/lib/gen/data/shadcn-components.ts` underhålls manuellt. Varje gång shadcn lägger till en ny komponent (t.ex. `spinner`, `empty`, `button-group` som alla saknades fram tills idag) riskerar vi att hamna efter.

### Lösning

`scripts/shadcn/sync-shadcn-registry.ts`:

1. Hämtar `https://ui.shadcn.com/r/index.json` → filtrera `registry:ui`
2. Hämtar varje komponents detail-JSON (`/r/styles/new-york-v4/{name}.json`) och parsar `export { ... }` för PascalCase-exporter
3. Jämför mot befintlig `SHADCN_COMPONENTS`-map
4. Utan flagga: warn-only diff. Med `--write`: uppdaterar filen. Med `--json`: maskinläsbar diff.

### Berörda filer

- `src/lib/gen/data/shadcn-components.ts` — output-mål (307 entries efter första synk)
- `scripts/shadcn/sync-shadcn-registry.ts` — synk-script
- `package.json` — `shadcn:sync` + `shadcn:sync:write`

### Resultat (första körning 2026-04-13)

- 73 nya exports tillagda (bl.a. hela `Combobox*`-familjen, `AvatarGroup`, `SidebarRail` m.fl.)
- 4 entries borttagna från upstream men behållna lokalt (`Chart`, `Direction`, `Sonner`, `Toast`)
- 1 subpath-ändring: `Toaster` → `"sonner"` (var `"toaster"`)

**Status:** Genomförd 2026-04-13.

---

## Nivå 2 — Blocks-metadata som section recipes (medelsikt, medel risk)

### Problem

Variant-guidance i `config/scaffold-variants/*.json` innehåller handskrivna strängar för visuella och strukturella uttryck (t.ex. dossier-härledda style rules). De är bra men subjektiva och kan bli inaktuella.

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

- `config/scaffold-variants/` — variant-guidance kan bli delvis automatgenererad från blocks-metadata
- Eventuellt ny datafil `src/lib/gen/data/block-patterns.ts`
- `scripts/extract-block-patterns.ts` — nytt script

### Komplexitet

Medel. Blocks dependencies ger oss vilka *komponenter* som ingår, men inte *hur* de arrangeras (layout, visuell hierarki). Mänsklig curation behövs fortfarande för att matcha patterns mot scaffold variants.

### Designbeslut

Vi importerar INTE hela block-filer i prompten. Vi extraherar deras *kompositionsmönster* — vilka komponenter som hör ihop och för vilket syfte.

---

## Nivå 3 — registry:font för fonthantering (medelsikt, låg risk)

### Problem

`fontPairings` i scaffold-variant-JSON innehåller Google Font-namn som strängar. LLM:en tolkar dem och genererar `next/font/google`-importer. Om ett fontnamn stavas fel eller inte finns i Google Fonts failar det tyst.

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

- `config/scaffold-variants/` — `fontPairings` byter format till strukturerat schema
- `src/lib/gen/system-prompt.ts` — rendering av font direction
- Eventuellt: `data/font-registry/` med JSON-filer per fontpar

### Komplexitet

Låg-medel. Det viktiga steget är att `import`-fältet matchar exakt vad `next/font/google` förväntar sig (t.ex. `Playfair_Display` med understreck, inte `Playfair Display` med mellanslag). Det ger oss validering som vi saknar idag.

### Bonus

Community-registryn [Fonttrio](https://fonttrio.com) har redan en stor samling `registry:font`-items som kan användas som källa.

---

## Nivå 4 — components.json v4-format och registrys (GENOMFÖRD)

### Problem

`components.json` saknade `registries`-fält. Det hindrade namespaced `npx shadcn add @shadcn/...`-flödet och Cursor-MCP:n från att lista/visa registry-items.

### Lösning

`registries` tillagt med `@shadcn` pinnnad till den stilbundna live-registryn (`new-york-v4`) som faktiskt exponerar `registry.json` + item-JSON:er. Hooks-alias konsoliderad till `@/lib/hooks` genom hela pipeline. `predev` kör nu `shadcn:sync:soft` automatiskt.

**Status:** Genomförd 2026-04-14.

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
| 1 | Automatisk komponentsynk | Hög — eliminerar manuellt underhåll | Låg | **Genomförd** |
| 2 | Blocks-metadata → section recipes | Medel — rikare recipes, bättre first-pass | Medel | 4-8 h |
| 3 | registry:font-schema för fontpar | Medel — validerade fontnamn, bättre konsistens | Låg | 2-3 h |
| 4 | components.json v4-uppgradering | Låg nu — möjliggör community-registrys | Medel | **Genomförd** |
| 5 | Dedikerad sajtmaskin-component-mcp | Hög — on-demand API-depth från registret | Medel | **Genomförd** (förenklad: lokal cache + orchestration-hook) |

---

## Relation till genomfört arbete

Toolkit Enrichment (april 2026) löste de akuta problemen:

- `@tanstack/react-table` och `@react-three/rapier` installerade (dep-bugfix)
- Grupperad komponentvägledning i `## Your Toolkit` (prompt-förbättring)
- Konkreta fontpar per scaffold variant (data-utökning)
- Section recipes per scaffold variant (data-utökning)
- 9 saknade shadcn-komponenter tillagda i registret
- lucide-react KNOWN_PACKAGES fixad (^0.563 → ^1)
- Capability-inference gaps: needsCalendar, needsCommandSearch, needsThemeToggle + berikade hints
- **Nivå 0:** Statiska component patterns (`03b-shadcn-component-patterns.md`) — API-depth för ~18 interaktiva komponenter

Arbetet ovan bygger vidare på den grunden — det ersätter den inte.
