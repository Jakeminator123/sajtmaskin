---
status: active
owner: unassigned
topic: Sex backlog-rader som kan få systemet att visa grönt trots felaktig sajt (eller sluta i tystnad). Sekvensering + testkrav — själva fyndbeskrivningarna ägs av BUG-SWARM-BACKLOG.md.
created: 2026-08-01
source: Master-planens steg 1. Alla sex rader kodverifierade som öppna i BUG-SWARM-BACKLOG.md § Aktiv kö 2026-08-01.
---

# Steg 1: false-green- och tystnadsfixar

[`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) är enda källan till
fyndens detaljer — kopiera inte kön hit (`plan-lifecycle.mdc`). Denna fil
sekvenserar bara de sex raderna och binder testkravet: **varje fix ska ha ett
test som låser beteendet** (pipeline-ändring utan test = P1).

## Ordning: en rad = en liten PR

| # | Backlog-rad (fetstilstitel) | Prio | Ägarfiler | Testkrav |
|---|---|---|---|---|
| 1 | `fixMissingImports` hittar på en importsökväg, och stub-skaparen gömmer felet (M#gs1) | **P1** | `src/lib/gen/autofix/jsx-checker.ts` (~:478), `cross-file-import-checker.ts` | Uppdatera `jsx-checker.test.ts` (~:520 förväntar dagens påhitt) + nytt fall: okänd symbol ⇒ ingen import, ärligt fel |
| 2 | Rematchad scaffold persisteras innan kontraktsgrinden har passerat (M#gs2) | P2 | `src/lib/api/engine/chats/chat-message-stream/codegen-turn.ts` (~:336), `create-chat-stream-post.ts` (~:807) | Nytt test: "gate avbröt → ingen scaffold persisterad" (ordningen är otestad idag) |
| 3 | Nästlade route-sidor rankas under `components/` i prompt-serialiseringen (M#gs6) | P2 | `src/lib/gen/scaffolds/serialize.ts` (~:347–475) | Utöka `serialize.test.ts` med nästlade `*/page.tsx` (täcker idag bara rot) |
| 4 | RenderGate saknar completeness-koll — partiellt check-svar kan bli "alla passed" (M#gs8) | P2 | `src/lib/gen/verify/preview-quality-gate.ts` (~:181) + anropen i `server-verify.ts` | Test: svar som saknar begärd check ⇒ `unavailable`, inte grönt |
| 5 | RepairGate klarar inte kolliderande importer (prod-chat `85f8db72`) | P2 | deterministiska lanes i `src/lib/gen/autofix/` + `verify/repair-loop.ts` | Testfall för de tre feltyperna: saknad värdeimport, `import type` som används som värde, TS2440-kollision |
| 6 | Plan-lägets follow-up-turer kan sluta i total tystnad (prod-chat `785c8d7a`) | P2 | `src/lib/api/engine/chats/chat-message-stream/plan-mode-turn.ts` (`persistAssistantSummary`) + klientens sändväg | Test: icke-plan-svar persisteras; instrumentera de tre "hål"-kandidaterna (credit-gate-402, job-kö/stream-lock) innan fix |

## Status 2026-08-01 (samma dag som planen — parallella cloudagenter)

| # | PR | Läge |
|---|---|---|
| 1 (P1) | #718 | Levererad — unik-träff-regel + ärligt fel, M#gs1 arkiverad |
| 2 | #720 | Levererad — skrivningen flyttad efter grinden på båda vägarna, M#gs2 arkiverad |
| 3 | #715 | Levererad — nästlade `page.tsx`/`layout.tsx` rankas över komponenter, M#gs6 arkiverad |
| 4 | #712 | Levererad — completeness-koll i `runQualityGateChecks`; install-fail behåller sitt röda verdikt |
| 5 | #725 | Levererad — TS1361 inline-specifiers, TS2693 (type-only → värdeimport) och TS2440 (kompilator-bekräftade namn släpper gap-guarden) lagas deterministiskt; `Resend`-fallet täcktes redan av known-import-fixern i F3 |
| 6 | #723 | Levererad — icke-plan-svar persisteras via `buildPlanModeAssistantMessage`; tysta sändningar instrumenterade. Agentens slutrapport uteblev men PR + CI är gröna |

## Ordningens logik

1–2 är init-flödets sanning (P1 först). 3–4 skyddar prompt→verdikt-kedjan.
5 är dyraste kända prod-regressionen (hel körning utan `passed`).
6 kräver mest diagnostik (två separata hål) — ta den sist så
instrumenteringen kan ligga i egen liten PR före beteendefixen.

## Klart-kriterium

Alla sex rader bockade i backloggen (flyttade till arkiv enligt dess process)
med PR-referens + test. Uppdatera därefter master-planens steg 1.
