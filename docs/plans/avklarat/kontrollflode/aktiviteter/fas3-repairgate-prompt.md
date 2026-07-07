# Agent-prompt — Fas 3: En repair-port (RepairGate) (smarthet 9/10)

Kopieras rakt in i en cloud-agent EFTER att Våg A+B (PR #360–#363) mergats till master.
Körs ensam (Våg C) — inga parallella agenter.

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas3-repairgate`, leverera EN PR mot master (får delas i två sekventiella PR:ar — "routing" och "kontrakt" — om diffen växer förbi ~1500 rader).

MISSION: All LLM-repair ska gå genom EN port, och en repair får bara kallas lyckad när SAMMA signal som failade passerar igen. Prod-data 14 d: av 28 versioner med blockerande gate-fel räddades 1 (3,6 %) till promoted. Fyra strukturella orsaker: (1) repair-LLM:en optimerar mot syntaxdiagnostik men gaten mäter tsc ("0 errors remain" → gate failar ändå, 12+4 fall); (2) max 2 pass + no_improvement-fail-fast ger upp tidigt; (3) kapplöpningar — nyare version gör repairen inaktuell och resultatet kastas (4 fall); (4) server-repair kringgår RepairLedger (dedupe-liggaren) helt.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`, `docs/schemas/quality-gate.md`, `docs/architecture/runtime-contracts.md`. Radnummer nedan är ungefärliga (master rör sig) — lokalisera via symbolnamn. Om ett påstående inte stämmer mot koden: följ koden och notera avvikelsen i PR-beskrivningen.

NULÄGE (kodverifierat före Våg A+B; fyra PR:ar har mergats sedan dess — verifiera):
- Alla finalize-vägar (warm-tsc, warm-eslint, esbuild-syntax, verifier, partial-file, home-route, merged-syntax) går redan via `runLlmRepairGate` (`src/lib/gen/autofix/llm-repair-gate.ts`, gate-wrappern anropar `runLlmFixer` ~rad 197).
- `RepairLedger` (~rad 41–119) dedupar på `scopeId:chatId:contentHash:diagnosticFingerprint:requiredFiles`; `scopeId` faller tillbaka till `chatId` (~rad 163).
- MEN server-repair-loopen anropar `runLlmFixer` DIREKT: `src/lib/gen/verify/repair-loop.ts` (`runFixerAttempt`, ~rad 632) — ingen ledger, ingen dedupe. Två lanes konsumerar loopen: server-verify (`src/lib/gen/verify/server-verify.ts`, `tryServerRepairLoop` ~rad 355–450) och manuell repair (`src/app/api/engine/chats/[chatId]/repair/route.ts` ~rad 458).
- Sedan Fas 1 (#363): deterministisk import-repair bor i `src/lib/gen/autofix/deterministic-import-repair.ts` (delad modul) och körs både i finalize och i repair-loopen.
- Sedan Fas 0 (#361): `resolveServerRepairOutcome` (`src/lib/gen/verify/server-verify-log-meta.ts`) är ENDA ägaren av repair-outcome-strängar (t.ex. `syntax_clean_gate_failed`). Behåll den som single owner — utöka enumen bara om ett genuint nytt utfall uppstår.
- Targeted repair-bundle: `buildTargetedRepairBundle` (`repair-loop.ts` ~rad 372, anrop ~607–614, mergeBack ~670–672) skickar delmängd filer till LLM.
- Partial-file-repair i preflight (`finalize-version/partial-file.ts`) går redan via gaten — RÖRS INTE i denna fas (mäts, utfasningsbeslut senare).
- Budgetar: `repairDeadlineEpochMs` + pass-budgetguard (`repair-loop.ts` ~rad 569 — pass 0 får ALLTID köras, medveten garanti) + `resolveFinalGateVerifyBudget` för slutverifiering. Lease: `engine_version_jobs` via `acquireVersionLease`/`renewVersionLease` (`chat-repository-pg.ts`).
- Base-bound repair-save/accept finns (stale-base skyddas vid save/accept), men loopen kan fortfarande jobba klart på en superseded version och få resultatet kastat i efterhand.

UPPGIFTER:

1. Routa repair-loopens LLM-anrop genom gaten.
   - Ersätt det direkta `runLlmFixer`-anropet i `runFixerAttempt` med `runLlmRepairGate` (eller en tunn variant av gaten om dess signatur kräver det — men EN gate-implementation, ingen kopia).
   - Tråda `repairScopeId` (server-repair har versionId — använd `{versionId}:repair-{pass}`-mönstret som finalize använder, se `runner.ts`) och en delad `RepairLedger`-instans per körning så dedupe fungerar ÖVER lanes: samma innehåll + samma diagnostik som redan LLM-lagats i finalize ska inte lagas igen i server-repair.
   - Ledger-nyckeln innehåller contentHash — legitima retries på NYTT innehåll ska inte blockeras. Verifiera med test.

2. Samma-signal-kontrakt: repair-framgång = ursprungssignalen passerar.
   - Inför en explicit mappning i repair-loopen: ursprungsfel → verifieringskrav innan utfallet får bli lyckat:
     - parse/esbuild-fel → parser/esbuild-pass på reparerade filer
     - tsc-fel (TS2xxx) → tsc-pass (warm/targeted där möjligt, annars gate-typecheck)
     - build-fel (F3) → build-pass
     - verifier-blocking → verifier-fyndet stängt + promote-guard opåverkad
   - Använd befintliga verifieringsvägar och budgetar (`resolveFinalGateVerifyBudget`, gate-checks) — bygg ingen ny verifieringsinfrastruktur och lägg ingen ny okontrollerad väntetid.
   - Ett pass som lagar syntax men inte når ursprungssignalens pass får ALDRIG rapporteras som lyckat — använd `resolveServerRepairOutcome`-enumen (t.ex. `syntax_clean_gate_failed`).

3. Bättre mål för repair-LLM:en.
   - När ursprungsfelet är tsc: skicka tsc-output som primär diagnostik (inte bara syntaxfel), plus ändrade filer och senaste misslyckade patch-försök (pass > 0) så modellen inte upprepar sig. Import-graf/registerkontext: inkludera det som redan finns tillgängligt billigt — bygg ingen ny analys.
   - Max antal pass ändras INTE (2). Förbättringen ska komma från rätt mål, inte fler pass.

4. Base-aware tidig abort.
   - Kontrollera vid pass-start (och före slutverifiering) om versionen är superseded/inaktuell (nyare version finns, eller `files_json` har avancerat). Om ja: avbryt loopen tidigt med outcome `superseded_by_newer_version` (finns i Fas 0-enumen — verifiera namnet) i stället för att jobba klart och kastas.
   - Leasen släpps korrekt vid tidig abort (`finally`-vägen finns — verifiera).

5. Städning.
   - Det direkta `runLlmFixer`-anropet + ev. hjälpkod som blir död tas bort i samma PR. Nettoresultat: `runLlmFixer` har EN produktions-callsite (inuti gaten). Lägg gärna en lint-/testvakt som asserterar detta (t.ex. test som greppar produktionskod efter `runLlmFixer(`-anrop utanför `llm-repair-gate.ts`).
   - Docs i samma PR: repair-avsnitten i `docs/schemas/quality-gate.md` + repair-kontraktet i `docs/architecture/runtime-contracts.md` uppdateras till en-port-modellen. Ersätt gammal text.
   - Rör INTE `docs/plans/**` — orkestratorn uppdaterar planarkivet (L1-planen markeras superseded separat).

STOPPREGLER:
- Lease-/låsmodellen (`engine_version_jobs`) byggs inte om. Repair-routens 503-retrybara beteende vid onåbar verify-lane bevaras.
- Pass 0-garantin (alltid minst ett fixer-försök) bevaras — ändra inte budgetguardens semantik.
- `assertPromoteAllowed`/promote-guard, F3-strikthet, `RENDER_RISK_TS_CODES` rörs inte. F2 advisory-safe typefel ska fortsatt INTE trigga repair.
- Partial-file-repair i preflight och targeted-bundle-mekaniken behålls funktionellt (bundlen ska dock gå via gaten som allt annat).
- Inga nya `runLlmFixer`-callsites; inga nya repair-lanes; ingen ny verifieringsinfra.
- `resolveServerRepairOutcome` förblir enda ägaren av outcome-strängar.

SOPA FRAMFÖR EGEN DÖRR: borttagen direktanropsväg lämnar inga döda exports/importer; tester som asserterar gamla beteendet uppdateras (inte dubbleras); docs ersätter.

TESTER & VERIFIERING:
- Ledger-dedupe över lanes: samma content+diagnostik LLM-lagad i finalize → server-repair skippar (deduped); nytt innehåll → tillåts.
- Samma-signal: tsc-ursprung där LLM bara lagar syntax → utfall är INTE lyckat; tsc-ursprung där tsc passerar efteråt → lyckat.
- Superseded-abort: version avancerar under pass → tidig abort med rätt outcome + släppt lease.
- Uppdatera/utöka `repair-loop.outcome.test.ts`, `server-verify.test.ts`, `repair/route.test.ts`, `llm-repair-gate.test.ts`.
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på `src/lib/gen/verify/` + `src/lib/gen/autofix/` + repair-routen → grönt.

PR-KRAV:
- Titel: `feat(repair): fas 3 kontrollflöde - en repair-port (RepairGate) + samma-signal-verifiering`
- Body: before/after-flöde (direktanrop vs gate), samma-signal-mappningen som tabell, dedupe-semantiken över lanes, superseded-abort-designen, verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review) med triage av varje fynd (fixed/logged/dismissed).
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] `runLlmFixer` har en enda produktions-callsite (gaten) + vakt-test
- [ ] RepairLedger aktiv i server-repair + manuell repair; dedupe över lanes testad
- [ ] Samma-signal-kontraktet implementerat och testat per felklass
- [ ] tsc-output + prior-patch-kontext når repair-LLM:en vid tsc-ursprung
- [ ] Superseded ⇒ tidig abort med korrekt outcome + lease-släpp
- [ ] Docs (quality-gate.md, runtime-contracts.md) speglar en-port-modellen
- [ ] typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
