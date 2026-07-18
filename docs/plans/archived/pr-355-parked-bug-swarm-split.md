---
status: archived
owner: unassigned
created: 2026-07-08
archived: 2026-07-09
archived_note: "PR #355 stängd som merge-fordon. Referensplan för de kvarvarande klustren (preview/readiness, pipeline, scaffolds, domains/engine) som ska tas som egna små PR:ar. Flyttad active→archived 2026-07-09; router:as från docs/plans/active/README.md."
topic: PR #355 bug-swarm batch — parkerad som merge-fordon, split till små PR:ar
source: PR #355 (fix/bug-swarm-verified) beskrivning + PR-triage 2026-07-08
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [Active bug backlog](../../../BUG-SWARM-BACKLOG.md)

# PR #355 — parkerad bug-swarm, split till små PR:ar

## TL;DR

PR #355 var en stor bug-swarm-batch (26 verifierade fynd över flera domäner). Den
är **inte längre rätt merge-fordon**: stale, stor och inte mergebar. Innehållet
sparas här som referens och tas vidare i **små separata PR:ar per kluster** — inte
genom att återaktivera #355 som helhet.

## Källa

- **PR:** #355 — `fix: bug-swarm batch — 26 verifierade fynd (preview/deploy/credits/pipeline/scaffolds)`
- **Branch:** `fix/bug-swarm-verified` (**ska inte raderas** — behålls som referens)

## Status

- **parked / closed** — stängd som merge-fordon 2026-07-08.
- Ej merge vehicle. Branchen finns kvar men PR:en är inte öppen.

## Varför

- **Stale** — senast uppdaterad 2026-07-02, master har rört sig mycket sedan dess.
- **Stor** — 39 filer, +1376/-137, 26 fynd över 7 kluster i en enda PR.
- **Ej mergebar** — GitHub rapporterar `CONFLICTING` mot `master`.
- **Nyare split-spår finns** — arbetet bryts nu ut domän för domän (se nedan);
  batch A (#391) är redan utbruten och lever som egen PR.

## Redan utbrutet

| Kluster | Vidare i | Status |
|---|---|---|
| Credits + deploy/pengaväg (batch A) | **#391** `fix(credits/deploy): pengaväg …` | **Mergad till master** 2026-07-08 (utbruten från #355) |
| Builder/session-race (batch B, delvis) | **#393** `fix(builder): chat-race guards …` | **Mergad till master** 2026-07-08 — täckte #8 (autofix fel chat) + #34 (ErrorBoundary reset); #7 kvar |
| Domains/templates/landing (batch C) | **#395** `fix(domains/templates/landing): apex A-record …` | **Mergad till master** 2026-07-08 — täckte #32 (apex A-record), #38 (blockera `.env`-import), #26 (orphan-projekt-rollback) |

Batch A motsvarar #355:s kluster **Credits** (#29, #30, #36) samt delar av **Deploy/readiness**.
Batch B täckte delar av **Builder/session-race** (#8, #34).
Batch C täckte delar av **Domains/templates/engine** (#32, #38) samt **Scaffolds/builder** (#26).

## Kvar att bryta ut

Övriga kluster från #355:s beskrivning ska tas som **egna små PR:ar**, ett kluster
i taget. Fynd-numren nedan är #355:s interna svärm-index (referens, inte GitHub-issues):

| Kluster | Fynd i #355 | Innehåll |
|---|---|---|
| **Preview / readiness** | #1, #3, #5, #6 (+ deploy/readiness #10, #11, #13, #14, #15, #16) | Gate tier-2 preview-ready mot VM-lifecycle, håll session vid liv under boot, skilj process-liveness från content-readiness, släng stale preview vid failed latest; delad deploy-block-gate, fail-closed F3-readiness, env/postcheck-paritet, explicit `creditCommitFailed` på 200 |
| **Builder / session-race** | #7 (#8, #34 → mergade i #393 batch B) | Avbryt aktiv generation vid chat-reset (#7 kvar); autofix-mot-fel-chat (#8) och ErrorBoundary-reset (#34) är mergade i #393 |
| **Pipeline** | #19, #20 | Optimistic-concurrency för in-place repair, 409 `stale_base` på `/messages`-fallback |
| **Scaffolds / builder** | #24, #31, #33 | Intent-gated scaffold-match, gate-alignad env-panel, riktig admin-auth (orphan-projekt-rollback #26 mergad i #395) |
| **Domains / templates / engine** | #40, #41 | Best-effort MCP-preview (partial success), ingen failed "preferred" version (apex A-record #32 + blockera `.env`-import #38 mergade i #395) |

Uteslutna fynd (brus/medvetet/verifiera-senare, per #355): #2, #4, #9, #12, #17, #18,
#21, #22, #23, #25, #27, #28, #35, #37, #39, #42 — tas **inte** vidare utan ny verifiering.

## Regel

- Återuppta genom **små separata PR:ar per kluster**, med egna tester och egen review.
- Reaktivera **inte** #355 som helhet, och merga inte branchen `fix/bug-swarm-verified` rakt av.
- Rör kluster protected paths (`gen`, `db`, `credits`, `api`, `providers`) → kräver
  bug-postcheck (bugbot-subagent eller dokumenterad manuell review) före merge.
