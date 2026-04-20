---
id: parallel-execution-2026-04
title: Parallel execution master — Sajtmaskin cleanup wave 2026-04
status: active
created: 2026-04-20
---

# Parallell exekvering — masterdokument

Sju plan-filer (`P21`-`P27`) bryter ner buggarna och förbättringarna identifierade i sessionen 2026-04-20. Plan-filerna följer schemat [`docs/schemas/strict/plan-file.schema.json`](../../schemas/strict/plan-file.schema.json) och kan kördas i tre parallella vågor + en sekventiell validator.

## Matris

| Wave | Plan | Kan köras parallellt med | Blockerad av | Owner-filer (kärna) |
|---|---|---|---|---|
| 1 | [`P21`](./P21-phase-routing-and-timeouts.md) | P22, P24, P25 | — | `config/ai_models/manifest.json` + backoffice-sidor |
| 1 | [`P22`](./P22-followup-flow-optimization.md) | P21, P24, P25 | — | `useInitBrief.ts`, `follow-up-clarification.ts`, `orchestrate.ts`, scaffold-variants matcher |
| 1 | [`P24`](./P24-preview-host-robustness.md) | P21, P22, P25 | — | `preview-host/src/*` |
| 1 | [`P25`](./P25-builder-ui-and-csp-hygiene.md) | P21, P22, P24 | — | `next.config.ts`, avatar-bridge, BuilderHeader, CSP |
| 2 | [`P23`](./P23-verifier-and-capability-hardening.md) | P26 | P22 (orchestrate.ts soft-merge) | `verifier-pass.ts`, `capability-inference.ts`, `system-prompt.ts` (en sektion) |
| 2 | [`P26`](./P26-observability-and-logging.md) | P23 | P21 (manifest-tier-fält måste finnas), P25 (overlay-utbygge) | `generation-log-writer.ts`, `models/trace.ts`, `ModelTraceOverlay.tsx` |
| 3 | [`P27`](./P27-validator.md) | — | P21, P22, P23, P24, P25, P26 | `docs/plans/avklarat/`, `Kvarvarande-uppgifter.md`, glossary |

## Konfliktanalys (varför P21+P22+P24+P25 är parallell-säkra)

| Plan | Rör | Annan plan rör samma fil? |
|---|---|---|
| P21 | `config/ai_models/manifest.json`, `backoffice/pages/ai_models.py`, `backoffice/pages/llm_config.py`, `backoffice/test_shared_manifest_parity.py` | Nej |
| P22 | `src/lib/hooks/useInitBrief.ts`, `src/lib/providers/own-engine/follow-up-clarification.ts(.test.ts)`, `src/lib/gen/orchestrate.ts`, `src/lib/gen/scaffold-variants/matcher.ts(.test.ts)` | Nej (P23 läser `orchestrate.ts` read-only) |
| P24 | `preview-host/src/runtime.js`, `preview-host/src/server.js`, `preview-host/README.md`, `src/lib/gen/preview/preview-host-client.ts` | Nej |
| P25 | `next.config.ts`, `src/components/avatar/did-openclaw-bridge.tsx`, `src/components/builder/BuilderHeader.tsx`, `src/components/builder/preview-panel/preview-panel-types.ts` | Nej (ModelTraceOverlay flyttad till P26) |

## Wave 2-konflikter (P23 ↔ P26)

| Plan | Rör | Annan rör samma? |
|---|---|---|
| P23 | `src/lib/gen/verify/verifier-pass.ts`, `src/lib/gen/capability-inference.ts(.test.ts)`, `src/lib/gen/system-prompt.ts`, `src/lib/gen/route-plan.ts(.test.ts)` | Nej |
| P26 | `src/lib/logging/generation-log-writer.ts`, `src/lib/models/trace.ts`, `src/components/builder/ModelTraceOverlay.tsx`, `src/lib/providers/own-engine/generation-stream.ts` | Nej |

P23 behöver P22 mergad först eftersom `orchestrate.ts` ändras i P22 (quality-target-cache + scaffoldVariant-lock) och P23 läser den för att veta om rätt context-pinning finns. P26 behöver P21 mergad så manifestens nya tier-fält finns att läsa, och P25 mergad så avatar-fixar inte påverkar trace-overlayens layout.

## Workflow per agent

1. Läs aktuell plan + dess `validator_hooks`.
2. Kör endast i `owner_files` (rör inte filer som tillhör annan plan).
3. När klart: sätt `status: in-review` i frontmatter.
4. Kör de validator-hooks som listas (npm-skript / fil-asserts).
5. Om allt grönt: sätt `status: done`.
6. Pusha — wave-koordinatorn (P27 eller du) flyttar filen till `docs/plans/avklarat/` när hela vågen är klar.

## Validator (P27)

[`P27-validator.md`](./P27-validator.md) är inte en kodändring i sig — det är en checklista som körs **efter** alla P21-P26 är `done`. Innefattar typecheck/lint/test, schema-parity, doc-konsolidering, glossary-uppdatering och flytt av avklarade planer till `avklarat/`.
