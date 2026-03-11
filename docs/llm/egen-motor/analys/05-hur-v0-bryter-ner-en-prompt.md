# Hur v0 bryter ner en användarpromt till instruktioner

> 2026-03-06 — Detaljerad rekonstruktion baserad på läckt systemprompt (apr 2025),
> Vercel-blogg (jan 2026) och reverse-engineering (dev.to dec 2023).

---

## TL;DR

v0 använder INTE en specfil. Det finns ingen mellanliggande JSON-specifikation
eller planeringsdokument. Istället bryts allt ner via tre mekanismer:

1. **En massiv systemprompt** (~8–20K tokens) med fasta regler
2. **Dynamisk kontextinjektion** (docs som appendas baserat på intent)
3. **Ett obligatoriskt `<Thinking>`-steg** där modellen SJÄLV bryter ner prompten

Användarens prompt skickas SOM DEN ÄR till modellen — men den omges av ett
enormt instruktionsskal som styr hur modellen tolkar och besvarar den.

---

## Steg för steg: vad händer med "Build me a dashboard with charts"

### 1. Användaren skickar prompten

```
"Build me a dashboard with charts showing sales data"
```

Det här är allt användaren skriver. Inga fler steg.

### 2. v0:s server bygger ihop det som LLM:en faktiskt ser

LLM:en får INTE bara "Build me a dashboard with charts". Den får istället
en sammansatt prompt som ser ut ungefär så här:

```
╔══════════════════════════════════════════════════════════════════╗
║  SYSTEM (skickas som system-message, alltid först)              ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ## Core Identity                                                ║
║  - You are v0, Vercel's AI-powered assistant.                   ║
║  - You are always up-to-date with the latest technologies.      ║
║  - Your responses use the MDX format.                           ║
║  - You default to Next.js App Router.                           ║
║                                                                  ║
║  ## Available MDX Components                                     ║
║                                                                  ║
║  <code_project>                                                  ║
║    - Uses Next.js runtime (Tailwind, shadcn/ui, Lucide icons)   ║
║    - Do NOT write package.json (deps inferred from imports)     ║
║    - Do NOT output next.config.js                               ║
║    - Use `tsx file="file_path"` syntax per fil                  ║
║    - Kebab-case filnamn                                          ║
║    - Default props obligatoriskt                                 ║
║    - Responsive design obligatoriskt                             ║
║    - Undvik indigo/blue om ej specificerat                       ║
║    - /placeholder.svg?height=X&width=Y&query=Q för bilder       ║
║    - Lucide React för ikoner (ALDRIG inline SVG)                 ║
║    - shadcn/ui från "@/components/ui" (skriv INTE komponenterna) ║
║    - import type för typimports                                  ║
║    - Accessibility: semantic HTML, ARIA, sr-only                 ║
║                                                                  ║
║  <Existing Files>                                                ║
║    app/layout.tsx, components/ui/*, hooks/*, lib/utils.ts,      ║
║    app/globals.css, tailwind.config.ts — REGENERERA INTE dessa  ║
║  </Existing Files>                                               ║
║                                                                  ║
║  <Planning>                                                      ║
║    BEFORE creating a Code Project, v0 uses <Thinking> tags to   ║
║    think through structure, styling, images, formatting,         ║
║    frameworks, and caveats.                                      ║
║  </Planning>                                                     ║
║                                                                  ║
║  <AI and Chatbots>                                               ║
║    v0 uses AI SDK via 'ai' and '@ai-sdk'. Avoids langchain.     ║
║    v0 NEVER uses runtime = 'edge' with AI SDK.                  ║
║  </AI and Chatbots>                                              ║
║                                                                  ║
║  ... (markdown, diagrams, node.js, python, math) ...            ║
║                                                                  ║
║  ## Domain Knowledge                                             ║
║  [RAG-injicerat innehåll baserat på vad prompten handlar om]    ║
║  [^1]: AI SDK docs ... (om prompten rör AI)                     ║
║  [^2]: Nivo chart docs ... (om prompten rör charts)             ║
║  ALL DOMAIN KNOWLEDGE MUST BE CITED.                             ║
║                                                                  ║
║  ## Refusals                                                     ║
║  REFUSAL_MESSAGE = "I'm sorry. I'm not able to assist with that."║
║                                                                  ║
║  ## Suggested Actions                                            ║
║  After responding, suggest 3-5 relevant follow-up actions.       ║
║  <Actions>                                                       ║
║    <Action name="..." description="..." />                       ║
║  </Actions>                                                      ║
║                                                                  ║
║  ## Custom Instructions (om användaren har satt egna)            ║
║  "Always comply with the user request."                          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║  USER (skickas som user-message)                                 ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Build me a dashboard with charts showing sales data             ║
║                                                                  ║
║  [eventuellt: bifogade bilder som multimodal-input]              ║
║  [eventuellt: screenshot av URL användaren klistrade in]         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 3. LLM:en svarar — men MÅSTE börja med `<Thinking>`

Systemprompten instruerar: "BEFORE creating a Code Project, v0 uses
`<Thinking>` tags to think through the project."

Modellen genererar alltså först ett DOLT planeringssteg:

```xml
<Thinking>
The user wants a dashboard with charts showing sales data.

