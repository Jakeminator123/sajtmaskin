---
id: P21
title: Phase routing & timeouts — tier-differentiering i manifest
status: done
created: 2026-04-20
priority: medium
wave: 1
parallel_safe_with: [P22, P24, P25]
blocked_by: []
owner_files:
  - config/ai_models/manifest.json
read_only_files:
  - src/lib/models/phase-routing.ts
  - src/lib/models/catalog.ts
  - src/lib/ai-models/load-manifest.ts
validator_hooks:
  - { kind: file-contains, target: config/ai_models/manifest.json, expect: "\"perTierRepairPolicies\"" }
  - { kind: file-contains, target: config/ai_models/manifest.json, expect: "\"perTierTimeouts\"" }
  - { kind: file-contains, target: config/ai_models/manifest.json, expect: "\"perTierBriefing\"" }
  - { kind: npm-script, target: typecheck }
  - { kind: npm-script, target: "test:ci" }
---

# P21 — Phase routing & timeouts

## Roll & uppgift

Du är en Cursor-agent. Uppdatera **endast** `config/ai_models/manifest.json` så att alla fem tiers (`fast`/`pro`/`max`/`codex`/`anthropic`) får differentierade timeouts, repair-budgetar och briefing-modeller. Idag är allt identiskt för alla tiers — `Snabb` betalar samma fixer-budget som `Tanker`, och `Tanker` har för tight verifier-timeout för 4-route premium-sajter.

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `config/ai_models/manifest.json` | `src/lib/models/phase-routing.ts`, `src/lib/models/catalog.ts`, `src/lib/ai-models/load-manifest.ts` |

Rör inga andra filer. Inga TS-ändringar — accessorerna lever i P26.

## Steg

1. **Justera `phaseRouting.thinkingByTier`**:
   - `fast.planner` → `{ thinking: false, reasoningEffort: "low" }`
   - `pro.planner.reasoningEffort` → `"high"` (var `"medium"`)
   - `pro.generator.reasoningEffort` → `"high"` (var `"medium"`)
   - `max.verifier` → `{ thinking: true, reasoningEffort: "medium" }`
2. **Lägg till nytt top-level fält `perTierRepairPolicies`** (ej via env-keys, bara konstantvärden):
   ```json
   "perTierRepairPolicies": {
     "fast":      { "deterministicAutofixPasses": 1, "syntaxFixPasses": 2, "serverRepairPasses": 1 },
     "pro":       { "deterministicAutofixPasses": 2, "syntaxFixPasses": 3, "serverRepairPasses": 2 },
     "max":       { "deterministicAutofixPasses": 2, "syntaxFixPasses": 4, "serverRepairPasses": 2 },
     "codex":     { "deterministicAutofixPasses": 2, "syntaxFixPasses": 4, "serverRepairPasses": 2 },
     "anthropic": { "deterministicAutofixPasses": 2, "syntaxFixPasses": 3, "serverRepairPasses": 2 }
   }
   ```
3. **Lägg till nytt top-level fält `perTierTimeouts`**:
   ```json
   "perTierTimeouts": {
     "fast":      { "engineRouteMaxDurationSeconds": 180, "verifierTimeoutMs": 120000 },
     "pro":       { "engineRouteMaxDurationSeconds": 360, "verifierTimeoutMs": 120000 },
     "max":       { "engineRouteMaxDurationSeconds": 800, "verifierTimeoutMs": 240000 },
     "codex":     { "engineRouteMaxDurationSeconds": 800, "verifierTimeoutMs": 240000 },
     "anthropic": { "engineRouteMaxDurationSeconds": 600, "verifierTimeoutMs": 120000 }
   }
   ```
4. **Lägg till nytt top-level fält `perTierBriefing`**:
   ```json
   "perTierBriefing": {
     "fast":      { "briefingModel": "openai/gpt-5.2" },
     "pro":       { "briefingModel": "openai/gpt-5.3-codex" },
     "max":       { "briefingModel": "openai/gpt-5.4" },
     "codex":     { "briefingModel": "openai/gpt-5.4" },
     "anthropic": { "briefingModel": "anthropic/claude-sonnet-4.6" }
   }
   ```
5. **Behåll de gamla globala fälten oförändrade** (`repairPolicies`, `briefing.specModel`, `routeTimeouts.engineRouteMaxDurationSeconds`, `postGenerationPasses.verifierTimeoutMs`) — P26 låter accessor-koden falla tillbaka till dem när per-tier-värdet saknas.

## Acceptans (kör innan du sätter `status: done`)

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | `node -e "const m=JSON.parse(require('fs').readFileSync('config/ai_models/manifest.json','utf8'));console.log(Object.keys(m.perTierRepairPolicies),Object.keys(m.perTierTimeouts),Object.keys(m.perTierBriefing))"` | Tre arrayer med exakt `[fast,pro,max,codex,anthropic]` |
| 2 | `npm run typecheck` | exit 0 |
| 3 | `npm run test:ci` | exit 0 (inga regressioner) |
| 4 | Diff endast i `config/ai_models/manifest.json` | `git diff --name-only` listar bara denna fil |
