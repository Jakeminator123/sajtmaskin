# Handoff — Grandmaster arkiverad + bugg-lista konsoliderad (2026-06-22)

**Master vid skrivning:** `c2ccd7efd` (denna städning committas ovanpå) · **Status:** grandmaster-planen **arkiverad** (active → avklarat), bugg-listorna **konsoliderade till en**, hela backloggen **triage-verifierad** mot kod. Inga öppna grandmaster-PR:er. · **Föregångare:** [`2026-06-21-grandmaster-closing-handoff.md`](2026-06-21-grandmaster-closing-handoff.md) (scope-stängning) · **Tag/backup:** `MILSTOLPE-2026-06-21-grandmaster-stabil`.

> Kod = source of truth. En enda aktiv bugglista finns nu: **`BUG-SWARM-BACKLOG.md`** (repo-rot).

## 1. Vad som gjordes denna runda

| Område | Resultat |
|---|---|
| **Grandmaster arkiverad** | `git mv docs/plans/active/grandmaster → docs/plans/avklarat/grandmaster` + `active/bug-swarm → avklarat/bug-swarm`. `active/` har nu bara `README.md`. Relativ-länk-djup bevarat (active↔avklarat samma nivå) → interna länkar intakta. |
| **Referenser fixade** | 8 src-kommentarcitat (`* Källa:`) + `check-term-coverage.mjs` + `glossary.md` + closing-handoff (6 länkar) → `avklarat/`. `00-master-plan` frontmatter `status: done`, `closed: 2026-06-22`. |
| **Router uppdaterad** | `active/README.md`: grandmaster = avklarad; live-backlog lyft (ägarbeslut B05/B07/B08 + arkitektur B3/B1/B4/F4-F5). `avklarat/README.md`: grandmaster + bug-swarm-sammanfattning. |
| **En bugglista** | `BUG-SWARM-BACKLOG.md` (rot, load-bearing) = enda aktiva. B01–B15 = arkiverad/löst historik i `avklarat/bug-swarm/README.md` (ej parallell aktiv lista). Aktiv kö = "Triage-svärm 2026-06-22"-sektionen; G#/N#/R#-tabellen = historik/beslut. |
| **Triage-svärm** | 7 read-only composer-agenter verifierade B01–B15 + ~48 öppna rot-rader mot master `c2ccd7efd` (% + verdikt + fil:rad-bevis). N#6 flippad → löst (Område 6). |
| **Verifiering** | `npm run typecheck` 0 · `check-bug-backlog` preflight 0 · interna länkar intakta. |

## 2. Bugg-status efter triage (kod-verifierad)

**Sessionens fixar håller:** B01/B03/B04/B06/B09/B10/B11/B14/B15/B-GA alla bekräftade i kod (≤15% kvarvarande). N#6 löst (Område 6).

**Reella öppna (kandidater för fix, ej bara policy):**

| ID | % | Vad | Ankare |
|---|---|---|---|
| **G#40** | 90% | **SÄKERHET** — inspector SSRF: publik DNS→privat IP, ingen rebind-guard | `services/inspector-worker/server.mjs:106,450` |
| **B05** | 90% | **LATENT PROD** — `refuseDossierStubs` matchar hela registret (ej `selectedDossierIds`), flaggan ON i Vercel → false-RED-risk. Fix: filtrera på valda dossiers | `cross-file-import-checker.ts:670-688` |
| G#20 | 88% | F3 build-plan från contracts, ej version-filer (drift) | `session-contracts.ts:159` |
| B13 | 78% | clear-redesign delta-brief tappas vid contract-gate-retry | `chat-message-stream-post.ts:419` |
| G#26 | 76% | init vs follow-up olika capability-universum | `follow-up-orchestration-input.ts:103` |
| B12 | 72% | F3 auto-kick kringgår stale-base-409 | `useSendMessage.ts:276` |
| G#25 | 68% | capability multi-source; snapshot-fix hjälpte bara finalize-design | `orchestrate.ts:1314-1342` |
| G#21 | 52% | F3 `ready:true` när detect ger `[]` på läsbara filer | `finalize-design/route.ts:190-201` |

**Ägarbeslut (Jakes — höga % men medvetna val, ej buggar):** B07 (media öppet) · B08 (fail-open, loggas) · B05-policy (kod-default OFF) · G#10/G#13/N#1 (kvalitet/brief/dossier-stub kopplade till default-off).

**NOT_A_BUG / cheap cleanup:** G#56 — vestigial död drift-kod (`variantNomination` produceras ej av schemat → alltid null).

**Behöver repro (ej statiskt avgörbart):** E#1 (eval), R#9, G#53, U#29 (media-URL från preview-VM), U#56 (analytics före cookie-consent — integritet), U#77.

## 3. Arkitektur-/hygien-backlog (egna scope:ade pass)

Detalj: [`../plans/avklarat/grandmaster/_backlog-deferrad.md`](../plans/avklarat/grandmaster/_backlog-deferrad.md). **B3 durable event-bus = enda korrekthetsrisken** (in-memory/efemär → multi-instans serverless splittrar status). B1 (S3-lane warn→blockerande), B4 (canvas `CANVAS_PR_TOKEN`), F4/F5.

## 4. Föreslaget nästa steg

1. **Snabba säkra fixar:** B05 (filtrera `selectedDossierIds` — latent prod, flaggan är ON) + G#40 (SSRF DNS-rebind-guard). Båda har tydlig minsta-åtgärd i `avklarat/bug-swarm/README.md` / triage-ankarna.
2. **Arkitektur-kluster:** G#20/G#25/G#26 = capability/F3-single-source — eget pass (signal-ägarmatris).
3. **B3 vid multi-instans:** scope:a durable event-bus om ni kör serverless/multi-instans.
4. **Sedan pivot "härda → bygga":** [`../architecture/llm-flow-target-worldclass.md`](../architecture/llm-flow-target-worldclass.md).

## 5. Governance + arbetssätt (oförändrat)

- Master låst (`CODEOWNERS` + ruleset "Protect master"); Jake (admin) bypassar. **chgenberg blockad — merga aldrig #175.**
- Cursor-automationer (`Find critical bugs` / `PR-mergare`) skippar drafts → kör en `bugbot`-subagent som review-ersättning.
- Bygg i eget worktree, byt aldrig HEAD i delade trädet. Squash → FF lokal master → städa → logga i `avklarat/grandmaster/_loggbok.md`.
- Bugg-listan: en enda (`BUG-SWARM-BACKLOG.md`). Lägg inte till en parallell aktiv lista. Stäng/parkera hellre än att dra med gamla potential-rader.

## 6. Öppna PR:er (icke-grandmaster)

#175 (chgenberg — merga aldrig) · #164 (inspect-bridge, parkerad) · #140 (DB+Blob-gate, parkerad — bär #140:s P1/High bot-fynd = B7) · #188 (auto-canvas draft, rullande).
