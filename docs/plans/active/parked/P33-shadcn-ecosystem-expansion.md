---
id: P33
status: paused
created: 2026-04-21
linear: null
paused: 2026-04-23
paused_by: OMTAG-2026-04-23
---

# P33 — shadcn-ekosystem-expansion

> **Paused 2026-04-23:** Parkerad per OMTAG-waven. Feature-breddning, inte kärnkonsolidering — vänta tills orchestrate.ts + route-plan.ts splittats. Se [`../avklarat/omtag-2026-04-23/PARKED.md`](../avklarat/omtag-2026-04-23/PARKED.md).

**Status:** Paused — väntar på agreement + kärnkonsolidering innan implementation.
**Skapad:** 2026-04-21.
**Triggad av:** SAJ-flödesrunda — användaren vill ha mer av shadcn-katalogen tillgängligt för codegen-LLM:en (idag ser den bara en delmängd) utan att bygga full MCP-integration.

---

## Problem

Sajtmaskin har 4 lager för shadcn-integration idag:

| Lager | Modul | Vad |
|---|---|---|
| Toolkit-summary | `src/lib/gen/data/shadcn-toolkit-summary.ts` | `## Your Toolkit`-block: lista över lokala `@/components/ui/*` filer + import-exempel, scaffold-fokuserad gruppering |
| Lokala exempel | `data/shadcn-examples/*.json` (33 filer) + `shadcn-example-loader.ts` | Hela JSON-snippets med kod, läses on-demand |
| Capability-map | `shadcn-example-map.ts` | `InferredCapabilities` + regex → exempelnamn (max 8 per request) |
| Community-fetch | `community-registry-fetch.ts` + `config/community-registries.json` | 3 registries (`@shadcnblocks`, `@tailark`, `@magicui`), fetchar 3 block/request, skriver om imports |