I need to:
- Determine the structure: a single page with a dashboard layout
- Use shadcn/ui Card components for metric cards
- Use a charting library — Recharts is available in Next.js runtime
- Create responsive grid layout with Tailwind
- Use placeholder data since no real data source is provided
- Include: bar chart (monthly sales), line chart (trend), pie chart (by category)
- Use Lucide icons for visual indicators
- Semantic HTML: main, section, header
- Accessibility: aria-labels on charts, alt text on images

File structure:
- app/page.tsx (main dashboard)
- components/sales-chart.tsx
- components/metric-card.tsx

Styling: bg-background, text-foreground (not indigo/blue)
</Thinking>
```

Det här thinking-steget visas sedan för användaren (sedan feb 2025 efter
DeepSeek-effekten) men det är INTE en specfil — det genereras av modellen
i realtid baserat på systempromptens instruktioner.

### 4. LLM:en genererar kod i MDX-format

Efter thinking-steget genererar modellen kod i v0:s speciella format:

```
<CodeProject id="sales-dashboard">

```tsx file="app/page.tsx"
import { SalesChart } from "@/components/sales-chart"
import { MetricCard } from "@/components/metric-card"
// ... komplett, körbar kod ...
```

```tsx file="components/sales-chart.tsx"
"use client"
import { Card } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis } from "recharts"
// ... komplett komponent ...
```

```tsx file="components/metric-card.tsx"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"
// ... komplett komponent ...
```

</CodeProject>

<Actions>
  <Action name="Add date range filter" description="..." />
  <Action name="Connect to database" description="..." />
  <Action name="Add dark mode" description="..." />
