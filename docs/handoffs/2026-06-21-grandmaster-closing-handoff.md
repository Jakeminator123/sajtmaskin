# Handoff — Grandmaster: stabiliseringsplanen STÄNGD (2026-06-21, kväll)

**Master:** `984eae4d2` · **Status:** grandmaster-stabiliseringsplanens **scope är 100 % klart**; det som återstår är tre medvetet avgränsade **appendix-spår** (ägarbeslut · bugg-agentens bana · arkitektur-backlog) — inte halvfärdigt planarbete. · **Föregångare:** [`2026-06-21-grandmaster-cleanup-ready-handoff.md`](2026-06-21-grandmaster-cleanup-ready-handoff.md) (superseded) · **Plan:** [`../plans/active/grandmaster/00-master-plan.md`](../plans/active/grandmaster/00-master-plan.md) · **Kanonisk logg:** [`../plans/active/grandmaster/_loggbok.md`](../plans/active/grandmaster/_loggbok.md)

> Kod = source of truth om docs/kod skiljer. En parallell **bugg-letar-agent** kör fortfarande (gren `cursor/modell-och-autofixlogik-3376`) — den äger bug-swarm-findings-ytan; `git fetch` ofta, kollidera ej.

## 1. Nuläge (verifierat 2026-06-21 kväll)

| Sak | Läge |
|---|---|
| Master | `984eae4d2`, `div 0 0`, typecheck/lint/test:ci grön |
| Egna PR:er (#181–#187) | alla **MERGED** (#182 stängd som dubblett av #181 + #183) |
| Öppna PR:er totalt | **#175** (chgenberg, ej grandmaster — merga aldrig) · **#164** (inspect-bridge, parkerad) · **#140** (DB+Blob-gate, parkerad) |
| Worktrees | main `[master]` + parkerade #140/#164 — rena |
| Cursor-automationer | `Find critical bugs` + `PR-mergare` + `Vercel Agent` **skippar** (pausade) → bot-review ersatt med read-only **Bugbot-subagent** per PR |

## 2. Vad som är klart (grandmaster-scope = 100 %)

**De 8 områdena (nivå 2):**

| # | Område | Status |
|---|---|---|
| 1 Kontrakt & repo-regler | ✅ (C1 #152, C2 #153) |
| 2 Stabilitetstester | ✅ (S1 #147, S2 #151, S3 #163, S4 #150) |
| 3 Dokumentation & kartor | ✅ (D1, D2 #148) |
| 4 Prompter (init+follow-up) | ✅ täckt (inget separat PR; init-overhaul = oscope:ad) |
| 5 Follow-up & preview-kontrakt | ✅ kärnan (#165/166/168/169/172/174/176 + 5-Z; 5-6 parkerad) |
| 6 Status & UI/UX (event-bus) | ✅ (#159/160/161/162/163) |
| 7 False-green-härdning | ✅ (#149/155/156/177/179/180 + B09 #185) |
| 8 Cleanup & hygien | ✅ (arkiv + next-bump + ignore-prune −74 rader + eval-namnskugga + döda länkar) |

**Bug-swarm-drive (extern topp-lista + triage, denna session):**

| Bugg | Vad | PR |
|---|---|---|
| B01 (server) / B03 / B10 | preview version-pin · dossier capability-källa (`briefSummary`) · migration-ordning | #181 |
| B04 / B06 | follow-up capability-golv (top-level merged) · route-removal-vakt | #183 |
| B09 | VersionHistory: ingen split false-green (emerald vs degraderad) | #185 |
| B2 | `/versions` `readAll` O(n²)→O(n) Set-dedup | #184 |
| B-GA / B11 | OAuth-logg utan rå svarskropp · sanera secrets i publik export-zip | #186 |
| B14 / B15 | followup-contract-CI-gate kör alltid · konsekvent `generationMode` | #187 |

## 3. Appendix — medvetet avgränsat (INTE öppet planarbete)

### Appendix A — Ägar-/policybeslut (dina, systemet funkar som det är)
- **B05 / A7-2 kod-default-flipp** — `refuseDossierStubs` är redan env-satt i Vercel; kod-default OFF lämnad (otestbar prod-default-flipp utan scope).
- **B07 — publik vs privat media** — du valde **öppet**; säkerhet som eget senare pass.
- **B08 — quality-gate fail-open** — du valde **släpp igenom**; felet loggas redan (DB-oberoende `console.warn`).

### Appendix B — Bugg-agentens bana (koordineras, dubbel-fixa ej)
- **B12** (F3 auto-kick kringgår stale-base-409), **B13** (clear-redesign delta-brief vid contract-gate-retry), **B01-klient** (vit-iframe polling-re-pin) — ligger i `chat-message-stream-post.ts` / `useSendMessage.ts` / preview-polling = bugg-agentens aktiva filer. Scout/edge; **B01-klient kräver live-verifiering mot preview-host (separat repo)**. → låt bugg-agenten ta dem, orchestratorn granskar/mergar/dedupar dess PR:er.

### Appendix C — Arkitektur-/hygien-backlog (egna scope:ade pass)
- **B3 / E2** durable event-bus (in-memory/efemär → multi-instans serverless kan splittra status/finalize). **Enda kvarvarande korrekthetsrisken.** Deploy-topologi-beslut.
- **B1** S3/false-green-stabilitet warn-only-lane → blockerande `test:ci` (lane-arkitekturbeslut).
- **B4** canvas auto-PR `CANVAS_PR_TOKEN` (secret-beslut). **F4/F5** odefinierade bus-emits / manifest `perTier*`-Zod. Detalj: [`../plans/active/grandmaster/_backlog-deferrad.md`](../plans/active/grandmaster/_backlog-deferrad.md).

## 4. Föreslaget nästa steg (i allmänhet)

Stabiliseringen har nått sitt mål: kärnflödet är härdat, false-green stängt, kontrakt CI-gatade, repo städat. Förslag i ordning:

1. **Stäng bug-swarm helt (billigt):** låt bugg-agenten landa B12/B13/B01-klient → orchestratorn dedupar/mergar. Då är hela buggslistan stängd.
2. **Ta dina 3 policybeslut när du vill (Appendix A):** snabba när du bestämt dig; inget brådskar (systemet funkar).
3. **Enda reella tekniska risken kvar = B3 (durable event-bus):** scope:a den **om** ni kör multi-instans/serverless (på single-instance Render är den ofarlig). Det är den sista korrekthets-, inte hygien-posten.
4. **Sedan: pivotera från "härda" till "bygga":** repo:t är stabilt nog att rikta mot målbilden i [`../architecture/llm-flow-target-worldclass.md`](../architecture/llm-flow-target-worldclass.md).

## 5. Governance + arbetssätt (oförändrat)
- Master låst (`CODEOWNERS` + ruleset "Protect master"); Jake (admin) bypassar — orchestratorn admin-mergar på grönt + bot-rent. **chgenberg blockad — merga aldrig #175.**
- Per PR: review-gate (CI grön + alla bot-fynd värderade). Vid skippade automationer: kör en `bugbot`-subagent som ersättning.
- Bygg i eget worktree bredvid huvudträdet (aldrig under `.cursor/`), egen branch, byt aldrig HEAD i delade trädet. Windows: junction node_modules in, `cmd /c rmdir` junction FÖRE `git worktree remove`.
- Squash → FF lokal master → städa worktree/branch → **logga i `_loggbok.md`**.
