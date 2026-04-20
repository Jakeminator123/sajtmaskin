---
id: P26
title: Observability — runId resolver, token reasoning fix, trace overlay
status: done
created: 2026-04-20
priority: medium
wave: 2
parallel_safe_with: [P23]
blocked_by: [P21, P25]
owner_files:
  - src/lib/logging/generation-log-writer.ts
  - src/lib/logging/generation-log-writer.test.ts
  - src/lib/models/trace.ts
  - src/components/builder/ModelTraceOverlay.tsx
  - src/lib/providers/own-engine/generation-stream.ts
read_only_files:
  - config/ai_models/manifest.json
  - src/lib/models/phase-routing.ts
  - src/lib/api/engine/chats/chat-message-stream-post.ts
  - preview-host/src/runtime.js
validator_hooks:
  - { kind: file-not-contains, target: src/lib/logging/generation-log-writer.ts, expect: "could not resolve run dir" }
  - { kind: file-contains, target: src/lib/logging/generation-log-writer.ts, expect: "resolveRunDirFromContext" }
  - { kind: file-contains, target: src/lib/providers/own-engine/generation-stream.ts, expect: "extractReasoningTokens" }
  - { kind: file-contains, target: src/components/builder/ModelTraceOverlay.tsx, expect: "perTierPhaseMatrix" }
  - { kind: npm-script, target: typecheck }
  - { kind: test-name, target: "generation-log-writer resolves runId from chatId fallback" }
---

# P26 — Observability & logging

## Roll & uppgift

Du är en Cursor-agent. Tre observabilitetsbrister från sessionen 2026-04-20:

| Observation | Källa |
|---|---|
| `[generationslogg] resolveRunDir: could not resolve run dir … chatId=? runId=?` skräpar på varje event | `generation-log-writer.ts` |
| `tokenUsage.outputTokens=598` för init trots 38 filer/111 kB → reasoning-tokens räknas inte | `generation-stream.ts` + AI-SDK-wrapper |
| `ModelTraceOverlay.tsx` visar bara aktiv tier — saknar 5×5-matris för debug | `ModelTraceOverlay.tsx` |

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `src/lib/logging/generation-log-writer.ts` (+ `.test.ts`) | `config/ai_models/manifest.json` |
| `src/lib/models/trace.ts` | `src/lib/models/phase-routing.ts` |
| `src/components/builder/ModelTraceOverlay.tsx` | `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| `src/lib/providers/own-engine/generation-stream.ts` | `preview-host/src/runtime.js` |

## Steg

1. **RunId-resolver** (`generation-log-writer.ts` + test): exportera ny fn `resolveRunDirFromContext({ chatId, runId, slug })`. Logik:
   - Om `runId` finns → använd `data/runs/<runId>/`.
   - Annars om `chatId` finns → slå upp senaste `runId` i `data/runs/_index/chat-to-run.json` (lägg till denna index-fil + skrivlogik samtidigt).
   - Annars om `slug` finns → fallback `data/runs/_unrouted/<slug>/`.
   Den gamla `could not resolve run dir`-warningen får finnas kvar i en sista else-gren men ska inte triggas i normalfallet.
2. **Reasoning-tokens** (`generation-stream.ts`): ny intern `extractReasoningTokens(streamResponse)`. För OpenAI Responses-API-svar: läs `response.usage.reasoning_tokens`. För AI-SDK-wrappade strömmar: läs motsvarande fält i `tokenUsage`. Lägg till `reasoningTokens` i `tokenUsage`-objektet som returneras. Behåll `outputTokens` som visible-text-tokens.
3. **Trace-typer** (`models/trace.ts`): lägg till `ReasoningTokenSummary` + `PerTierPhaseMatrixRow`-typer. Utvidga `ModelTraceSnapshot` med `reasoningTokens?: number` (optional för bakåtkompatibilitet).
4. **Per-tier matris** (`ModelTraceOverlay.tsx`): ny sub-komponent `perTierPhaseMatrix`. Renderar 5×5-tabell (tier × phase) med modell-id, thinking-flagga, reasoningEffort. Läser via `getPhaseRoutingFromManifest()` + `getPhaseThinkingFromManifest()`. Endast synlig när `?modelTrace=1`. Befintliga `selectedModelTier`-blocket behålls oförändrat.

## Icke-scope

- Ingen ändring av DB-skriv-väg eller `logs/sajtmaskin-local.log`-format.
- Ingen ändring av `evals`-koden eller scorecard.

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | Nytt enhetstest: `resolveRunDirFromContext({chatId:"abc"})` med mockad index | Returnerar korrekt path, ingen warning |
| 2 | Manuell snapshot: trigga en init-generation och inspektera `tokenUsage` i log | Innehåller både `outputTokens` (visible) och `reasoningTokens` (>=0) |
| 3 | Visuell verifiering av `ModelTraceOverlay` med `?modelTrace=1` | 5×5-matrisen renderas |
| 4 | `rg "could not resolve run dir" logs/sajtmaskin-local.log` efter en testkörning | Inga träffar (eller endast i error-fallback-fall) |
| 5 | `npm run typecheck` + `npm run test:ci` | exit 0 |
