# Generation Data (partially cursorignored)

Knowledge base + prompt support. Parent: [`../README.md`](../README.md). **Inbäddningar** for docs KB: `docs-embeddings.json` + `context/semantic-search.ts` (see `.cursor/rules/terminology.mdc` § embeddings vs semantics).

## Cursorignored files

| File | Size | What it is |
|------|------|-----------|
| `docs-embeddings.json` | ~4 MB | OpenAI vectors for `docs-snippets.ts` entries. Used by `context/semantic-search.ts`. |

## Indexed files

| File | What it does |
|------|-------------|
| `docs-snippets.ts` | Knowledge base: ~50 categorized snippets covering shadcn components, Tailwind patterns, libraries (Recharts, Framer Motion, React Three Fiber, Embla, TanStack Table), and code examples. Searched per-request and injected as "Relevant Documentation". |
| `shadcn-components.ts` | Component metadata for the shadcn/ui registry. |
| `lucide-icons.ts` | Icon name lookup data. |

## Knowledge base search flow

1. `system-prompt.ts` calls `searchKnowledgeBaseAsync({ query: originalPrompt })`
2. `context/knowledge-base.ts` does keyword + semantic search against `docs-snippets.ts`
3. Top 7 matches injected as "Relevant Documentation" in system prompt

## Gap: what the KB currently covers vs what it doesn't

Covered: shadcn/ui components, Tailwind animations, Recharts, Framer Motion,
React Three Fiber basics, Embla Carousel, TanStack Table, date-fns, Sonner,
Next.js patterns, OG images, fonts, i18n.

Not covered: physics engines (@react-three/cannon, @react-three/rapier),
advanced Three.js (shaders, GLTF loading, post-processing), map libraries
(Leaflet, Mapbox), video players, rich text editors, WebSocket patterns.
