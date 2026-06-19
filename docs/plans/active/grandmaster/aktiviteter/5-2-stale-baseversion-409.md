---
id: gm-akt-5-2-stale-baseversion-409
status: ready
created: 2026-06-19
parent: gm-omrade-05-followup-och-preview-kontrakt
blocked_by: 5-1 (mjukt — kan göras fristående om kontraktet dröjer)
risk: medium
owner_files:
  - src/lib/api/engine/chats/chat-message-stream-post.ts
  - src/lib/gen/version-manager.ts
---

# 5-2 — Stale-`baseVersionId`-gate i follow-up-strömmen → 409

**Område 5** · Wave 2 · [nivå-2](../05-followup-och-preview-kontrakt.md) · fynd **F2** i [`llm-callsite-matrix.md`](../../../../architecture/llm-callsite-matrix.md).

## Mål (högst korrekthetsvärde i Område 5)
Follow-up-strömmen ska **inte** tyst bygga vidare på en stale/fel basversion. Spegla det skydd `finalize-design` (F3) redan har: returnera **409** med strukturerad reason när inkommande `engineBaseVersionId` inte är den förväntade senaste.

## Bakgrund (verifierat)
- Idag: explicit `engineBaseVersionId` accepteras tyst (`version-manager.ts:82-107`; test `stream/route.test.ts:785-815`).
- Referensmönster: `finalize-design/route.ts:126-143` returnerar `409 { reason: "stale_design_version" }` när `requestedVersion ≠ preferredVersion`. UI hanterar 409 (`PreviewPanelF3Trigger.tsx:149`).
- Master-plan "Klart när": *stale basversion ger serverfel, inte tyst bygge.*

## Steg
1. I `chat-message-stream-post.ts:332-347` (efter `resolveFollowUpPreviousFiles`, **före** `resolveOrchestrationBase`): jämför `metaEngineBaseVersionId` mot `getPreferredVersion`/senaste.
2. Vid mismatch: returnera `409` med reason (t.ex. `stale_base_version`) + senaste `versionId`, samma SSE/HTTP-form som follow-up-routen i övrigt använder. **Medvetet redigera äldre version** (`BuilderShellContent.tsx:181-212`) måste fortsatt vara möjligt — gata bara *oavsiktlig* stale (definiera villkoret tydligt: explicit base som inte är senaste OCH inte ett avsiktligt "edit-old"-läge).
3. Klient: hantera 409 i follow-up-sändaren (`useSendMessage.ts`) — visa "någon annan/annat skapade en nyare version, ladda om" snarare än tyst bygge.

## Acceptans / tester
- Ny route-test: follow-up med stale `engineBaseVersionId` → 409 + reason; med aktuell bas → 200/normal ström.
- Avsiktlig "edit-old"-väg täckt (bygger fortfarande, ingen 409).
- `typecheck`/`lint` 0; befintliga `stream/route.test.ts` justerade medvetet (dokumentera ändrat antagande `:785-815`).

## Guardrails
- **Korrekthetsfix, inte ny härdning** — minsta möjliga gate, spegla finalize-design.
- Bevaka builder-coexistence: ändra inte preview-/heartbeat-semantik här.
- Eget worktree, **draft-PR** (runtime + protected `src/app/api/**` → PR-mergaren NEEDS_HUMAN väntat).
