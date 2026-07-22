---
status: active
owner: unassigned
created: 2026-07-22
topic: shadcn-registry-konsolidering + "Beskriv"-driven UI-komposition (Composer-ytan) — semantisk sökning över riktiga register, funktionell insättning via own-engine/verify, och byggbart eget @sajtmaskin-register
source: Kodläsning + shadcn-docs-verifiering 2026-07-22 (explore-subagenter, WebFetch mot ui.shadcn.com/docs/{registry/mcp,helpers/ai-sdk,react/message-scroller}, WebSearch mot shadcn/registry-API) + extern coach-granskning av commit 83ce3472 + ägarens observationer om Composer-ytan
---

# shadcn-registry + "Beskriv"-komposition

## Mål och syfte

**Mål:** Gör builderns "Composer"-yta till en semi-automatisk kompositionsyta där användaren
antingen (a) **bläddrar** ett visuellt galleri av riktiga shadcn-block/UI Recipes eller
(b) **beskriver** i fritext vad de vill ha ("en stapelbar med tre staplar som mäter
försäljning") och en agent hittar bästa matchande registry-post, som sedan sätts in i
**den aktuella användarsajten på ett garanterat funktionellt sätt**.

**Syfte / varför:**

1. **Utnyttja det som redan finns.** Sajtmaskin har redan ~60–70 % av maskineriet (registry-fetch,
   sync, health, import-/dep-validering, `resolveShadcnUiRecipes`, shadcn MCP för Cursor). Bygg
   inte ett andra parallellt system — **konsolidera och lyft** det befintliga.
2. **Stäng funktionsgapet.** Dagens Composer har bara 8 hårdkodade, beroendefria JSX-block just
   för att de är säkra att klistra in rakt av. Riktiga shadcn-block drar med sig imports,
   `dependencies` och `registryDependencies` — de blir **inte** funktionella av en rå patch.
3. **Semantisk träff, inte substring.** shadcn:s `searchRegistries` är fuzzy på namn/beskrivning,
   inte semantisk (verifierat: hel mening → 0 träffar, `login` → 7 träffar). En LLM måste
   översätta mening → sökord → ranka verkliga träffar.

## Kärnprincip (invariant som styr hela planen)

> **En insatt UI Recipe måste kompilera och rendera i exakt den genererade användarsajten.**

Därför får insättning av registry-innehåll **aldrig** vara en rå filpatch. Den ska gå genom
samma kedja som redan gör recipes funktionella vid generering:
`rewriteRegistryImports` → alias-scope → `dep-completer` (deps + `registryDependencies` +
saknade ui-primitiver) → injektion som recipe i en **own-engine-turn** → `Normalize` →
`RepairGate` → `RenderGate`/verifier → ny version + preview. Detta är den enda
arkitektoniskt tvingande regeln i planen.

## Nuläge (verifierat mot kod 2026-07-22)

| Byggsten | Var | Status |
|---|---|---|
| shadcn MCP (Cursor/dev) | `.cursor/mcp.json.example` → `scripts/cursor/shadcn-mcp.cmd` (`npx -y shadcn@latest mcp`) | Finns — men opinnad |
| Registry-fetch (index/item, style-fallback, cache) | `src/lib/shadcn/registry-service.ts`, `registry-url.ts`, `registry-cache.ts` | Aktiv runtime |
| Registry-proxy-routes | `src/app/api/shadcn/registry/{index,item,refresh}/` | Aktiv |
| Sync + health | `scripts/shadcn/{sync-shadcn-registry.ts,registry-health.ts}` (`shadcn:sync`, `shadcn:health`) | Aktiv |
| Import-/dep-repair | `registry-utils.ts` (`rewriteRegistryImports`), `src/lib/gen/autofix/{import-validator,dep-completer}.ts` | Aktiv |
| Recept-resolver (mening → recipe) | `src/lib/gen/data/shadcn-ui-recipes.ts` (`resolveShadcnUiRecipes`) | Aktiv — men hårdkodade kandidater |
| Community-register | `config/community-registries.json` (@shadcnblocks, @tailark, @magicui) | Separat fil, ej i `components.json` |
| Galleri-DATA (kategorier, curated, featured) | `registry-service.ts` (`CURATED_UI_COLLECTIONS`, `FEATURED_BLOCKS`, `getBlocksByCategory`) | **Finns men vilande** — konsumeras bara av `runtime-library-audit.ts`, inget builder-UI |
| Composer-yta (8 block) | `src/lib/builder/page-blocks-catalog.ts`, `preview-panel/PreviewPanelComposer.tsx`, `page-block-patch.ts` | Aktiv MVP, rå patch top/bottom, annars AI-fallback |
| Inspect-brygga (placering) | `inspect-bridge-*.ts`, `usePreviewInspectBridge.ts`, `sectionAnalyzer.ts` | Flagg-gated, brygga (ingen worker) |
| Builder-chat-scroll | `src/components/ai-elements/conversation.tsx` | Egen enkel scroll |

**Externt verifierat:** shadcn:s program-API `shadcn/registry` (`getRegistries`,
`searchRegistries`, `getRegistryItems`, `resolveRegistryItems`) existerar och är den stabila,
dokumenterade vägen. `@shadcn/react` (MessageScroller) och `@shadcn/helpers/ai-sdk` finns men
är **inte** installerade i `package.json` idag.

## Målbild (arkitektur)

```text
                 ┌───────────────────────────── "Lägg till"-yta (döpt om från Composer) ─────────────────────────────┐
   Bläddra-flik ─┤ galleri: CURATED_UI_COLLECTIONS/FEATURED_BLOCKS + thumbnails (registry PNG)                        │
   Beskriv-flik ─┤ fritext → /api/shadcn/describe                                                                     │
                 └───────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                                  │ vald kandidat
   /api/shadcn/describe:  mening → LLM (query) → searchRegistries → LLM-rankning 5–10 → kandidater + preview + meta
                                                                  │
                                            ┌─────────────────────▼─────────────────────┐
                                            │  Insättnings-lane (KÄRNPRINCIPEN)          │
                                            │  getRegistryItems → rewriteImports →       │
                                            │  dep-completer → own-engine recipe-turn →  │
                                            │  Normalize → RepairGate → RenderGate       │
                                            └─────────────────────┬─────────────────────┘
                                                                  ▼
                                                    ny version + preview (funktionell)

   components.json  = KANONISK registry-config (@shadcn + @magicui/@tailark/@shadcnblocks + framtida @sajtmaskin)
                      → delas av Cursor MCP · resolver · /describe · sync/health
```

## Nedbrytning i faser (delmoment + parallellt vs sekventiellt)

Legend: **[S]** = ligger på kritisk väg (sekventiellt), **[P]** = kan köras parallellt.

### Fas 0 — Grund & konsolidering  · låg risk · additiv
- **[P]** Versionspinna shadcn: `npx shadcn@4.13.1 mcp` i wrapper + config (ta bort `@latest`-drift).
- **[P]** `components.json` → kanonisk `registries`-nyckel (@shadcn + @magicui/@tailark/@shadcnblocks). Behåll `community-registries.json` som seed tills resolvern läser `components.json`.
- **[S] Spike:** kan `shadcn/registry`-program-API köras i en Next 16 server-route (bundle, `server-only`, ESM, ev. Commander-deps)? Beslut: program-API vs fortsatt HTTP-fetch. **Grindar Fas 1 & 4.**

### Fas 1 — Discovery-lager ("Beskriv"-backend)  · additiv · flagg-gated
- **[S]** `/api/shadcn/describe`: mening → LLM skriver sökfråga(or) → `searchRegistries`/HTTP → LLM rankar 5–10 verkliga träffar → returnerar `{name, registry, description, previewLight/Dark, dependencies, registryDependencies, addCommand}`. **Skriver inget till användarsajten.**
- **[P]** No-results-robusthet (mening→0 träffar → förenkla query, retry).
- **[P]** TS-paritet med coachens Python-PoC (`shadcn_sentence_picker.py`) som dev-verktyg/eval.

### Fas 2 — Funktionell insättnings-lane  · SVÅRAST · rör preview/verify
- **[S] v1 (säker):** vald kandidat → välformad prompt via **befintliga** `sendMessage`/AI-fallback (samma som Composer använder) → own-engine genererar + verifierar. Uppfyller kärnprincipen utan ny lane.
- **[S] v2 (deterministisk):** dedikerad lane — `getRegistryItems` → `rewriteRegistryImports` + alias-scope → `dep-completer` utökad för `registryDependencies` + saknade ui-primitiver → recipe-injektion i own-engine-turn → `Normalize`/`RepairGate`/`RenderGate` → ny version.
- **[P]** Fel/degraderingsyta när verify faller (Advisory, ej false-green).

### Fas 3 — UI: "Lägg till"-yta (döp om Composer)  · frontend
- **[P]** Bläddra-flik: väck `CURATED_UI_COLLECTIONS`/`FEATURED_BLOCKS` som galleri m. thumbnails (kan börja **innan** Fas 1, datan finns).
- **[S]** Beskriv-flik: fritext → `/api/shadcn/describe` → rankade kort → välj → Fas 2-lane. (Beror på Fas 1+2.)
- **[P]** Drag-n-drop: återanvänd inspect-brygga + `sectionAnalyzer` för placering; sökning + "senast använda".
- **[P]** Copy/terminologi: "Composer" → "Lägg till", håll isär från Byggblock (dossiers).

### Fas 4 — Konsolidera resolver  · RÖR SKYDDAD PIPELINE · egen PR
- **[S]** Byt `buildCandidates` hårdkodade kandidater (`login-03`, `dashboard-01`, …) → `searchRegistries`-driven kandidatgenerering. Behåll capability-signaler som **input** till query.
- **[S]** Eval-regressionsgrind: init/follow-up-generering får inte försämras.

### Fas 5 — Builder-chat (fristående spår)  · helt parallelliserbart
- **[P]** Installera `@shadcn/react`; ersätt `conversation.tsx`-scroll med `MessageScroller` (streaming utan hopp, anchor, bevarad läsposition, scroll-to-bottom).
- **[P]** `@shadcn/helpers/ai-sdk` för deterministiska chat-strömtester (reasoning/tool-calls/sources/F2-F3-continuation) — test/demo, ej prod-modell.
- **[P]** Ta in nya chat-komponenter (attachment, bubble, marker, message, message-scroller) kontrollerat i `SHADCN_COMPONENTS`.

### Fas 6 — Eget @sajtmaskin-register  · långsiktigt · sist
- **[P]** Kurera verifierade block (hero, pricing, dashboards, auth, booking, ai-chat, e-handel, integration-mocks) i ett internt shadcn-kompatibelt register med `dependencies`/`registryDependencies`/redan verifierad kod.
- **[S]** Lägg registret i `components.json` → MCP + resolver + Beskriv använder samma källa automatiskt.

## PR-mappning (allt mot `master`) — leveransstatus 2026-07-22

| PR | Innehåll | Status |
|---|---|---|
| #570 | Fas 0 (pin `shadcn@4.13.1` + `components.json`-registries + spike) | **Mergad.** Spiken avgjorde öppna fråga 1: HTTP-fetch, INGEN `shadcn`-runtime-dep. Obs: inbyggda `@shadcn`/`@v0` får aldrig deklareras i `registries` |
| #576 | Fas 1 (`POST /api/shadcn/describe`, flagg-gated) | **Mergad** |
| #574 | Fas 3-Bläddra ("Lägg till"-panel + galleri, flagg-gated) | **Mergad** |
| #572 | Fas 5 (MessageScroller, flagg-gated) | **Mergad** |
| #581 | Fas 2 v1 (insättnings-lane via own-engine + Beskriv-flik) | **Mergad** |
| #583 | Fas 2-efterhärdning (chattbytes-guard, metadata-sanering, hydrerings-timeout, riktig disabled) | I granskning (`merge:ready`) |
| #582 | Fas 4 (sökdriven kandidatgenerering i resolvern, flagg-gated + legacy-fallback) | Draft — författarens pass pågår |
| #584 | Fas 6-proof (internt `@sajtmaskin`-register, 3 poster via `/r/{name}.json`) | Draft. Avgjorde öppna fråga 3: serveras från appen, ingen ny Blob-host |

## Tester som krävs (P1 enligt review-gaten — pipeline/preview/DB berörs)

| Nivå | Vad |
|---|---|
| Unit | `/api/shadcn/describe` (query-generering, rankning, no-results-fallback), registry-adapter, `dep-completer` för `registryDependencies`, import-scope |
| Regression | `npm run eval:*` (resolver-ändring får inte sänka generationskvalitet) + follow-up `*.stability.test.ts` |
| Integration | Insättnings-lane → `finalize-version`/verifier → ny version (utöka `finalize-version.test.ts`, `server-verify.test.ts`) |
| Komponent | Galleri, Beskriv-panel, drag-n-drop-placering (vitest + testing-library) |
| Chat | MessageScroller ersätter `conversation.tsx`-scroll; deterministiska strömmar via `@shadcn/helpers/ai-sdk` |
| Smoke | preview renderar efter insättning (CapabilitySmoke/RenderGate) |

## Docs-/config-ändringar som krävs

| Yta | Ändring |
|---|---|
| `docs/plans/active/README.md` | Router-rad för denna plan (görs i samma commit) |
| `docs/architecture/glossary.md` | Registrera nya begrepp: "Beskriv-flöde", "Registry Discovery", "@sajtmaskin-registry" (UI Recipe finns redan) |
| `docs/architecture/llm-pipeline.md` | Uppdatera när resolvern (Fas 4) byter till `searchRegistries` |
| `src/lib/shadcn/README.md` | Program-API-adapter + `components.json` som kanonisk registry-config |
| `components.json` | Kanonisk `registries`-nyckel (config, dokumenteras) |
| `docs/ENV.md` + `config/env-policy.json` | Ev. flagga `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE`; `/describe` återanvänder befintliga provider-nycklar |
| `backoffice/pages/shadcn_audit.py` | Spegla nya register + Beskriv-metrik |
| `.cursor/rules/terminology.mdc` | "Composer" → "Lägg till"; håll isär UI Recipe vs Byggblock vs Template (v0-mall) |

## Tidsuppskattning

| PR | Fokuserat agent-arbete | Kommentar |
|---|---|---|
| PR1 | 0,5–1 dag | Spiken är jokern |
| PR2 | 2–3 dagar | Route + LLM-rankning + galleri-UI |
| PR3 | 3–5 dagar | **Svårast** — pipeline-integration + verify + edge cases |
| PR4 | 2–3 dagar | Skyddad yta, kräver eval-regression |
| PR5 | 1–2 dagar | Fristående |
| PR6 | 3–5 dagar | Kurering av verifierade block är långsam |

**Totalt:** ~11–19 fokuserade agent-arbetsdagar. Kalendertid **~2–3 veckor** med review-grindar
(bugbot-pass + 7-min-fönster + CI + ev. Codex per PR, prod-deploy per merge till master).

## Varför det tar tid / vad som är bökigt

1. **"Funktionell på användarsajten" är merparten av arbetet.** Varje block måste kompilera i
   den specifika scaffolden med sina imports/deps/`registryDependencies` — insättning = dep-
   resolution + verify, inte copy-paste.
2. **Skyddad pipeline (Fas 4).** `resolveShadcnUiRecipes` sitter i generationsvägen; ändring
   riskerar regression i init/follow-up → eval-grindad, försiktig.
3. **Fuzzy ≠ semantisk.** `searchRegistries` matchar bara namn/beskrivning; kräver LLM-
   översättning + rankning + no-results-hantering.
4. **Två preview-runtimes.** Insättning/verify rör både preview_host (Fly VM) och own-engine-shim.
5. **Nya runtime-deps.** `shadcn`/`@shadcn/react` i en Next 16 RSC-app måste vettas (bundle,
   server-only, ESM) — därav spiken i Fas 0.
6. **Drift/pin.** `shadcn@latest` kan ändra beteende mitt i en generation; pin + sync + health
   måste hålla ihop över MCP, resolver och Beskriv.
7. **Review-grindar per PR.** bugbot + 7-min + CI (typecheck/lint/vitest/hygiene/schema-drift) +
   prod-deploy per merge → sekventiella grindar tar kalendertid även när koden är klar.

## Exekverings-/modellplan (subagenter)

| Modell | Roll |
|---|---|
| grok 4.5 (`cursor-grok-4.5-high-fast`) | Exploration, scaffolding, tester, docs, lägre-risk-UI |
| opus 4.8 (`claude-opus-4-8-thinking-max`) | Huvudimplementation: routes, adapter, UI-wiring |
| fable 5 (`claude-fable-5-thinking-xhigh`) | Det svåraste: Fas 2 insättnings-lane + Fas 4 resolver (pipeline) |

Worktree-isolation (`agent-worktree.mdc`): en git-mutator per checkout; parallella subagenter
arbetar på icke-överlappande filer eller i egna worktrees. Varje PR mot `master`, bugbot-pass +
7-min-fönster före merge.

## Icke-mål

- Ersätt **inte** own-engine-generering med shadcn — shadcn är input, motorn äger output.
- Kör **aldrig** `shadcn add` mot användarsajten utan verify.
- Skicka **inte** `llms.txt` i varje generation (bra agentkontext, men inte per-gen).
- Inga nya auth-/rate-limit-/krypto-lager (projekt-fas-regeln).
- MCP behålls för Cursor/dev; prod använder program-API/HTTP.

## Öppna frågor

1. ~~Fas 0-spiken: program-API eller HTTP-fetch?~~ **Avgjord (#570):** HTTP-fetch, ingen `shadcn`-runtime-dep.
2. Insättning: räcker v1 (prompt via own-engine) för lansering, eller krävs v2 (deterministisk lane)? v2-seamen dokumenterad i `shadcn-insert.ts`; sendMessage-utfallskontraktet ligger som BB#shadcn-lane1 (P3).
3. ~~Eget @sajtmaskin-register: Blob eller befintlig infra?~~ **Avgjord (#584):** serveras från appen själv (`/r/{name}.json`).
