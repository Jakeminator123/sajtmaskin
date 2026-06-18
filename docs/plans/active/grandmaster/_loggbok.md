# Grandmaster — loggbok & protokoll

> Orchestrator-loggbok (ej en planfil). Jake + orchestrator-agenten för korta notiser här medan grandmaster-planen körs. Master-plan: [`00-master-plan.md`](00-master-plan.md). Committad för handoff-kontinuitet — nästa agent läser denna + [`docs/handoffs/2026-06-18-grandmaster-execution-handoff.md`](../../../handoffs/2026-06-18-grandmaster-execution-handoff.md).

## Hur den används

- **Orchestratorn** (den långlivade Cursor-sessionen) äger filen. Builder-agenter loggar inte själva (undviker merge-konflikter i parallella branches) — de rapporterar tillbaka, orchestratorn skriver hit.
- **Efter varje "sprint"** (en avklarad/mergad aktivitet): uppdatera `Progress`-tabellen + notera städ-/omorg-kandidater nedan.
- En rad per händelse i `Logg`. Kort. Pekar tillbaka på aktivitet/PR.

## Merge-policy (Jake, 2026-06-18 — uppdaterad)

**Ny policy:** Om ALLT är grönt + bot-rent **och orchestratorn känner sig trygg** → merga till master. Annars stanna och fråga (som förut). Beteende-/runtime-PR med minsta osäkerhet (område 4/5/6/7) = fortfarande fråga.