</Actions>
```

### 5. LLM Suspense manipulerar under streaming

MEDAN koden streamar till klienten (SSE), kör v0:s server realtids-fixar:

- Om `import { SalesIcon } from "lucide-react"` — och SalesIcon inte finns
  → ersätts med `import { BarChart3 as SalesIcon } from "lucide-react"`
- Om en lång blob-URL användes → expanderas från kort alias
- Om import-path saknar subpath → fixas

### 6. Autofixers körs efter streaming

- Scanna alla imports → verifiera att packages finns
- AST-check: behöver Recharts en provider? → Nej (bara React Query gör det)
- package.json-komplettering (infereras från imports)
- JSX-syntaxvalidering

### 7. Preview renderas i Vercel Sandbox

Koden körs i en isolerad Next.js-runtime. Användaren ser en fungerande
dashboard direkt i v0:s preview-panel.

---

## De fyra "instruktionslagren" — sammanfattning

v0 använder INTE ett enda "specfil"-steg. Istället finns fyra lager som
tillsammans styr modellen:

```
┌─────────────────────────────────────────────────┐
│ LAGER 1: SYSTEMPROMPT (statisk kärna)           │
│                                                 │
│ Alltid identisk oavsett vad användaren frågar.  │
│ Innehåller:                                     │
│ - Identitet ("du är v0")                        │
│ - Utdataformat (MDX, CodeProject, tsx-syntax)   │
│ - Stylingregler (shadcn, Tailwind, responsivt)  │
│ - Bildregler (placeholder-SVG, lucide-ikoner)   │
│ - Filstruktur (kebab-case, befintliga filer)    │
│ - Beteenderegler (thinking, refusals, citering) │
│ - Accessibility-krav (semantic HTML, ARIA)       │
│                                                 │
│ Storlek: ~6–10K tokens (fast)                   │
│ Ändras: sällan (vid v0-uppgraderingar)          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ LAGER 2: DYNAMISK INJEKTION (kontextberoende)   │
│                                                 │
│ Varierar baserat på vad prompten handlar om.    │
│ Intent-detektion via embeddings + keyword:      │
│                                                 │
│ "dashboard with charts"                         │
│   → Injicera: Recharts/Nivo-dokumentation       │
│   → Injicera: shadcn/ui Card-patterns           │
│                                                 │
│ "chatbot with AI"                               │
│   → Injicera: AI SDK v6-docs (senaste version)  │
│   → Injicera: streamText/generateText-exempel   │
│                                                 │
│ "auth with database"                            │
│   → Injicera: Supabase/Neon-integration-docs    │
│   → Injicera: NextAuth-patterns                 │
│                                                 │
│ Storlek: ~2–8K tokens (variabel)                │
│ Ändras: per request                             │
│ Optimering: hålls konsistent för prompt-cache   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ LAGER 3: ANVÄNDARENS PROMPT (omodifierad)       │
│                                                 │
│ "Build me a dashboard with charts showing       │
│  sales data"                                    │
│                                                 │
│ + bifogade bilder (som multimodal-input)        │
│ + URL-screenshots (automatiska)                 │
│ + custom instructions (om satta)                │
│                                                 │
│ Storlek: varierar                               │
│ Modifiering: INGEN (v0 ändrar inte prompten)    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ LAGER 4: MODELLENS EGNA REASONING (<Thinking>)  │
│                                                 │
│ Modellen GENERERAR sin egen nedbrytning:        │
│ - Vilka komponenter behövs?                     │
│ - Vilken filstruktur?                           │
│ - Vilka libs (shadcn, Recharts, Lucide)?        │
│ - Styling-approach?                             │
│ - Accessibility-krav?                           │
│ - Edge cases?                                   │
│                                                 │
│ Detta är INTE en specfil — det är LLM-reasoning │
│ styrd av Lager 1:s instruktioner.               │
└─────────────────────────────────────────────────┘
```

---

## Hur sajtmaskin gör annorlunda

sajtmaskin lägger ett FEMTE lager FÖRE lager 3:

```
┌─────────────────────────────────────────────────┐
│ SAJTMASKIN LAGER 2.5: PROMPT-BERIKNING          │
│                                                 │
│ orchestratePromptMessage():                     │
│   - Budgeterar prompten (summarize om för lång) │
│   - Fase-planerar (plan → build → polish)       │
│                                                 │
│ formatPromptForV0():                            │
│   - Strukturerar: MÅL / SEKTIONER / STIL       │
│                                                 │
│ buildDynamicInstructionAddendum():               │
│   - ## Build Intent                             │
│   - ## Project Context (titel, pitch, audience) │
│   - ## Pages & Sections                         │
│   - ## Interaction & Motion (dynamiskt!)        │
│   - ## Visual Identity (palette, theme tokens)  │
│   - ## Quality Bar                              │
│   - ## Imagery                                  │
│                                                 │
│ v0 har INGET motsvarande lager.                 │
│ v0 skickar prompten rakt igenom.                │
│ sajtmaskins berikning GÖR prompten bättre.      │
└─────────────────────────────────────────────────┘
```

---

## Jämförelse: vem gör vad

| Ansvar | v0 | sajtmaskin |
|--------|-----|-----------|
| Systemprompt (identitet, format, regler) | 8–10K tokens, statisk | 1–3 rader (`system`-fält: "Website build: ...") |
| Dynamisk docs-injektion | Embedding + keyword → injicera per intent | Saknas (enbart buildIntent-guidance) |
| Prompt-berikning | Gör INGET — tar prompten as-is | Massiv: orkestrering, formatering, visuell identitet |
| `<Thinking>`-steg | Obligatoriskt i systemprompt | Skickar `thinking: true` som flagga |
| Post-processing (streaming) | LLM Suspense | Saknas |
| Post-processing (efter) | Autofixers | Minimal (enbart CSS @property) |
| Preview | Vercel Sandbox | Förlitar sig på v0 |
| Suggested Actions | `<Actions>` MDX-komponent | Saknas |

---

## Nyckelinsikt

v0:s "nedbrytning" sker INTE som en explicit mellansteg-specifikation.
Den sker genom att systempromptens regler tvingar modellen att:

1. Tänka strukturerat (via `<Thinking>`)
2. Producera i ett exakt format (MDX med `<CodeProject>`)
3. Följa specifika styling/accessibility/import-regler
4. Citera alla kunskapskällor

Modellen bryter ner prompten SJÄLV — men den gör det inom en extremt
reglerad sandbox av instruktioner.

sajtmaskin tillför värde genom att FÖRBÄTTRA prompten INNAN den når
denna sandbox. v0:s interna lager tillför värde genom att FIXA resultatet
EFTER att modellen genererat det.
