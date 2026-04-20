---
id: P22b
title: Follow-up caller wiring — chat-message-stream-post.ts
status: active
created: 2026-04-20
priority: medium
wave: 4
parallel_safe_with: [P25b, P28]
blocked_by: [P22]
owner_files:
  - src/lib/api/engine/chats/chat-message-stream-post.ts
read_only_files:
  - src/lib/gen/orchestrate.ts
  - src/lib/gen/scaffold-variants/matcher.ts
  - src/lib/providers/own-engine/follow-up-clarification.ts
  - src/lib/db/chat-repository-pg.ts
validator_hooks:
  - { kind: file-contains, target: src/lib/api/engine/chats/chat-message-stream-post.ts, expect: "priorQualityTarget" }
  - { kind: file-contains, target: src/lib/api/engine/chats/chat-message-stream-post.ts, expect: "followUpIntent" }
  - { kind: file-contains, target: src/lib/api/engine/chats/chat-message-stream-post.ts, expect: "persistedVariantId" }
  - { kind: npm-script, target: typecheck }
  - { kind: test-name, target: "ignores persisted scaffold lock for clear-redesign follow-ups in auto mode" }
  - { kind: test-name, target: "finalizes a follow-up generation … scoped edit" }
---

# P22b — Follow-up caller wiring

## Roll & uppgift

Du är en Cursor-agent. P22 byggde helpers i `orchestrate.ts`, `scaffold-variants/matcher.ts` och `follow-up-clarification.ts` för att (1) ärva `qualityTarget` från prior version, (2) låsa scaffold-variant vid follow-up såvida inte intent är `clear-redesign`, och (3) klassificera follow-up-intent. P22 fick INTE röra `chat-message-stream-post.ts` (den var read-only). Nu är det din uppgift att wira ihop helpers med caller-sidan så funktionaliteten faktiskt aktiveras runtime + två misslyckade stream-route-tester blir gröna.

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `src/lib/api/engine/chats/chat-message-stream-post.ts` | `src/lib/gen/orchestrate.ts` |
| | `src/lib/gen/scaffold-variants/matcher.ts` |
| | `src/lib/providers/own-engine/follow-up-clarification.ts` |
| | `src/lib/db/chat-repository-pg.ts` |

## Steg

1. Läs `chat-message-stream-post.ts` och hitta var `OrchestrationInput` byggs upp för follow-up-flödet (`generationMode === "followUp"`-grenen).
2. Lägg till tre nya fält som plockas från prior accepterad version:
   - `priorQualityTarget`: läs från senaste accepterade versionens spec via `getLatestVersion(chatId)` (via befintlig DB-helper).
   - `persistedVariantId`: läs `scaffoldVariantId` från samma version.
   - `followUpIntent`: anropa `classifyFollowUpIntentWithLlmFallback(message, { chatId })` från `follow-up-clarification.ts` (P22 exporterade den).
3. Skicka in alla tre i `OrchestrationInput`-objektet som P22 utvidgade.
4. Säkerställ att stream-route-testerna nu passerar:
   - `ignores persisted scaffold lock for clear-redesign follow-ups in auto mode`
   - `finalizes a follow-up generation … scoped edit (500 ≠ 200)`
5. Om något test fortfarande failar: flagga och stoppa. Lägg INTE till workarounds som mockar bort wiringen.

## Icke-scope

- Ingen ändring av helpers i `orchestrate.ts` / `scaffold-variants/matcher.ts` / `follow-up-clarification.ts` (de är klara från P22).
- Ingen ändring av DB-schema eller `chat-repository-pg.ts` (om accessor saknas, returnera tidigt med samma beteende som idag).
- Inga nya tester — befintliga ska bara passera.

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | `npx vitest run src/app/api/v0/chats/[chatId]/stream/route.test.ts` | De två tidigare misslyckade testerna passerar |
| 2 | `npm run typecheck` | exit 0 |
| 3 | `npm run test:ci` | Antal failures sjunker med exakt 2 jämfört med pre-P22b-baseline |
| 4 | `git diff --name-only` | Listar **endast** `src/lib/api/engine/chats/chat-message-stream-post.ts` |