**OBS auto-merge-automation:** en Cursor-side automation (`app/cursor`) kan merga gröna öppna PR:er på egen hand (mergade #152 C1 utan att byggaren bad om det). Risk-PR:er ska därför öppnas som **draft** tills granskade. Se [`.cursor/rules/auto-merge-automation.mdc`](../../../../.cursor/rules/auto-merge-automation.mdc).

## Protokoll — aktiviteter (batch 1)

| ID | Aktivitet | Område | blocked_by | Status | PR | Granskad |
|---|---|---|---|---|---|---|
| H0 | Branch-hygien | — | — | klar | — | — |
| D1 | active/README → router | 3 | — | klar | — | — |
| S1 | test:stability-lane | 2 | — | **MERGAD** | [#147](https://github.com/Jakeminator123/sajtmaskin/pull/147) | grön; Codex-P2 åtgärdad `f86f68399` |
| S2 | åäö-invariant | 2 | ~~S1~~ | **MERGAD** | [#151](https://github.com/Jakeminator123/sajtmaskin/pull/151) | grön + bot-rent |
| S3 | statusresolver-invariant | 2 | S1 | väntar (todo tills omr 6) | — | — |
| S4 | db:schema-drift gate | 2 | ~~S1~~ | **MERGAD** | [#150](https://github.com/Jakeminator123/sajtmaskin/pull/150) | grön + bot-rent |
| C1 | plan-file-schema deprecate | 1 | — | **MERGAD** (av automation) | [#152](https://github.com/Jakeminator123/sajtmaskin/pull/152) | grön |
| C2 | ordlista/glossary-check | 1 | — | **MERGAD** | [#153](https://github.com/Jakeminator123/sajtmaskin/pull/153) | grön; Codex-P2 åtgärdad `ad60f3455` |
| D2 | repo-tree/README-synk | 3 | — | **MERGAD** | [#148](https://github.com/Jakeminator123/sajtmaskin/pull/148) | grön + bot-rent |

## Protokoll — aktiviteter (batch 2: område 7, ur sekvens)

| ID | Aktivitet | Område | blocked_by | Status | PR | Granskad |
|---|---|---|---|---|---|---|
| A7-1 | false-green stabilitetstest (`done` ≠ raderar degraderingar) | 7 | — | **MERGAD** | [#155](https://github.com/Jakeminator123/sajtmaskin/pull/155) | grön + bot-rent (test-only) |
| A7-2 | autofix vägrar dossier-stub (flag-gated, default-OFF, N#1) | 7 | — | **draft, väntar Jakes review** (master oförändrat) | [#156](https://github.com/Jakeminator123/sajtmaskin/pull/156) | grön; default-off |

## Progress (% av 100 — grov uppskattning)

| Steg (§6 körordning) | Vikt | Klart |
|---|---:|---:|
| 0 · Branch-hygien + foundation (FF, CI-build bort, regel-tightening, plan på master) | 10 | 10 |
| 1 · Stabilitetstester (S1–S4) | 20 | 18 (S1+S2+S4 mergade; S3→omr 6) |
| 2 · Dokumentation & kartor (D1+D2) | 10 | 6 (D1+D2 mergade) |
| 3 · Kontrakt & regler (C1/C2) | 10 | 10 (C1+C2 mergade) |
| 4 · Status & UI/UX (event-bus) | 15 | 0 |
| 5 · Follow-up & preview-kontrakt | 20 | 0 |
| 6 · False-green-härdning | 15 | 3 (A7-1 låst; A7-2 staged draft; #149 separat) |
| **Totalt** | **100** | **~47%** |

## Städ-/omorg-kandidater (löpande — körs i område 8 / per-områdes Z-städ)

- `version-2637fe59.zip` i repo-roten — nedladdad version-zip, untracked skräp → radera eller `.gitignore`.
- `.tmp/commit-cleanup.txt`, `.tmp/duck-ceab-duck-mesh.json` — agent-scratch, bör inte tracked:as.
- ~~Worktree `sajtmaskin-hydration` — tom~~ → **AKTIVT** (annan agent kör där): PR #149 promote-guard / false-green (område 7). RÖR INTE branchen/worktreet. Inte en städkandidat.
- (S1-obs) länka `docs/testing.md` + `docs/delivery-bias.md` från `docs/README.md` — **efter #147 mergats** (de finns inte på master än).
- (S1-obs) `stability`-CI-jobbet kör egen `npm ci` (extra minuter) — kan slås ihop med `quality` om kostnaden skaver.
- Master-plan §7-kandidater: cursorignore-logs, pensionera `plan-file.schema.json` (C1), arkivera källdokument, `next`-bump.
- (D2-obs) Trackad scratch i roten: `blandat/`, `test_förslag_templates_blob` → städkandidater (omr 8).
- (D2-obs) `config/dashboard/` (Streamlit `app.py`) finns parallellt med kanoniska `backoffice/` → terminologi-/konsolideringsfråga (omr 1/8).
- (D2-obs) `.gitignore`/`.cursorignore` har kvar `archive/...`- och `research/_sidor/`-mönster fast mapparna är borta → städ (omr 8).

## Logg

- **2026-06-18** — Foundation: lokal master FF → `0ad1ef53a`; `Build`-steg bort ur `ci.yml`; 10 remote + 2 lokala merged/closed-brancher rensade; agent-worktree/plan-lifecycle/observatory-regler tightade. Jake committade + pushade → `b528034ce`. #146 mergat av separat agent.
- **2026-06-18** — S1 dispatchad (isolerat worktree) → PR #147. CI grön. Codex P2: `*.stability.test.ts` fångas av blockerande `quality`-jobbet → åtgärdas på samma branch före merge.
- **2026-06-18** — D2 dispatchad (parallell, docs-only, distinkt owner_files mot S1).
- **2026-06-18** — D2 klar → PR #148 (repo-tree+README synkade mot HEAD, fantommappar bort, döda länkar fixade). CI pending; auto-merge vid grön+bot-rent (lågrisk).
- **2026-06-18** — D2 #148 **mergad** (grön + bot-rent: Bugbot pass, inga inline-fynd). Worktree + lokal branch borta, master FF → `6b8c8cffc`. S1 Codex-P2 fix pushad (`f86f68399`) — `*.stability.test.ts(x)` exkluderas nu från blockerande `test:ci`, körs bara av `test:stability`. `quality` kör om på #147.
- **2026-06-18** — S1 #147 **mergad** (allt grönt, Codex-P2 åtgärdad+besvarad, inga nya fynd). Worktree + lokal branch borta, master FF → `b45b6a4a4`. Konstaterat: S1 la redan `db:schema-drift` i `test:stability` + ett **warn-only** `stability`-jobb i `ci.yml`. S4:s package.json-del är därmed klar; S4 återstår = lyft schema-drift till hård gate.
- **2026-06-18** — Nästa våg (avsluta omr 2): S2 (åäö-invariant, ny stabilitetstestfil) + S4 (schema-drift hård gate i `ci.yml`) dispatchade i isolerade worktrees. Distinkta `owner_files` → parallell-säkra. **C2 rör samma `ci.yml` som S4 → får ej parallellköras med S4.** S2 auto-merge vid grön; S4 = fråga Jake först.
- **2026-06-18** — S4 klar → PR #150. Nytt blockerande `schema-drift`-jobb (`npm run db:schema-drift`, ingen continue-on-error) mellan `quality` och warn-only `stability`. `db:schema-drift` grön utan DB-creds, typecheck 0, ci.yml giltig YAML. Worktree kvar för städ efter merge. **Väntar Jakes ja före merge** (medel-risk: CI-gate-beteende). PR-CI: nya `schema-drift`-jobbet **pass** (gaten fungerar).
- **2026-06-18** — S2 klar → PR #151. Ny `src/lib/builder/aao-invariant.stability.test.ts` (4 tests) som round-trippar prompttext genom `createCodeGenSSEStream`→`consumeSseResponse` med 1-byte-chunkning → fångar mojibake om `{ stream: true }` tappas. Ingen live-builder rörd. `test:stability` 4/4, typecheck/eslint 0. Auto-merge vid grön+bot-rent.
- **2026-06-18** — **Automation-koll (Jakes fråga):** ingen auto-merge-automation finns (inget mergify/kodiak/`gh pr merge`-workflow i `.github`, inga lokala Cursor-automations, `#151.autoMergeRequest = null`). Workflows = `ci`/`eval-baseline-update`/`weekly-template-sync`, ingen mergar PR. → Merge är manuell via orchestrator-policy. Ingen regel skapad (skulle dokumentera en automation som inte finns).
- **2026-06-18** — S2 #151 **mergad** (helt grön, bot-rent). Worktree + branch borta, master FF → `06d7e70b3`.
- **2026-06-18** — **Auto-merge-automation upptäckt:** PR #152 (C1) mergades av `app/cursor`/`cursor[bot]` 13:21Z — byggaren var instruerad att INTE merga, övriga 14 senaste PR:er mergades manuellt av Jake. → Cursor-side automation (cloud, ej i repo) kan merga gröna öppna PR:er. Ny regel skapad: `.cursor/rules/auto-merge-automation.mdc` (alwaysApply) + indexerad i `.cursor/README.md`. Risk-PR:er ska öppnas som **draft**.
- **2026-06-18** — S4 #150 **mergad** (grön + bot-rent, ny policy: trygg+grön→merga). master FF → `5aed2fd28`. **Område 2 (stabilitet) klart:** S1✓ S2✓ S4✓; S3 flyttad till område 6. C1 #152 mergad (automation). Progress ~39%.
- **2026-06-18** — C2 dispatchad (ordlista-check, warn-först). `ci.yml` fritt nu (S4 mergad) → C2 wirar sin warn-only-check i stability-jobbet. Owner: `config/naming-dictionary.json` + `scripts/dev/check-term-coverage.mjs` + `ci.yml`-steg.
- **2026-06-18** — C2 klar → PR #153 (`check:terms` warn-först, exit 0; demoUrl 158/sandbox 67/dashboard 79/v0 92 m.fl. flaggade). **Auto-mergaren "PR-mergare" identifierad i detalj** via dess `NEEDS_HUMAN`-verdict på #153: Cursor Automation (ID `59ae4961-…`), `pull_request`-triggad, auto-mergar BARA risk 1–2 utan protected paths (`.github/workflows/**`, `package.json`, `src/lib/db|auth/**`, `src/app/api/**`). #152 (C1, ren docs) auto-mergades; #153 (rör ci.yml+package.json) → NEEDS_HUMAN. Regel `auto-merge-automation.mdc` uppdaterad med faktisk guard-logik.
- **2026-06-18** — Codex **P2** på #153 (giltig, false-green-nära): C2-steget efter `test:stability` hoppas över om stability-steget fallerar (default `success()`), så checken försvinner när den behövs. C2-byggaren återupptagen → fix `if: ${{ !cancelled() }}` (`ad60f3455`), besvarade Codex-tråden.
- **2026-06-18** — C2 #153 **mergad** manuellt (grön på nya head, P2 åtgärdad+besvarad, inga nya fynd, PR-mergaren NEEDS_HUMAN pga protected path). master FF → `06c0c0770`. **Område 3 (kontrakt C1/C2) klart.** Progress ~44%. Alla orchestrator-byggare klara+städade. Kvar-worktrees: huvud, `db-sync-test` (Jakes), `hydration` (#149, annan agent).
- **2026-06-18** — **Område 7 startad ur sekvens** (Jakes val A; samordnat med #149, ej överlapp). Beslut inhämtade: merga bara grön+okej; A7-1+A7-2 scope; lämna #149 till sin agent; max 2 byggare; #140 parkerad. Kartlade ytor (explore): kanonisk status = `selectVersionStatus` (event-bus-projection.ts); stubbar är **avsiktligt warning-only** på master; N#1 dossier-stub-refusal är flag-gated P5+ (`FEATURES.refuseDossierStubs`, default-off) — "kan flippa röd/bryta gen". Skapade A7-1/A7-2-aktivitetsdocs. Dispatchade 2 byggare: **A7-1** (test-only, låser `done`≠solid-green, auto-merge vid grön) + **A7-2** (flag-gated default-OFF dossier-stub-guard, **draft** för Jakes review).
- **2026-06-18** — A7-1 #155 **mergad** (grön + bot-rent, 1 testfil +137/-0, noll runtime). master FF → `a76f77eed`. PR-mergaren gav `NEEDS_HUMAN` Risk 5 trots test-only → **`src/lib/logging/**` är också protected path** (lade till i `auto-merge-automation.mdc`). A7-2 (draft) kör vidare.
- **2026-06-18** — A7-2 klar → **draft PR #156** (ej mergad). `FEATURES.refuseDossierStubs` default-OFF (`src/lib/env.ts` + `config.ts`); flag-gated gren i `cross-file-import-checker.ts` (nytt optional `refused`-fält). Flagga PÅ → ingen tyst stub, oresolvad import fångas av **befintlig** `runProjectSanityChecks` "Unresolved local import" → degrade/block (ingen pipeline-ändring behövdes). Default-off-paritet bevisad (checker-test 13/13, stability 7/7, typecheck/eslint 0). **Batch 2 klar — orchestrator stannar här (Jakes "max 2 → stanna").**
- **2026-06-18** — ÖPPET FÖR JAKE: (1) granska + merga **#156** (område 7 runtime, default-off); (2) beslut om att flippa `SAJTMASKIN_REFUSE_DOSSIER_STUBS` PÅ — kräver att område 5/6 landat först (annars kan status flippa röd); (3) vid default-flipp: följd-PR som lägger env-nyckeln i `config/env-policy.json` + `docs/ENV.md`; (4) **#149** (annan agent, promote-guard) kvarvarande P2/P4/P5 + merge-beslut; (5) **#140** parkerad tills bot-trådar hanterade.
- **2026-06-18** — **Sidospår (annan agent, ur sekvens):** PR #149 promote-guard / false-green = **område 7** (wave 3, normalt sist), landad tidigt pga live prod-incident. `/quality-gate`-routen returnerade `passed:true` även vid promote-block → nu `promotionBlocked:true` + `promotionBlockedReason`. Draft, MERGEABLE, 10/10 tester. **Område 7 = beteende/runtime → fråga Jake före merge** (ej orchestratorns auto). Den agentens lokala `_loggbok.txt` i worktree-roten är efemär → kanonisk loggbok = denna fil (`docs/plans/active/grandmaster/_loggbok.md`); #149-posten bor här. OBS: agentens föreslagna "nästa slice = S1" är **inaktuell** — S1 redan mergad (#147), S2/S4 i review.
- **2026-06-18** — **#149 övertagen + mergad** (Jakes val "ta över helt" efter coach-review). Verifierade read-only mot `49c51c8a1` att alla botfynd är åtgärdade i kod: P1 route-läcka → `passed:false`+`promotionBlocked` (+ `post-checks.ts`-konsument), P2 promote-fel → egen `promoteError`-gren, P2 stale-telemetri → `recordRepairPassedQualityGate`, eget fynd → `acceptRepair` kör `assertPromoteAllowed`. Körde 11/11 tester i hydration-worktreet. Städade: samlad re-review-kommentar, **6 trådar resolvade**, stale `CHANGES_REQUESTED` (review 4525185685) **dismissad**, body 6→7 filer + 10→11 tester. Squash-mergad → master FF `6d34a3707`→`b8d85a338`. Worktree + branch (lokal+remote) borta. **Område 7 runtime-kärna klar; progress ~55%.** #149:s P2/P4/P5 = separata follow-ups.
- **2026-06-18** — Handoff + reconcile committat till master (`f48fbaeab`): körnings-handoff, denna loggbok, auto-merge-regel. Coach-review (säkerhet 90%) flaggade **stale planstatus** (äkta fynd) + loggbok-saknad (falskt: såg GitHub före push). **Docs-only reconcile:** aktivitetsfiler S1/S2/S4/C1/C2/D2 `status: ready`→`done` med PR-ref; S3 förtydligad som enda öppna (gated omr 6); `aktiviteter/README.md`-tabell + `00-master-plan §9` synkade mot verkligheten. Coachens PR-domar (#149 re-review=annan agent, #140 parkera, #154 blocka, #156 draft) = redan i linje, ingen orchestrator-åtgärd.
