# Scaffolds-spåret — vad som är kvar

Commits hittills:
- `11c621881` scaffolds 1/3 — v1: env-flagga, scaffold-ankrad template guidance, backoffice-toggle, tester, docs
- `0985b8ae1` scaffolds 2/3 — v1.5: prompt-aware reranking, e2e-bevistester, registry-kommentar, glossary
- `396102aca` scaffolds 3/3 — Next.js version bump (16.2.1→16.2.3), testrapport
- `3610203fc` fix: phase 2/3 consolidation (annan agent) — trim prompt overlap, linearize client flow
- `<denna commit>` fix: generation gaps — template guidance persist, route dedup, env encryption graceful, image debug

## Åtgärdat i denna commit

1. ~~**Contract gate äter init-banan**~~ — ÅTGÄRDAT. `isFirstCodeGeneration` skickas från
   `chat-message-stream-post.ts` till `resolveTemplateGuidance` så att template guidance
   aktiveras även när `generationMode` löses till `"followUp"` p.g.a. persistedScaffoldId.

2. ~~**Route-dubbletter (literal vs dynamisk)**~~ — ÅTGÄRDAT.
   - `project-sanity.ts`: ny check (sektion 8) detekterar `product/id/` vs `product/[id]/`.
   - `finalize-preflight.ts`: `removeLiteralRouteDuplicates()` filtrerar bort literal-versioner
     automatiskt innan `buildCompleteProject`.

3. ~~**`ENV_VAR_ENCRYPTION_KEY` krasch**~~ — ÅTGÄRDAT. `project-env-vars.ts` degraderar
   gracefully: lagrar plaintext med `console.warn` istället för att kasta 500 vid saknad nyckel.

4. ~~**Tyst bildmaterialisering**~~ — ÅTGÄRDAT. `image-materializer.ts` loggar nu via `warnLog`
   (alltid synlig i dev) istället för `debugLog` när Unsplash-nyckel saknas.

## Kvar att göra (prioritetsordning)

### Hög prioritet

1. **Import-disciplin i genererad kod**
   38 av 72 autofix var saknade imports. Bör stärkas i systemprompt (`## Import Rules`)
   eller i autofix-pipeline (mekanisk import-komplettering).

2. **Thinking-routing** (issue #1 i acute-generation-issues.md)
   Thinking var av trots `SAJTMASKIN_DEFAULT_THINKING=true`. Undersök varför.
   Den andra agenten har dokumenterat detta.

### Medel prioritet

3. **Cart-provider cross-file-kedja** (issue #2 + #4 i acute-generation-issues.md)
   LLM:en missar konsekvent att wrappa `<CartProvider>` i root layout och att importera
   `useCart`/`StoreProduct` i konsumentfiler. Den andra agenten arbetar med detta.

4. **Unsplash-nyckel saknas i `.env.local`**
   Bildmaterialisering hoppar över allt utan `UNSPLASH_ACCESS_KEY`. Loggen visar nu tydligt
   varför, men nyckeln behöver sättas för att bilder ska materialiseras.

### Låg prioritet / framtida

5. **Template guidance v1.75** — ev. små selectedFiles-excerpts (layout/section-nära)
6. **Template guidance v2** — ev. global template-library search i runtime
7. **WSS/HMR till Fly** — WebSocket-proxy tappar connection
8. **Hydration error overlay** — pre-existerande på landningssidan
9. **`rocket-logo.webp` preload** — ofarlig varning