**Gap mot shadcn:s katalog ([ui.shadcn.com](https://ui.shadcn.com/)):**

- shadcn har ~60 komponenter; sajtmaskin har **lokala exempel för ~10-15** av dem (chart, calendar, command, combobox, carousel, table, form, auth, sidebar, dashboard).
- Komponenter UTAN egna exempelfiler trots att de är vanliga: `accordion`, `alert`, `alert-dialog`, `navigation-menu`, `menubar`, `tabs`, `drawer`, `sheet`, `dialog`, `dropdown-menu`, `select`, `slider`, `switch`, `tooltip`, `skeleton`, `pagination`, `resizable`, `scroll-area` m.fl.
- shadcn:s **Blocks**-katalog (kompletta sektioner som login forms, dashboards, marketing) är inte separat representerad utöver chart-/auth-/dashboard-exemplen.
- shadcn:s **Directory** ([https://ui.shadcn.com/docs/directory](https://ui.shadcn.com/docs/directory)) listar fler community-registries än våra 3.
- **Ingen embedding-baserad retrieval** för shadcn-exempel — bara regex/keyword-mapping.
- **`llms.txt`** ([https://ui.shadcn.com/llms.txt](https://ui.shadcn.com/llms.txt)) är ett strukturerat AI-index över shadcn — vi använder det inte som källa för synk.

**MEN:** vi vill INTE bygga full shadcn-MCP idag (kräver runtime-tool-API i codegen-stream + sandbox + agent-loop). Det är en separat, större insats.

---

## Föreslagen utbyggnad — 4 lager, säkra steg

### Fas A — Fyll capability-luckorna i `data/shadcn-examples/` (low risk, high impact)

Lägg till 15-20 nya `data/shadcn-examples/<name>.json`-filer för komponenter som har hög efterfrågan men inga exempel idag. Prioritetsordning (efter sannolikhet att de behövs):

1. `tabs-default.json`
2. `accordion-default.json`, `accordion-multiple.json`
3. `dialog-default.json`, `alert-dialog-confirm.json`
4. `sheet-side.json`, `drawer-vaul.json`
5. `dropdown-menu-default.json`, `context-menu-default.json`
6. `popover-default.json`, `tooltip-default.json`
7. `select-default.json`, `slider-default.json`, `switch-default.json`
8. `pagination-default.json`, `breadcrumb-default.json`
9. `skeleton-default.json`, `scroll-area-default.json`

**Källa:** ladda från shadcn:s registry direkt (`https://ui.shadcn.com/r/styles/new-york/<name>.json` eller equivalent från llms.txt-länkarna). Cacha lokalt så inga runtime-fetches.

**Effekt:** LLM:en får konkreta mönster att kopiera istället för att hallucinera shadcn-API:t.

### Fas B — Bredda capability-mapping (`shadcn-example-map.ts`)

Lägg till nya capability-keys (eller utvidga befintliga regex):

| Ny capability | Trigger keywords | → Exempel |
|---|---|---|
| `needsTabs` | "tabs", "flikar", "tab navigation" | `tabs-default` |
| `needsAccordion` | "accordion", "expandable", "FAQ" | `accordion-multiple` |
| `needsDialog` | "modal", "dialog", "popup", "popover" | `dialog-default`, `alert-dialog-confirm` |
| `needsDrawer` | "drawer", "side menu", "mobile menu" | `sheet-side`, `drawer-vaul` |
| `needsTooltip` | "tooltip", "hint", "info on hover" | `tooltip-default` |
| `needsPagination` | "pagination", "next page", "sidor" | `pagination-default`, `breadcrumb-default` |

**Effekt:** Capability-driven exempel matchar fler real-world prompts.

### Fas C — Utöka `config/community-registries.json` med fler verifierade registries

Från shadcn:s [Directory](https://ui.shadcn.com/docs/directory), lägg till 3-5 verifierade community-registries (samma URL-mönster `{name}.json`). Kandidater att utvärdera:

- `@aceternity` (aceternity.com — stora animations-blocks)
- `@21st-dev/react-bits` (välsignade interaktiva mönster)
- `@originui` (origin.ui — utility-rika components)

**Säkerhet:** verifiera registry-format och rewrite-kompatibilitet innan inkludering. Per-registry `maxPerGeneration` capping behåller token-budgeten.

### Fas D — Embedding-driven exempel-retrieval (opt-in)

Ersätt regex/keyword-mapping för shadcn-exempel med embedding-baserad retrieval (samma pattern som scaffold-variants):

1. Pre-compute embeddings för alla `data/shadcn-examples/*.json` titles + descriptions → `data/shadcn-example-embeddings.json` (build-time script).
2. I orchestrate.ts, embed `prompt + brief.requestedCapabilities` → cosine similarity → top-K exempel.
3. Fallback till befintlig regex-mapping om OpenAI key saknas eller embedding-API failar.

**Risk:** medel — kräver build-time script + runtime embedding-call (~$0.0001/request). Kan stängas av via `FEATURES.useShadcnEmbeddings`.

**Effekt:** Mer relevanta exempel även för prompts som inte träffar regex (svenska prompts, ovanlig terminologi).

### Fas E — `llms.txt`-synk-script (build-time validation)

Kör ett build-time script (eller GitHub Action) som hämtar [https://ui.shadcn.com/llms.txt](https://ui.shadcn.com/llms.txt), parsar listan av komponenter, och flaggar mismatch mot:

- `SHADCN_COMPONENTS` (catalog)
- `data/shadcn-examples/` (täckning)

Output: `docs/reports/shadcn-coverage.md` med "X komponenter saknar exempel: tabs, accordion, …". Inget runtime-beroende, bara observability.

---

## Vad vi INTE gör i denna plan

- ❌ Full shadcn-MCP-integration (kräver runtime-tool-API + sandbox + agent-loop) — separat större insats
- ❌ On-demand fetch av shadcn-komponenter under generering — för osäker timing/kostnad
- ❌ Auto-install via shadcn CLI i prod-VM — kräver sandbox

---

## Steg-ordning

| Fas | Risk | Tid | Beroende |
|---|---|---|---|
| **A** (fyll luckor) | Låg | ~2h | Inga |
| **B** (bredda mapping) | Låg | ~1h | A levererad |
| **C** (fler community-registries) | Låg-medel | ~1h + per-registry-QA | Inga |
| **D** (embedding-retrieval) | Medel | ~3h | A levererad |
| **E** (llms.txt-synk) | Låg | ~1h | Inga |

**Rekommenderad första tagning:** A + B (~3h totalt, låg risk, direkt synlig effekt på LLM-output).

---

## Open questions

1. Ska Fas A inkludera shadcn:s `Blocks`-katalog (kompletta sektioner) eller bara primitiv-demos? Förslag: bara primitiv-demos i Fas A; Blocks blir Fas A2.
2. Vilka community-registries är säkra att inkludera utan manuell granskning? Förslag: inga — kör manuell QA per registry oavsett storlek.
3. Embedding-modellen för Fas D — `text-embedding-3-small` (samma som scaffold-variants)? Förslag: ja, för konsistens.

---

## Påminnelse om relaterade beslut

- Fas D (embedding-retrieval) är beroende av att Fas A levereras först (annars finns inget värdefullt att embedding-mappa).
- Om P32 (request-type-taxonomy) går vidare är det en gratis vinst att returnera Q&A om "vilka komponenter finns?" via llms.txt-synken (Fas E) istället för att tunga LLM-en med hela katalogen.
