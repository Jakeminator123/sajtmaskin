# K-019 — Orchestration snapshot (fas 1, levererad 2026-03-26)

**Syfte:** Punkt-i-tid efter att grundfunktionen för **persistens + follow-up-kontinuitet** landat i kod. **K-019** är fortfarande **öppen** i [`../active/kritik-consolidated-open-items.md`](../active/kritik-consolidated-open-items.md) tills merge/UI och ev. sync-create är stängda med datum.

## Vad som levererades

| Del | Beskrivning |
|-----|-------------|
| **DB** | `engine_chats.orchestration_snapshot` (JSONB) — migration `src/lib/db/migrations/add-engine-chat-orchestration-snapshot.sql` |
| **Sparande** | Efter lyckad `finalizeAndSaveVersion`: sanerad SSE-`meta` + `lastVersionId` m.m. via `src/lib/gen/orchestration-snapshot.ts` → `updateChatOrchestrationSnapshot` |
| **Follow-up** | `POST /api/v0/chats/[chatId]/stream`: `prependOrchestrationContinuityToFollowUp` efter `orchestratePromptMessage` |
| **Stream** | `src/lib/providers/own-engine/generation-stream.ts` skickar `orchestrationStreamMeta` till finalize |

## Verifiering

- `npm run typecheck`, `npx vitest run`
- `npm run db:migrate` ska köras i varje miljö så kolumnen finns

## Kvar (inte denna arkivfil)

- Finare merge-policy, ev. UI, ev. sync create-path utan SSE-meta — se aktiv stub [`../active/queue/PLAN-K019-PROMPT-SNAPSHOT.md`](../active/queue/PLAN-K019-PROMPT-SNAPSHOT.md).
