# Handoff — Grandmaster: redo för städpasset (2026-06-21, kväll)

**Master:** `b4993271a` · **Status:** alla arbetsområden klara/täckta — **bara den breda Område 8-städrundan återstår** · **Föregångare:** [`2026-06-21-grandmaster-execution-handoff.md`](2026-06-21-grandmaster-execution-handoff.md) (morgonens, nu historik) · **Plan:** [`../plans/active/grandmaster/00-master-plan.md`](../plans/active/grandmaster/00-master-plan.md) · **Kanonisk status:** [`../plans/active/grandmaster/_loggbok.md`](../plans/active/grandmaster/_loggbok.md)

> Denna handoff ersätter morgonens som **aktuell**. Efter att Område 7 false-green-kärnan stängts (#179 + #180) och Område 4 verifierats redan uppfyllt, finns i praktiken **inget arbete kvar i själva planen** — bara den **breda, gemensamma Område 8-städrundan** (görs ihop med Jake, per-rad-ok) + en katalogiserad backlog vid sidan. Kod = source of truth om docs/kod skiljer.

## 0. ⚠️ VIKTIGT: parallell bugg-agent kör fortfarande

En separat bugg-letar-agent kör parallellt och kan flytta `master` / öppna PR:er medan du arbetar.

- **Anta aldrig att din vy är färsk.** `git fetch` ofta; `git rev-list --left-right --count origin/master...HEAD`.
- **Bugg-agentens gren (2026-06-21):** `origin/cursor/modell-och-autofixlogik-3376` (autofix-timing + scaffold/phase-routing) — **rör inte** false-green/status-ytan, så ingen krock med det som gjordes denna session.
- **Bugg-agentens findings** ligger **untracked** i arbetsträdet: `docs/plans/active/bug-swarm/findings/01–16 + PRIO-*` (dess Fas-1-katalog). **Committa/skriv inte över dem** — det är dess yta. De är inte i git-historiken → rör dem inte vid en `git clean`.
- **Kollidera inte om worktrees/brancher** — distinkta namn, fetch+rebasa före gate/merge.

## 1. Nuläge (verifierat 2026-06-21 kväll)

| Sak | Läge |
|---|---|
| Master | `b4993271a`, `div 0 0`, typecheck/lint/test:ci grön |
| Öppna grandmaster-PR:er | **Inga** — #179 + #180 mergade denna session |
| Öppna PR:er totalt | **#175** (chgenberg, Viewser/Sajtbyggaren — ej grandmaster, **merga aldrig**, master-blockad) · **#164** (inspect-bridge, parkerad) · **#140** (DB+Blob-gate, parkerad) |
| Worktrees | main `[master]` · `sajtmaskin-db-sync-test` (#140) · `sajtmaskin-inspect-bridge` (#164) — **rör ej de två sista** |
| Ostagat i arbetsträdet (ej mina, lämna) | `.vscode/launch.json`, `.cursor/settings.json`, `docs/canvases/llm-flow.canvas.txt` (canvas regenereras), + untracked `docs/plans/active/bug-swarm/` (bugg-agentens findings) |
| Progress | **~89 %** |

## 2. Gjort denna session (allt mergat, allt gated + bot-rent)

| PR | Aktivitet | Resultat |
|---|---|---|
| **#179** (`d06c33533`) | omr 7 — F2 `missing_preview_url`-emit | En F2-postcheck som hoppas över för att preview-URL saknas (vanliga klient-anropet `previewUrl:null`) emitterar nu `version.degraded {product_postcheck_skipped}` → livscykel-badgen blir degraderad, ej solid grön. `feature_disabled` tyst (default-OFF-prod orört). |
| **#180** (`b4993271a`) | omr 7 — F2 `productBlocked`-degrade | Ny `VersionDegradationKind` `product_postcheck_blocked`. En postcheck som **kör och dömer produkten trasig** (död mobilmeny / 2+ brutna ankare) degraderar nu livscykeln. Full signal-yta: enum + emitter + UX-copy + backoffice-telemetri + glossary + regressionstest. |
| — | **Område 4 verifierat täckt** | "Klart när" (init/follow-up-brief-lås + svensk follow-up-intent-test) uppfylls redan av `follow-up-clarification.test.ts` + S2 åäö-invariant (#151) + terminologi-lås + Område 5-kontraktet. Init-prompt-**overhaul** = oscope:ad, ej i "Klart när" → ingen PR. |

**Not:** Cursor-automationerna (`Find critical bugs` + `PR-mergare`) **skippade #180** (oklart varför — pausade el. samtidighet med bugg-agenten). Bot-reviewen ersattes av en read-only **Bugbot-subagent** (rapporterade inga buggar) + orchestratorns egen diff-granskning. **Verifiera att automationerna är aktiva igen** innan du litar på deras verdict.

## 3. Områdesstatus (nivå 2) — alla arbetsområden klara/täckta

| # | Område | Status |
|---|---|---|
| 1 Kontrakt & repo-regler | ✅ klart |
| 2 Stabilitetstester | ✅ klart |
| 3 Dokumentation & kartor | ✅ i stort klart (svans i omr 8) |
| 4 Prompter (init + follow-up) | ✅ **täckt** (ingen separat PR; init-overhaul = oscope:ad backlog om Jake vill) |
| 5 Follow-up & preview-kontrakt | ✅ kärnan stängd (5-6 parkerad) |
| 6 Status & UI/UX | ✅ klart |
| 7 False-green-härdning | ✅ **kärna stängd** (#149 + A7-1 + A7-2 + #179 + #180; F3 G#21). Kvar: A7-2 prod-verify (passiv, efter deploy) |
| 8 Cleanup & hygien | 🔶 **ÅTERSTÅR** — den breda runda denna handoff förbereder |

## 4. DET ENDA SOM ÅTERSTÅR I PLANEN: bred Område 8-cleanup

**Gemensam, ej autonom** (master-plan §7). Karta: [`08-cleanup-och-hygien.md`](../plans/active/grandmaster/08-cleanup-och-hygien.md) + [`_backlog-deferrad.md`](../plans/active/grandmaster/_backlog-deferrad.md) B6.

| Kandidat | Vad | Säkerhet |
|---|---|---|
| Arkivera källdocs | `_parkering/deep-research-report.md`, `docs/handoffs/2026-06-17-cleanup-forenkling-handoff.md` | autonomt-ok |
| `next`-bump-stäng | redan `16.2.9` (senaste stabila) → stäng som inaktuell | autonomt-ok (noll kod) |
| **Bred `.gitignore`/`.cursorignore`-prune** | stale rader (`archive/...`, `research/_sidor`, `templates_v0/*`, m.fl. — alla `Test-Path False`) | **KRÄVER Jakes per-rad-ok** (`workflow.mdc`: bred prune = eget pass, ej smyg) |

## 5. Backlog vid sidan (egna pass — INTE "arbete kvar i planen")

- **DB-`Verifierad`-vs-bus-`Degraderad`-split (finding 02)** = bugg-agentens yta (`VersionHistory.tsx`) → **koordinera, dubbel-fixa ej**.
- **finding 11 / B1:** lyft false-green-stability + S3-invariant från warn-only `stability`-lane → blockerande `test:ci` (lane-arkitekturbeslut).
- **B2** `/versions` `readAll`-dedup (perf) · **B3** multi-instans/efemär event-bus (arkitektur) · **F4** odefinierade bus-emits · **F5** manifest `perTier*` ej i Zod + hårdkodade modeller.
- **A7-2 prod-verifiering** efter nästa deploy (plockas env-flaggan upp? rimlig block-frekvens?).
- ev. **Område 4 init-prompt-overhaul** (oscope:ad; bara om Jake uttryckligen vill — ej krav).

## 6. Governance + arbetssätt (oförändrat)

- Master låst (`.github/CODEOWNERS` + ruleset "Protect master" `17926309`); **Jake (admin) bypassar allt** — orchestratorn admin-mergar på Jakes mandat när grönt + bot-rent. **chgenberg blockad** — merga aldrig #175 m.fl.
- Per PR: **review-gate** (CI grön + alla bot-fynd värderade INNAN merge). Runtime-/false-green-PR (omr 4/5/6/7) = fråga Jake före merge. Vid skippade automationer: kör en `bugbot`-subagent som ersättning.
- Bygg i **eget worktree** bredvid huvudträdet (aldrig under `.cursor/`), egen branch, byt aldrig HEAD i delade trädet. Windows: node_modules-junction in, `cmd /c rmdir`-junction FÖRE `git worktree remove`; fysisk mapp kan kräva manuell `Remove-Item -Recurse -Force` + `git worktree prune` (Windows-lås).
- Squash-merge → FF lokal master → städa worktree/branch → **logga i `_loggbok.md`** (du äger filen).
- **Builder-coexistence:** öppna aldrig live `/builder?...` eller `/api/engine/chats/<chatId>/...` mot Jakes aktiva chat.

## 7. Copy-paste startprompt till nästa orchestrator

```
Du är orchestrator för grandmaster-stabiliseringsplanen i Sajtmaskin (Windows/pwsh).
Master vid överlämning: b4993271a. ~89% klart. ALLA arbetsområden klara/täckta —
det enda kvar i planen är den BREDA Område 8-städrundan (gemensam, ej autonom,
per-rad-ok för ignore-prune). OBS: en separat BUGG-AGENT kör parallellt och kan
flytta master — git fetch ofta, rebasa, kollidera ej (dess gren:
cursor/modell-och-autofixlogik-3376; dess findings ligger untracked i
docs/plans/active/bug-swarm/ → rör ej).
LÄS FÖRST:
1. docs/handoffs/2026-06-21-grandmaster-cleanup-ready-handoff.md  (denna)
2. docs/plans/active/grandmaster/_loggbok.md
3. docs/plans/active/grandmaster/08-cleanup-och-hygien.md + _backlog-deferrad.md
4. .cursor/rules/ — workflow, agent-worktree, pr-merge-review-gate, auto-merge-automation
STÄDPASS (ihop med Jake): arkivera källdocs · next-bump-stäng (redan 16.2.9) ·
bred .gitignore/.cursorignore-prune (KRÄVER per-rad-ok). Radera inget utan beslut per rad.
BACKLOG (egna pass, ej planen): finding 02 (bugg-agentens), finding 11/B1-lane,
B2-B7, A7-2 prod-verify, ev. omr 4 init-overhaul.
GOVERNANCE: master låst; Jake admin-bypassar; chgenberg blockad (#175 mergas aldrig).
Verifiera att Cursor-automationerna (Find critical bugs / PR-mergare) är aktiva igen.
PARKERAT (rör ej): #140, #164.
```
