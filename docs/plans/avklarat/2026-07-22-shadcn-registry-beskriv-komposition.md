---
status: avklarat
owner: unassigned
created: 2026-07-22
completed: 2026-07-22
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
| shadcn MCP (Cursor/dev) | `.cursor/mcp.json.example` → `scripts/cursor/shadcn-mcp.cjs` (`npx -y shadcn@4.13.1 mcp`) | Aktiv och versionspinnad (#570) |
| Registry-fetch (index/item, style-fallback, cache) | `src/lib/shadcn/registry-service.ts`, `registry-url.ts`, `registry-cache.ts` | Aktiv runtime |
| Registry-proxy-routes | `src/app/api/shadcn/registry/{index,item,refresh}/` | Aktiv |
| Sync + health | `scripts/shadcn/{sync-shadcn-registry.ts,registry-health.ts}` (`shadcn:sync`, `shadcn:health`) | Aktiv |
| Import-/dep-repair | `registry-utils.ts` (`rewriteRegistryImports`), `src/lib/gen/autofix/{import-validator,dep-completer}.ts` | Aktiv |
| Recept-resolver (mening → recipe) | `src/lib/gen/data/shadcn-ui-recipes.ts` (`resolveShadcnUiRecipes`) | Aktiv — sökdriven kandidatgenerering (Fas 4 levererad 2026-07-22; `SAJTMASKIN_SHADCN_RESOLVER_SEARCH`, legacy-fallback kvar) |
| Community-register | `components.json` (kanoniska custom namespaces) + `config/community-registries.json` (sök-/sektionsseed) | Aktivt: @shadcnblocks, @tailark, @magicui och internt @sajtmaskin (#570, #584); inbyggda @shadcn/@v0 är implicita |
| Galleri-DATA (kategorier, curated, featured) | `registry-service.ts` (`CURATED_UI_COLLECTIONS`, `FEATURED_BLOCKS`, `getBlocksByCategory`) | Aktiv i builderns Bläddra-flik (#574) |
| "Lägg till"-yta | `PreviewPanelAddPanel.tsx`, `PreviewPanelBrowseGallery.tsx`, `PreviewPanelDescribeTab.tsx`, `src/lib/builder/shadcn-insert.ts` | Aktiv bakom feature flags: Block + Bläddra + Beskriv; registry-val går via insättnings-lane v1/own-engine + verify (#574, #581, #583) |
| Inspect-brygga (placering) | `inspect-bridge-*.ts`, `usePreviewInspectBridge.ts`, `sectionAnalyzer.ts` | Flagg-gated, brygga (ingen worker) |
| Builder-chat-scroll | `src/components/ai-elements/conversation.tsx`, `src/components/ui/message-scroller.tsx` | `@shadcn/react` MessageScroller är installerad och aktiv bakom `NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER` (#572) |

**Externt verifierat:** shadcn:s program-API `shadcn/registry` existerar, men Fas 0-spiken
valde HTTP-fetch för runtime (ingen `shadcn`-runtime-dependency). `@shadcn/react` 0.2.1 är
installerat och driver MessageScroller; `@shadcn/helpers/ai-sdk` är fortsatt ett valfritt,
ej installerat test-/demo-spår.

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

   components.json  = KANONISK custom registry-config (@magicui/@tailark/@shadcnblocks/@sajtmaskin;
                      inbyggda @shadcn/@v0 är implicita) → delas av MCP · resolver · /describe · sync/health
```

## Nedbrytning i faser (delmoment + parallellt vs sekventiellt)

Legend: **[S]** = ligger på kritisk väg (sekventiellt), **[P]** = kan köras parallellt.

### Fas 0 — Grund & konsolidering  · låg risk · additiv · ✅ levererad 2026-07-22
- **[P]** Versionspinna shadcn: `npx shadcn@4.13.1 mcp` i wrapper + config (ta bort `@latest`-drift).
- **[P]** `components.json` → kanonisk `registries`-nyckel för custom namespaces (@magicui/@tailark/@shadcnblocks; inbyggda @shadcn/@v0 förblir implicita). `community-registries.json` behålls som sök-/sektionsseed.
- **[S] Spike:** kan `shadcn/registry`-program-API köras i en Next 16 server-route (bundle, `server-only`, ESM, ev. Commander-deps)? Beslut: program-API vs fortsatt HTTP-fetch. **Grindar Fas 1 & 4.**

### Fas 1 — Discovery-lager ("Beskriv"-backend)  · additiv · flagg-gated · ✅ levererad 2026-07-22
- **[S]** `/api/shadcn/describe`: mening → LLM skriver sökfråga(or) → `searchRegistries`/HTTP → LLM rankar 5–10 verkliga träffar → returnerar `{name, registry, description, previewLight/Dark, dependencies, registryDependencies, addCommand}`. **Skriver inget till användarsajten.**
- **[P]** No-results-robusthet (mening→0 träffar → förenkla query, retry).
- **[P]** TS-paritet med coachens Python-PoC (`shadcn_sentence_picker.py`) som dev-verktyg/eval.

### Fas 2 — Funktionell insättnings-lane  · SVÅRAST · rör preview/verify · ✅ v1 levererad; v2-beslut kvar
- **[S] v1 (säker):** vald kandidat → välformad prompt via **befintliga** `sendMessage`/AI-fallback (samma som Composer använder) → own-engine genererar + verifierar. Uppfyller kärnprincipen utan ny lane.
- **[S] v2 (deterministisk):** dedikerad lane — `getRegistryItems` → `rewriteRegistryImports` + alias-scope → `dep-completer` utökad för `registryDependencies` + saknade ui-primitiver → recipe-injektion i own-engine-turn → `Normalize`/`RepairGate`/`RenderGate` → ny version.
- **[P]** Fel/degraderingsyta när verify faller (Advisory, ej false-green).

### Fas 3 — UI: "Lägg till"-yta (döp om Composer)  · frontend · ✅ kärnflöde levererat; drag-n-drop kvar
- **[P]** Bläddra-flik: väck `CURATED_UI_COLLECTIONS`/`FEATURED_BLOCKS` som galleri m. thumbnails (kan börja **innan** Fas 1, datan finns).
- **[S]** Beskriv-flik: fritext → `/api/shadcn/describe` → rankade kort → välj → Fas 2-lane. (Beror på Fas 1+2.)
- **[P]** Drag-n-drop: återanvänd inspect-brygga + `sectionAnalyzer` för placering; sökning + "senast använda".
- **[P]** Copy/terminologi: "Composer" → "Lägg till", håll isär från Byggblock (dossiers).

### Fas 4 — Konsolidera resolver  · RÖR SKYDDAD PIPELINE · egen PR  · ✅ levererad 2026-07-22
- **[S]** ✅ Byt `buildCandidates` hårdkodade kandidater (`login-03`, `dashboard-01`, …) → sökdriven kandidatgenerering (HTTP-index + `registry-search.ts`, per Fas 0-spiken — inte program-API:t). Capability-signaler är **input** till query. Flagga `SAJTMASKIN_SHADCN_RESOLVER_SEARCH` (default på), legacy-kandidaterna kvar som fallback vid flagga av/indexfel.
- **[S]** ✅ Regressionsgrind: snapshot-tester (pinnad index-fixtur, 6 promptklasser, legacy vs sök) i `shadcn-recipe-search.snapshot.test.ts` + P1-tester för flagga-av-paritet och nätfels-fallback.

### Fas 5 — Builder-chat (fristående spår)  · helt parallelliserbart · ✅ MessageScroller levererad
- **[P]** Installera `@shadcn/react`; ersätt `conversation.tsx`-scroll med `MessageScroller` (streaming utan hopp, anchor, bevarad läsposition, scroll-to-bottom).
- **[P]** `@shadcn/helpers/ai-sdk` för deterministiska chat-strömtester (reasoning/tool-calls/sources/F2-F3-continuation) — test/demo, ej prod-modell.
- **[P]** Ta in nya chat-komponenter (attachment, bubble, marker, message, message-scroller) kontrollerat i `SHADCN_COMPONENTS`.

### Fas 6 — Eget @sajtmaskin-register  · långsiktigt · sist · ✅ proof levererat; expansion kvar
- **[P]** Kurera verifierade block (hero, pricing, dashboards, auth, booking, ai-chat, e-handel, integration-mocks) i ett internt shadcn-kompatibelt register med `dependencies`/`registryDependencies`/redan verifierad kod.
- **[S]** Lägg registret i `components.json` → MCP + resolver + Beskriv använder samma källa automatiskt.

## PR-mappning (allt mot `master`) — leveransstatus 2026-07-22

| PR | Innehåll | Status |
|---|---|---|
| #570 | Fas 0: pin `shadcn@4.13.1`, custom registries i `components.json`, HTTP-fetch-spike | **Mergad** |
| #576 | Fas 1: `POST /api/shadcn/describe`, flagg-gated discovery | **Mergad** |
| #574 | Fas 3: "Lägg till" + Bläddra-galleri | **Mergad** |
| #572 | Fas 5: `@shadcn/react` MessageScroller | **Mergad** |
| #581 | Fas 2 v1 + Beskriv-UI: insättning via own-engine/verify | **Mergad** |
| #583 | Fas 2-härdning: chat-byte-guard, metadata-sanering, hydration-timeout och disabled-kontrakt | **Mergad** |
| #582 | Fas 4: sökdriven resolver med legacy-fallback och reserverad community-plats | **Mergad** |
| #584 | Fas 6-proof: internt `@sajtmaskin`-register, tre självbärande poster via `/r/{name}.json` | **Mergad** |
| #586 | Slutstabilisering: historikankare i MessageScroller + provider-failover i Beskriv + planpensionering | **Denna PR** |

Valfri backlog: avgör om deterministisk lane v2 behövs, leverera eventuell
drag-n-drop-placering och expandera det interna registret bortom proofets tre poster.

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
| `docs/plans/avklarat/README.md` | Indexrad + denna fil (pensionerad från `active/` 2026-07-22) |
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

1. ~~Program-API eller HTTP-fetch?~~ **Avgjord i #570:** HTTP-fetch, ingen `shadcn`-runtime-dependency.
2. **Kvar:** v1 via own-engine är lanserad och härdad i #581/#583. Behövs även v2:s deterministiska lane, och i så fall för vilka block/placeringar?
3. ~~Blob-host eller befintlig infra för `@sajtmaskin`?~~ **Avgjord i #584:** registret serveras av appen från `/r/{name}.json`.
