---
id: gm-akt-5-4-clear-redesign-delta-brief
status: ready
created: 2026-06-19
parent: gm-omrade-05-followup-och-preview-kontrakt
blocked_by: 5-1 (FollowUpContract finns på master)
risk: medium
owner_files:
  - src/lib/api/engine/chats/chat-message-stream-post.ts
  - src/app/api/engine/chats/[chatId]/stream/route.test.ts
---

# 5-4 — F1-fix: clear-redesign-delta-briefen når orchestrate

**Område 5** · Wave 2 · [nivå-2](../05-followup-och-preview-kontrakt.md) · fynd **F1** i [`llm-callsite-matrix.md`](../../../../architecture/llm-callsite-matrix.md). Smal PR — bara brief-tilldelningssidan, **inte** `orchestrate.ts` (ägs av 5-3 / draft #168).

## Mål
För en **clear-redesign**-follow-up genereras en färsk delta-brief (eng. *delta-brief*, ny strukturerad brief framtagen via LLM), men värdet når aldrig orchestration. Gör så att den färska delta-briefen faktiskt blir den brief orchestrate läser — utan att röra **neutral** follow-up (som ska fortsätta använda snapshot-briefen).

## Bakgrund (verifierat i kod, 2026-06-19)
`metaBrief` deklareras `null` (`chat-message-stream-post.ts:282`). För clear-redesign genereras delta-briefen och sätts på `metaBrief` (`:522,531`). Men `buildFollowUpOrchestrationInput` läser briefen som:

```
brief: params.parsedMeta.brief ?? buildFollowUpBriefFromSnapshot(params.orchestrationSnapshot)
```
(`follow-up-orchestration-input.ts:85-87`)

`parsedMeta.brief` sätts bara av `extractBriefFromMeta(meta)` (`parse-chat-request-meta.ts:86`) → **`null` för follow-ups** (de bär inte init-briefen inline). `metaBrief` skrivs **aldrig** tillbaka till `parsedMeta.brief` — det läses bara i telemetri (`metaBriefApplied`, `:1103,1187`). Båda call-sites (plan `:720`, codegen `:921`) skickar `parsedMeta`.

**Netto:** `?? buildFollowUpBriefFromSnapshot(...)`-fallbacken vinner alltid → clear-redesign får snapshot-briefen, inte sin färska delta. Bortkastat LLM-anrop; "bygg om designen" blir svagare än avsett.

| Väg | `metaBrief` | Brief som når orchestrate idag | Önskat |
|---|---|---|---|
| clear-redesign | färsk delta | snapshot-fallback (bugg) | **färsk delta** |
| neutral follow-up | `null` | snapshot-fallback | snapshot-fallback (oförändrat) |

## Steg (test FÖRST)
1. **Test (skrivs först, ska faila innan fixen)** i route-testet `[chatId]/stream/route.test.ts` (kör redan riktiga handlern + mockar `resolveOrchestrationBase`):
   - **clear-redesign:** mocka `tryGenerateServerAutoBrief` → brief med sentinel-värde; snapshot bär en *annan* igenkännbar briefSummary. Assert: `resolveOrchestrationBase`-inputens `brief` == sentinel-deltan, **inte** `buildFollowUpBriefFromSnapshot(snapshot)`. (RÖD på master.)
   - **neutral follow-up (regressionsvakt):** ingen delta genereras → `brief` == snapshot-briefen (GRÖN före och efter).
2. **Fix (minimal):** skriv tillbaka den färska delta-briefen till `parsedMeta.brief` direkt efter att `metaBrief` sätts, så `?? buildFollowUpBriefFromSnapshot(...)` bara används när ingen delta genererades. Neutral väg lämnar `metaBrief` `null` → oförändrad.

## Acceptans / tester
- Ny clear-redesign-test grön efter fix, bevisat röd före.
- Neutral-regressionsvakt grön (snapshot-brief oförändrad).
- Befintliga `[chatId]/stream/route.test.ts`-tester gröna.
- `typecheck`/`lint` 0 (0 nya fel i berörda filer).
- **Beteende-neutralt för neutral follow-up:** ingen delta → ingen ändring.

## Guardrails
- **Filstaket:** rör **inte** `src/lib/gen/orchestrate.ts` eller `src/lib/gen/followup-freeze.stability.test.ts` (ägs av 5-3 / draft #168). Fixen bor på brief-tilldelningssidan. Om fixen visar sig kräva `orchestrate.ts` → **flagga som blocker**, smyg inte in den.
- **Smal:** bara F1-delta-brief. Capability (5-5), preview-session (5-6) = senare slices.
- Eget worktree (`..\sajtmaskin-omr5-4`, branch `feat/omr5-clear-redesign-brief`), **draft-PR** (runtime follow-up-yta, risk ≥3 → PR-mergaren `NEEDS_HUMAN` väntat).
- Builder-coexistence: rör inte preview/heartbeat, ingen live-endpoint.
