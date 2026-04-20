---
id: P28
title: Pre-existing failures cleanup — env-encryption, preview-status, lint, schema
status: active
created: 2026-04-20
priority: low
wave: 4
parallel_safe_with: [P22b, P25b]
blocked_by: []
owner_files:
  - src/lib/project-env-vars.ts
  - src/lib/project-env-vars.test.ts
  - src/lib/gen/autofix/rules/font-import-fixer.ts
  - src/app/api/v0/chats/[chatId]/route.test.ts
  - src/app/api/v0/chats/[chatId]/preview-status/route.test.ts
  - src/app/api/engine/chats/[chatId]/preview-status/route.test.ts
  - src/lib/gen/engine.test.ts
  - src/lib/gen/orchestrate.test.ts
  - src/lib/hooks/useInitBrief.test.ts
  - docs/schemas/strict/manifest.schema.json
read_only_files:
  - config/ai_models/manifest.json
validator_hooks:
  - { kind: npm-script, target: typecheck }
  - { kind: npm-script, target: lint }
  - { kind: npm-script, target: "test:ci" }
---

# P28 — Pre-existing failures cleanup

## Roll & uppgift

Du är en Cursor-agent. Wave 1+2 (P21-P26 + P21b) avslöjade 7 test-failures + 1 lint-error som **inte** orsakades av wave-arbetet — de var pre-existing på master-grenen. P27-validatorn verifierade detta via `git stash` mot HEAD `8b36a5a88`. Nu städar du dem som ett separat hygien-spår, så master blir grön igen.

## Failures att fixa

| # | Fil | Test/Issue |
|---|---|---|
| 1 | `src/lib/project-env-vars.test.ts` | `fails closed when sensitive env vars saved without encryption key` — koden stänger inte när nyckeln saknas |
| 2 | `src/app/api/v0/chats/[chatId]/route.test.ts` | `does not expose a preview URL for failed own-engine versions` |
| 3 | `src/app/api/v0/chats/[chatId]/route.test.ts` | `returns legacyShimPreviewUrl but null previewUrl when own-engine version saved but preview not yet provisioned` |
| 4 | `src/app/api/v0/chats/[chatId]/preview-status/route.test.ts` | `returns stopped when resume fails` |
| 5 | `src/app/api/engine/chats/[chatId]/preview-status/route.test.ts` | `returns stopped + provider_not_running_or_unreachable when resume fails (alias)` |
| 6 | `src/lib/gen/autofix/rules/font-import-fixer.ts:45` | Lint: `prefer-const` på `workingCode` |
| 7 | `docs/schemas/strict/manifest.schema.json` (om filen finns) | Schema kräver `qualityGateTiers.tier2/serverVerify/promotion/interactive`, manifesten har `designPreview/integrationsBuild` (P21-agentens upptäckt) |
| 8 | `src/lib/gen/engine.test.ts` + `src/lib/gen/orchestrate.test.ts` / `src/lib/hooks/useInitBrief.test.ts` / `src/lib/gen/route-plan.test.ts` / `src/lib/gen/capability-inference.test.ts` / `src/lib/gen/verify/verifier-pass.test.ts` / `src/lib/logging/generation-log-writer.test.ts` | Test-isolation-leak: `engine.test.ts > passes adaptive Anthropic thinking options` + `passes OpenAI reasoning effort` failar i full `npm run test:ci`-suite men **passerar standalone** (`npx vitest run src/lib/gen/engine.test.ts` → 3/3). Engine-kod är orörd. Lägg till `vi.resetModules()` i `beforeEach` eller `vi.unstubAllGlobals()` i `afterEach` i någon av de nya test-filerna från P22/P23/P26 som mockar `system-prompt`/`models`/`stream-format` och leakar mock-state. Lägg gärna `vi.resetModules()` i engine.test.ts självt som extra skydd. |

Stream-route follow-up-failures (`scoped edit` + `clear-redesign timeout`) ägs av **P22b**, INTE av denna plan.

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| Alla i listan ovan | `config/ai_models/manifest.json` |

## Steg

1. **Hantera ett fel i taget**, börja med det enklaste (lint #6).
2. För varje fel:
   - Läs testet/lint-error.
   - Förstå vad det testar / vad regeln vill.
   - Fixa antingen (a) koden så testet/regeln passerar, eller (b) testet/schemat om beteendet är medvetet annorlunda. Föredra (a). Om (b): dokumentera varför i samma diff.
   - Verifiera: `npx vitest run <testfil>` eller `npx eslint <fil>` ska bli grön efter fixen.
3. När alla 7 är fixade: kör `npm run test:ci` + `npm run lint`. Båda ska vara exit 0.
4. Om något fel visar sig vara mer komplext än förväntat (>30 min jobb): stoppa, flagga, lämna en TODO-kommentar i koden och en notering i din rapport så det kan splittas till sin egen plan.

## Icke-scope

- Ingen ändring av kod utanför ägarlistan.
- Inga nya tester — bara fix av befintliga.
- Inga commits/pushes (väntar på användarens OK efter rapport).

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm run lint` | exit 0 (ingen prefer-const-warning) |
| 3 | `npm run test:ci` | Failures sjunker till noll (eller endast P22b-relaterade som ägs annorstädes) |
| 4 | `git diff --name-only` | Endast filer i ägarlistan |
