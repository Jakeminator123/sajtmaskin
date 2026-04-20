---
id: P21b
title: Phase routing test-sync — uppdatera fast.planner-förväntningar
status: done
created: 2026-04-20
priority: high
wave: 4
parallel_safe_with: []
blocked_by: [P21]
owner_files:
  - src/lib/models/phase-routing.test.ts
read_only_files:
  - config/ai_models/manifest.json
  - src/lib/models/phase-routing.ts
  - src/lib/ai-models/load-manifest.ts
validator_hooks:
  - { kind: npm-script, target: typecheck }
  - { kind: test-name, target: "fast tier disables planner thinking and uses low reasoning effort" }
  - { kind: file-not-contains, target: src/lib/models/phase-routing.test.ts, expect: "keeps planner/generator thinking enabled by default for fast tier" }
---

# P21b — Phase routing test-sync

## Roll & uppgift

Du är en Cursor-agent. P21 ändrade `manifest.json` så att `phaseRouting.thinkingByTier.fast.planner` blev `{ thinking: false, reasoningEffort: "low" }` (var `{ thinking: true, reasoningEffort: "medium" }`). Testet i `phase-routing.test.ts` rad 118-131 hänger kvar på de gamla värdena och faller. Synka **bara** testförväntningarna mot manifestets nya defaults — ingen kodändring i `phase-routing.ts` eller `manifest.json`.

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `src/lib/models/phase-routing.test.ts` | `config/ai_models/manifest.json` |
| | `src/lib/models/phase-routing.ts` |
| | `src/lib/ai-models/load-manifest.ts` |

Rör inga andra filer. Inga manifest-ändringar.

## Steg

1. Öppna `src/lib/models/phase-routing.test.ts` rad 117-131. Skriv om `it("keeps planner/generator thinking enabled by default for fast tier", …)`-blocket så det reflekterar P21:s nya defaults:
   - Byt test-namnet till exempelvis `"fast tier disables planner thinking and uses low reasoning effort"`.
   - Förvänta `resolvePhaseThinking("fast", "planner")` → `{ phase: "planner", thinking: false, reasoningEffort: "low", reason: "manifest-phase-thinking" }`.
   - Behåll förväntan för `resolvePhaseThinking("fast", "generator")` → `{ phase: "generator", thinking: true, reasoningEffort: "medium", reason: "manifest-phase-thinking" }` (P21 ändrade INTE generator för fast-tier).
2. Verifiera att övriga tester i samma fil (rad 133-143) fortfarande matchar manifestet. Specifikt:
   - `pro.fixer/verifier/deploy.thinking === false` — oförändrat, OK.
   - `max/codex/anthropic.planner.reasoningEffort === "high"` — oförändrat, OK.
3. Om du upptäcker att P21 introducerade en till regression (t.ex. `pro.planner.reasoningEffort` är nu `"high"` men ett annat test förväntar `"medium"`) — flagga den i din rapport. **Lägg INTE till nya tester** för perTierRepairPolicies / perTierTimeouts / perTierBriefing. Det hör till P26-uppföljning när accessor-koden landar.
4. Om du vill, lägg till **ETT** litet bekräftande test för `max.verifier` eftersom P21 ändrade den till `{ thinking: true, reasoningEffort: "medium" }` — det är trevligt-att-ha, inte krav.

## Icke-scope

- Ingen ändring av `manifest.json`.
- Ingen ändring av `phase-routing.ts` eller `load-manifest.ts`.
- Ingen tilläggning av tester för perTier* fält (de saknar accessor-funktioner ännu).
- Inga andra testfilers förväntningar (om något annat test faller är det utanför P21b — flagga separat).

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | `npx vitest run src/lib/models/phase-routing.test.ts` | Alla tester gröna |
| 2 | `npm run typecheck` | exit 0 |
| 3 | `git diff --name-only` | Listar **endast** `src/lib/models/phase-routing.test.ts` |
| 4 | `npm run test:ci` | Antal failures sjunker med exakt 1 jämfört med pre-P21b-baseline (de andra 7 är pre-existing) |
