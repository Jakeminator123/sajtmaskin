# shadcn Component Enrichment — 3 steg

Status: **steg 1 redo att köra**
Skapad: 2026-04-14

## Bakgrund

Genererings-LLM:en vet vilka shadcn-primitiver som finns (`## Your Toolkit`, 55 lokala UI-filer, 322 exportsymboler) men har väldigt få konkreta **kodexempel** att luta sig mot. Exempelcachen (`data/shadcn-examples/`) har 11 filer — bara bar chart, area chart, combobox, calendar, carousel, sidebar, datatable och input-form. Det saknas helt:

- Alla radial/pie/radar/line chart-varianter (60+ blocks i registret)
- Auth-blocks (login, signup, OTP)
- Interaktiva chart-tooltips
- Fler sidebar-varianter och app shells

shadcn-ekosystemet har:
- **Officiella registret:** 97 blocks, 230 examples, 56 ui-komponenter
- **172 community-registries:** ~10 000+ items (t.ex. @shadcnblocks 2640 blocks, @magicui 231 animerade effekter)

Allt är tillgängligt via vanlig HTTP JSON, utan MCP-protokoll.

Stackkompatibilitet verifierad: genererade sajter använder Next.js 16, React 19, Tailwind v4, recharts, embla, react-day-picker, react-hook-form, radix-ui — alla versioner matchar `SHADCN_FALLBACK_VERSIONS` i `dependency-utils.ts` och `package.json`.

---

## Steg 1 — Bredda lokal exempelcache + capability-mappning

**Vad:** Utöka `EXAMPLES_TO_FETCH` i sync-scriptet från 11 till ~35 items. Utöka `getRelevantExampleNames()` med fler capability-kopplingar. Höj max från 5 till 8.

**Nya exempel att lägga till:**

Charts (fylla alla varianter):
- `chart-radial-simple`, `chart-radial-text`, `chart-radial-stacked`
- `chart-pie-simple`, `chart-pie-donut`, `chart-pie-interactive`
- `chart-radar-default`, `chart-radar-multiple`
- `chart-line-default`, `chart-line-interactive`, `chart-line-multiple`
- `chart-area-interactive`, `chart-area-stacked`
- `chart-tooltip-default`

Auth:
- `login-01`, `login-04`
- `signup-01`

App shell / navigation:
- `sidebar-01`, `sidebar-10`
- `dashboard-01`

**Nya capability-mappningar:**

| Capability | Nya exempel |
|------------|-------------|
| needsCharts | + chart-line-default, chart-pie-simple, chart-radial-simple, chart-area-interactive |
| needsAuth | + login-01 |
| needsAppShell | + dashboard-01 |
| needsEcommerce | (inga bra officiella blocks, väntar till steg 3) |

**Filer som ändras:**
- `scripts/shadcn/sync-shadcn-examples.ts` — utökad `EXAMPLES_TO_FETCH`
- `src/lib/gen/data/shadcn-example-map.ts` — fler mappningar, max höjt till 8
- `data/shadcn-examples/` — ~25 nya JSON-filer (genererade av sync)

**Risk:** Noll arkitekturändring. Samma pipeline.
**Insats:** ~30 min.

---

## Steg 2 — On-demand registry fetch under orkestrering

**Vad:** Ny modul `src/lib/gen/data/shadcn-registry-fetch.ts` som gör HTTP-anrop mot `ui.shadcn.com/r/styles/new-york-v4/{name}.json` under `resolveOrchestrationBase()`. Lokal cache som fallback. Max 3 items per generation, 2s timeout.

**Flöde:**
```
inferCapabilities(prompt)
  → getRelevantExampleNames(caps)        // lokal cache (steg 1)
  → fetchRegistryReferences(caps, prompt) // ny: HTTP mot live-registret
  → merge → componentReferences
```

**Ny modul:**
- `src/lib/gen/data/shadcn-registry-fetch.ts`
  - `fetchRegistryExample(name: string): Promise<ComponentReference | null>`
  - `fetchRelevantRegistryExamples(caps, prompt): Promise<ComponentReference[]>`
  - Timeout 2s per fetch, max 3 per generation
  - Rewrite-logik (samma som sync-scriptet) för imports
  - In-memory LRU-cache (5 min TTL) så samma komponent inte hämtas om igen

**Filer som ändras:**
- `src/lib/gen/orchestrate.ts` — anropa `fetchRelevantRegistryExamples` efter lokal laddning
- `src/lib/gen/data/shadcn-registry-fetch.ts` — ny fil
- `src/lib/gen/data/shadcn-example-map.ts` — ny export `getRegistryFetchNames()` för items som inte finns lokalt

**Risk:** Nätverkslatens (2s timeout skyddar). Fallback till lokal cache.
**Insats:** ~2-3 timmar.

---

## Steg 3 — Community-registry-integration (kräver curation)

**Vad:** Kurerad lista av "trygga" community-registries. Orchestratorn kan söka i deras index och hämta specifika block-items.

**Kandidater att auditera:**
- `@shadcnblocks` — 2640 blocks (about, hero, pricing, features, CTA, footer, testimonials, FAQ, auth, blog, e-commerce...)
- `@magicui` — 231 animerade effekter (marquee, bento grid, particles, shimmer, number ticker...)
- `@fonttrio` — kurerade fontpar (kan ersätta manuella fontPairings i scaffold variants)
- `@launchui` — landing page components
- `@commercn` — e-commerce blocks
- `@prompt-kit` / `@assistant-ui` — AI chat-blocks

**Vad som behöver lösas:**
1. **Kompatibilitetsaudit:** Varje registry måste auditas mot vår stack (Next.js 16, React 19, Tailwind v4, radix-ui monorepo, `@/components/ui/*` alias).
2. **Import-rewriting:** Community-registries kan ha annorlunda sökvägar.
3. **Dependency-gate:** Nya beroenden från community-items måste passera samma `SHADCN_FALLBACK_VERSIONS` + `dependency-utils.ts`-kedja.
4. **Token-budget:** 2640 blocks i index = för stort att injicera. Vi behöver smart sökning (keyword/embedding) mot registry-index.

**Din lokala mapp med alla repos:** Användbar för curation/audit — inte som runtime-källa. Vi kan köra ett audit-script som traverserar varje registry och validerar stackkompatibilitet.

**Risk:** Medel–hög. Kräver audit + testning.
**Insats:** 1-2 dagar.

---

## Ordning

1. **Steg 1** → /avslutning → commit + push
2. **Steg 2** → /avslutning → commit + push
3. **Diskussion** om steg 3 strategi och audit-process
