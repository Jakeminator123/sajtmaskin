# Plan 05: Dynamisk kontextinjektion

> Prioritet: MEDEL — förbättrar kodkvalitet markant
> Beroenden: Inga (oberoende av övriga planer)
> Insats: 5-7 dagar

## Problemet

Systempromptens statiska kärna (`STATIC_CORE`) listar shadcn-komponenter och grundregler, men injicerar ingen kontextuell dokumentation baserat på vad användaren frågar om. v0 gör detta med embedding-baserad sökning i en docs-databas.

Exempel: Om användaren ber om "en dashboard med charts" borde systempromptens dynamiska del innehålla:
- Hur man använder Recharts med shadcn/ui
- shadcn/ui Chart-komponentens API
- Exempel på responsive dashboard-layout

## Lösning

Bygg en lokal kunskapsbas (JSON) med docs-snippets. Vid varje prompt: keyword-matcha och injicera de mest relevanta snippets.

## Nya filer att skapa

### `src/lib/gen/data/docs-snippets.json`

JSON-fil med ~100-150 kunskaps-snippets, kategoriserade:

```json
[
  {
    "id": "shadcn-card",
    "category": "shadcn",
    "keywords": ["card", "kort", "panel", "container", "box"],
    "title": "Card Component",
    "content": "Import: { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'\n\nUsage pattern:\n<Card>\n  <CardHeader>\n    <CardTitle>Title</CardTitle>\n    <CardDescription>Description</CardDescription>\n  </CardHeader>\n  <CardContent>Content here</CardContent>\n  <CardFooter>Footer actions</CardFooter>\n</Card>"
  },
  {
    "id": "nextjs-dynamic-routes",
    "category": "nextjs",
    "keywords": ["route", "dynamic", "params", "slug", "page"],
    "title": "Dynamic Routes in App Router",
    "content": "Create dynamic routes with [param] folders:\n- app/blog/[slug]/page.tsx\n- Access params: export default function Page({ params }: { params: { slug: string } })\n- Generate static params: export function generateStaticParams()"
  }
]
```

Kategorier:
- `shadcn` — Alla ~50 shadcn/ui-komponenter med import + usage
- `nextjs` — App Router-mönster (routing, layouts, loading, error, metadata)
- `tailwind` — Vanliga mönster (responsive, dark mode, animations, gradients)
- `patterns` — Designmönster (dashboard, landing page, auth, forms, navigation)
- `lucide` — Ikonkategorier (navigering, social, e-commerce, status)

### `src/lib/gen/context/knowledge-base.ts`

Söker i kunskapsbasen och returnerar relevanta snippets.

```typescript
interface KBMatch {
  id: string;
  title: string;
  content: string;
  score: number;
}

interface KBSearchOptions {
  query: string;
  maxResults?: number;    // default: 5
  maxTokens?: number;     // default: 2000
  categories?: string[];  // filter by category
}

function searchKnowledgeBase(options: KBSearchOptions): KBMatch[]
```

Implementation:
1. Ladda snippets från `docs-snippets.json` (cacheade i minnet)
2. Tokenisera query till keywords (lowercase, split whitespace, remove stopwords)
3. Scora varje snippet:
   - +3 per exakt keyword-match i snippet.keywords
   - +1 per partiell match (substring)
   - +0.5 per match i snippet.title
   - +0.2 per match i snippet.content
4. Sortera efter score, ta top-N
5. Trimma till maxTokens

### `src/lib/gen/context/stopwords.ts`

Lista med svenska och engelska stoppord att filtrera bort vid sökning:
```typescript
const STOPWORDS = new Set([
  "en", "ett", "och", "med", "som", "för", "att", "jag", "vill",
  "a", "an", "the", "and", "with", "for", "that", "this", "is",
  "create", "make", "build", "generate", "add", "website", "page",
]);
```

## Filer att modifiera

### `src/lib/gen/system-prompt.ts`

I `buildDynamicContext()`:

```typescript
// Efter befintlig brief/theme/media-injektion:
const kbMatches = searchKnowledgeBase({
  query: originalPrompt || "",
  maxResults: 5,
  maxTokens: 2000,
});

if (kbMatches.length > 0) {
  parts.push("## Relevant Documentation", "");
  for (const match of kbMatches) {
    parts.push(`### ${match.title}`, "", match.content, "");
  }
}
```

### `BuildSystemPromptOptions` (i system-prompt.ts)

Lägg till `originalPrompt?: string` om det inte redan finns (behövs för KB-sökningen).

## Kunskapsbasens innehåll (prioriterat)

1. **shadcn/ui** (50 snippets): Varje komponent med import, props, usage-exempel
2. **Layout-mönster** (15 snippets): Hero, sidebar, dashboard, grid, masonry, split
3. **Next.js** (15 snippets): Routing, metadata, loading, error, server/client components
4. **Tailwind** (15 snippets): Responsiv design, animationer, gradients, dark mode
5. **Formulär** (10 snippets): Form validation, react-hook-form, server actions
6. **Interaktivitet** (10 snippets): State management, modals, drawers, toasts

## Acceptanskriterier

- [ ] `docs-snippets.json` med minst 80 snippets
- [ ] `searchKnowledgeBase()` returnerar relevanta resultat
- [ ] Keyword-matchning fungerar för svenska och engelska
- [ ] Max 2000 tokens injiceras (inte spränger kontextfönstret)
- [ ] Dynamisk kontext inkluderar relevanta docs i systemprompt
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
