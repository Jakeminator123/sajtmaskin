# Handoff — Grandmaster EXEKVERING (2026-06-21)

> **SUPERSEDED 2026-06-21 (kväll):** aktuell handoff = [`2026-06-21-grandmaster-cleanup-ready-handoff.md`](2026-06-21-grandmaster-cleanup-ready-handoff.md). Område 7 false-green-kärna stängd (#179 + #180), Område 4 verifierat täckt → bara bred Område 8-cleanup kvar. Denna fil = historik.

**Master:** `96b27f8ef` · **Status:** ren överlämning till nästa orchestrator · **Föregångare:** [`2026-06-18-grandmaster-execution-handoff.md`](2026-06-18-grandmaster-execution-handoff.md) (historik) · **Plan:** [`../plans/active/grandmaster/00-master-plan.md`](../plans/active/grandmaster/00-master-plan.md) · **Kanonisk löpande status:** [`../plans/active/grandmaster/_loggbok.md`](../plans/active/grandmaster/_loggbok.md)

> Denna fil ersätter 2026-06-18-handoffen som **aktuell** status. Loggboken är fortfarande den finkorniga sanningen — läs dess `Logg` + `handoff-snapshot` + denna fil först. Kod är source of truth om docs/kod skiljer.

## 0. ⚠️ VIKTIGT: parallell bugg-agent kör samtidigt

Jake startar **parallellt med dig (nästa orchestrator)** en **separat bugg-letar-agent** som hittar/fixar buggar och kan committa/öppna PR:er + flytta `master` **medan du arbetar**. Konsekvenser:

- **Anta aldrig att din lokala vy är färsk.** `git fetch` + kontrollera `git rev-list --left-right --count origin/master...HEAD` ofta. `master` kan röra sig under dig.
- **Rebasa dina worktrees mot ny `origin/master`** innan du gatar/mergar (annars stale bas).
- **Kollidera inte om worktrees/brancher.** Bugg-agenten kan ha egna `..\sajtmaskin-*`-worktrees + brancher. Kör `git worktree list` + `git branch -a` innan du skapar nya; använd distinkta namn (t.ex. `feat/omrX-...` vs bugg-agentens namn).
- **Om master plötsligt ändrats** (nya commits du inte gjort): läs deras commit-meddelanden + ev. nya PR:er innan du fortsätter — de kan ha rört din yta.
- **Loggboken ägs av dig (orchestratorn).** Om bugg-agenten också skriver där: merga, skriv inte över. Hellre append än konflikt.

## 1. Nuläge (verifierat 2026-06-21)

| Sak | Läge |
|---|---|
| Master | `96b27f8ef`, `div 0 0` mot origin, **typecheck grön** |
| Öppna grandmaster-PR:er | **Inga** — allt mergat |
| Öppna PR:er totalt | #175 (chgenberg, Viewser/Sajtbyggaren — **ej grandmaster**, master-blockad) · #164 (inspect-bridge, parkerad) · #140 (DB+Blob-gate, parkerad) |
| Worktrees | main `[master]` · `sajtmaskin-db-sync-test` (#140) · `sajtmaskin-inspect-bridge` (#164) — rör ej de två sista |
| Ostagade i arbetsträdet (ej grandmaster, lämna) | `.vscode/launch.json`, `.cursor/settings.json`, `docs/canvases/llm-flow.canvas.txt` (canvas regenereras av `llm-flow-canvas.yml`) |
| Progress | **~87 %** av grandmaster |

## 2. Plan-nivåmodellen (de tre nivåerna)

Plan-livscykeln är kodad i [`.cursor/rules/plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc).

- **Nivå 1 — målbild + index.** [`00-master-plan.md`](../plans/active/grandmaster/00-master-plan.md): nordstjärnan (rolig/aggressiv/snabb + små hårda kontrakt, inte ett styrningslager), de 8 områdena, och **§6 körordning** (skiljer sig från filnumret).
- **Nivå 2 — ett dokument per område** (`01`–`08` i `grandmaster/`): syfte, `owner-surface` (verifierad mot HEAD), och en aktivitetslista. Skapas när området är på tur.
- **Nivå 3 — aktiviteter** i `grandmaster/aktiviteter/*.md`: byggar-agent-körbara, smal `owner_files` var, `blocked_by`-beroenden. Just-in-time per område. Status per aktivitet i [`aktiviteter/README.md`](../plans/active/grandmaster/aktiviteter/README.md).

### Status per område (nivå 2)

| # | Område | §6-steg | Status |
|---|---|---|---|
| 1 | Kontrakt & repo-regler | 3 | ✅ **klart** (C1 #152, C2 #153) |
| 2 | Stabilitetstester | 1 | ✅ **klart** (S1 #147, S2 #151, S4 #150, S3 #163) |
| 3 | Dokumentation & kartor | 2 | ✅ i stort klart (D1, D2 #148; LLM-kartor synkade i 5-Z; svans i omr 8) |
| 4 | Prompter (init + follow-up) | wave 2 | 🔶 follow-up-delen täckt av Område 5; **init-prompt-overhaul ej separat körd** (kandidat) |
| 5 | Follow-up & preview-kontrakt | 5 | ✅ **kärnan stängd** (5-1..5-5 + 5-3b + 5-7); 5-6 previewSessionId **parkerad**; 5-Z klar |
| 6 | Status & UI/UX (event-bus) | 4 | ✅ **klart** (6-1..6-3, #159–#163) |
| 7 | False-green-härdning | 6 | 🔶 kärna klar (#149, A7-1 #155, A7-2-flagga #156); **A7-2 nu env-aktiverad i Vercel** (#177) |
| 8 | Cleanup & hygien | löpande | 🔶 pågående (#157, #158, eval-cleanup #178, 5-Z); kvar: ignore-prune, arkivera källdocs, next-bump-stäng |

## 3. Gjort denna session (2026-06-20→21, allt mergat)

| PR | Aktivitet | Resultat |
|---|---|---|
| #174 | **5-5** capabilities-floor | `enforceFollowUpCapabilityFloor` — follow-up tappar aldrig tyst en bas-capability. squash `ca4a7974a` |
| #176 | **5-7** lane-promotion | frys/clamp/capability-invarianterna → **blockerande** `test:ci` (`test:followup-contract`-steg). squash `091bd39a1` |
| — | **5-Z** doc-drift | LLM-kartor synkade: F1/F2/F3 markerade åtgärdade; `gpt-4.1`→`claude-sonnet-4.6`-fallback; nominerings-drift (scaffold/variant = deterministisk, `*Nomination` vestigialt) |
| #177 | **A7-2** env-knapp | `SAJTMASKIN_REFUSE_DOSSIER_STUBS` registrerad i `env-policy.json` + `docs/ENV.md` (default OFF i kod) |
| #178 | **omr8** eval-cleanup | tog bort stale OMTAG-02 baseline-spår (`evals/` + `scripts/evals/`); eval-namnskuggan löst |
| — | **A7-2 env-aktivering** | `SAJTMASKIN_REFUSE_DOSSIER_STUBS=true` satt i **alla 3 Vercel-miljöer** (non-sensitive, `type:encrypted`, alla preview-branches). Går live vid nästa deploy per miljö; reversibelt. |

**A7-2 — vad den gör:** när codegen-LLM:n refererar en dossier-fil (integrations-komponent) men inte emitterar den, vägrar autofix nu fabricera en tyst `null-render-stub` → den oresolvade importen **blockar/degraderar previewn ärligt** (`runProjectSanityChecks` `code_structure_failure` → `canStartPreview:false`) i st.f. att skeppa en ihålig **falsk-grön** sida. Frekvensen är LLM-runtime-beroende → bevaka block-frekvens i preview/prod; sätt `=false`/ta bort för att reverta.

## 4. Nästa konkreta steg (Jakes val, ej låst)

1. **Verifiera A7-2 i prod** efter nästa deploy (plockades env-varianten upp? rimlig block-frekvens?).
2. **Område 8-svans** (gemensam, ej helt autonom): arkivera källdokument (`_parkering/deep-research-report.md`, cleanup-handoff), stäng `next`-bump (redan `16.2.9`), **bred `.gitignore`/`.cursorignore`-prune** = eget pass med **per-rad-ok** från Jake (`workflow.mdc`). Karta: [`_backlog-deferrad.md`](../plans/active/grandmaster/_backlog-deferrad.md) B6 + [`08-cleanup-och-hygien.md`](../plans/active/grandmaster/08-cleanup-och-hygien.md).
3. **Backlog-härdning** (egna pass): VADE-perf `readAll`-per-rad på pollade `/versions` (B2); E2 multi-instans/efemär event-bus (B3); reshapad 5-6 (preview re-pinnar efter follow-up-finalize / anti-stale-falsk-grön); F4 (odefinierade bus-emits); F5 (manifest `perTier*` ej i Zod + hårdkodade modeller).
4. **Område 4 init-prompt** om Jake vill (ej separat körd).

## 5. Governance (master är låst)

- `.github/CODEOWNERS` (`* @Jakeminator123`) + ruleset **"Protect master"** (id `17926309`: require PR + code-owner review + non_fast_forward + deletion, **admin always-bypass**).
- **Jake (admin) bypassar allt** — `gh pr merge --admin` + direkt-push till master fungerar (remote loggar "Bypassed rule violations"). Orchestratorn kör detta på Jakes mandat.
- **chgenberg är blockad** från master. **Merga ALDRIG hans PR:er** (#175 m.fl. = Viewser/Sajtbyggaren-produktspår, ej grandmaster).
- **Cursor auto-mergaren** ("PR-mergare") är GitHub-blockad från master utan code-owner-review → ger `NEEDS_HUMAN` på allt protected/risk≥3. Läs alltid dess verdict + Bugbot/Codex-fynd före manuell merge ([`pr-merge-review-gate.mdc`](../../.cursor/rules/pr-merge-review-gate.mdc), [`auto-merge-automation.mdc`](../../.cursor/rules/auto-merge-automation.mdc)).

## 6. Arbetssätt (obligatoriskt)

- Bygg i **eget worktree** bredvid huvudträdet (aldrig under `.cursor/`), egen branch. Byt **aldrig** HEAD i det delade trädet ([`agent-worktree.mdc`](../../.cursor/rules/agent-worktree.mdc)). På Windows: node_modules-junction in i worktreet (`New-Item -ItemType Junction`, absolut target); ta bort junction länk-bart (`cmd /c rmdir`) FÖRE `git worktree remove` (annars riskeras target-radering).
- Per PR: **review-gate** — CI grön + alla bot-fynd (Bugbot/Codex/VADE/GitGuardian) värderade INNAN merge.
- **Merge-mandat (Jake 2026-06-20):** merga när allt är grönt + bot-rent — även `NEEDS_HUMAN` är OK att admin-bypassa **givet att allt annat är grönt**. Stoppa bara vid blockerande P1/High/säkerhetsfynd (fixa, merga inte). Runtime-default-flippar med ej-CI-bevisbar prod-risk (typ A7-2): lämna åt Jakes prod-omdöme / env-spak.
- Squash-merge → FF lokal master (samma branch, tillåtet) → städa worktree/branch → **logga i `_loggbok.md`** (du äger filen; byggar-subagenter loggar inte).
- **Builder-coexistence:** öppna ALDRIG live `/builder?...` eller `/api/engine/chats/<chatId>/...` mot Jakes aktiva chat ([`builder-coexistence.mdc`](../../.cursor/rules/builder-coexistence.mdc)). Live 2-klients-smoke ersätts av CI-låsta scenarier.

## 7. Parkerat — rör ej (egna spår/agenter)

- **#140** DB+Blob sync-gate — P1-säkerhet (prod-secrets mot PR-kod, EMPTY-check exit 0). Annan agents infra-spår.
- **#164** inspect-bridge — inspector-rendering, eget agentspår (worktree `sajtmaskin-inspect-bridge`). SSRF-risk G#40 noterad.

## 8. Copy-paste startprompt till nästa orchestrator

```
Du är orchestrator för grandmaster-stabiliseringsplanen i Sajtmaskin (Windows/pwsh).
Master vid överlämning: 96b27f8ef. ~87% klart. OBS: en separat BUGG-AGENT kör
PARALLELLT och kan flytta master/öppna PR:er medan du jobbar — git fetch ofta,
rebasa worktrees, kollidera inte om brancher/worktrees.
LÄS FÖRST:
1. docs/handoffs/2026-06-21-grandmaster-execution-handoff.md  (denna)
2. docs/plans/active/grandmaster/_loggbok.md                  (finkornig status + logg)
3. docs/plans/active/grandmaster/00-master-plan.md            (nivå 1 + §6)
4. docs/architecture/llm-callsite-matrix.md                   (LLM-karta; F4/F5 backlog)
5. .cursor/rules/ — agent-worktree, builder-coexistence, pr-merge-review-gate,
   auto-merge-automation, terminology, workflow
KLART: Område 1,2,3,6 + Område 5 kärnan (5-1..5-5,5-3b,5-7; 5-6 parkerad) + 5-Z.
       A7-2 env-aktiverad i Vercel (SAJTMASKIN_REFUSE_DOSSIER_STUBS=true, alla miljöer,
       live vid nästa deploy, reversibelt).
NÄSTA (Jakes val): verifiera A7-2 i prod · Område 8-svans (arkivera källdocs, next-bump-stäng,
       .gitignore-prune = per-rad-ok) · backlog-härdning (VADE-perf /versions, E2 event-bus,
       reshapad 5-6 preview-re-pin, F4/F5) · ev. Område 4 init-prompt.
ARBETSSÄTT: eget worktree + draft/PR + review-gate; merga när grönt+bot-rent (NEEDS_HUMAN
       admin-bypassas vid grönt, Jakes mandat); FF master + städa + logga i _loggbok.md.
       Runtime-default-flippar med ej-CI-bevisbar prod-risk → Jakes env-spak, blind-flippa ej.
GOVERNANCE: master låst (CODEOWNERS + ruleset 17926309); Jake admin-bypassar; chgenberg
       blockad (merga ALDRIG hans #175 m.fl.); auto-mergaren NEEDS_HUMAN på protected/risk≥3.
PARKERAT (rör ej): #140 (DB+Blob P1), #164 (inspect-bridge).
```
