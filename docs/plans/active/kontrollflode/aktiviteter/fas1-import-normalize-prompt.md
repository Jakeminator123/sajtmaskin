# Agent-prompt — Fas 1: Import-normalisering uppströms (smarthet 9/10)

Kopieras rakt in i en cloud-agent. Merge-ordning i vågen: **0 → 4 → 1 → 2** (denna mergas före Fas 2).

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas1-import-normalize`, leverera EN PR mot master. Detta är kärnpipeline med hög regressionsrisk — jobba i små, verifierbara steg.

MISSION: Eliminera de två största felklasserna i quality gate FÖRE gaten, mekaniskt. Prod-data 14 d (115 genereringar): 84 % av typecheck-felen är importhantering — TS2304 "Cannot find name" för KÄNDA imports (60 träffar: Badge 20, Button 16, Reveal 14, Link 6, LucideIcon/toast/createRouteMatcher) och TS2300 "Duplicate identifier" (18 träffar: useEffect/useState/ReactNode — dubbel React-import som systemets egen repair-väg skapar). Båda är mekaniskt lösbara; idag fixas de först EFTER att gaten failat.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`, `docs/architecture/llm-pipeline.md`, `docs/contracts/fixer-registry.md`. Radnummer nedan är från master 2026-07-02 — lokalisera via symbolnamn. Om ett påstående inte stämmer mot koden (masterkoden rör sig snabbt, t.ex. #356 Badge-kollisionsfix mergades idag): följ koden och notera avvikelsen i PR-beskrivningen.

NULÄGE (kodverifierat):
- `ts2304-known-import-fixer` (`src/lib/gen/autofix/rules/ts2304-known-import-fixer.ts`, `fixKnownTs2304Imports` ~rad 406; registrerad i `fixer-registry.ts` ~347–366 med `ownerPhase: "server-repair"`) anropas ENDAST från `src/lib/gen/verify/repair-loop/deterministic-import-repair.ts` (~rad 167) — dvs. efter gate-fail.
- `runDeterministicImportRepair` (samma fil) kör TS2304/TS2552, TS1361, TS2440, TS2300-hantering före LLM i server-repair (`repair-loop.ts` ~rad 469–481) — men i finalize går warm-tsc-fail DIREKT till LLM: `src/lib/gen/autofix/validate-and-fix.ts` ~rad 235–255 → `runLlmRepairGate` (phase `"warm-tsc"`).
- Dedupe-gapet: `deterministic-import-repair.ts` (~rad 237–259) kör bara `fixDuplicateImportBindings` + `fixDuplicateImportAndLocalTypeCollision`. `fixDuplicateImportBindings` slår INTE ihop två separata `import ... from "react"`-rader — det gör `consolidateReactImports` (`src/lib/gen/autofix/rules/react-import-consolidated.ts` ~rad 308, 445), som bara körs i finalize-autofixen (`pipeline.ts` ~rad 582). Därför skapar repair-vägen TS2300.
- `repairScopeId` tappas: `validate-and-fix.ts` anropar `runWarmTscPass` (~655–666, ~898–909) och `runWarmEslintPass` (~679–690, ~918–929) UTAN att skicka `repairScopeId` — funktionerna accepterar den (opts ~rad 157 resp. ~336) och RepairLedger-scopet faller tillbaka till chatId.
- `import-validator` (`src/lib/gen/autofix/import-validator.ts`) gör regex-import-merge; kodkommentaren ~rad 1128 kallar den "highest-corruption-risk mechanical step". `runImportValidatorGuarded` (~1146–1193) revertar bara parse-regressioner — TS2300/dubbelbindningar passerar.

UPPGIFTER:

1. Deterministisk import-repair FÖRE LLM vid warm-tsc-fail i finalize.
   - Ny ordning i `validateAndFix` när warm-tsc failar: (1) kör deterministisk import-repair på tsc-diagnostiken (TS2304/TS2552/TS1361/TS2440/TS2300), (2) kör dedupe/konsolidering (se uppgift 2), (3) kör warm-tsc igen (targeted på ändrade filer om möjligt), (4) ENDAST om fel kvarstår → `runLlmRepairGate` som idag.
   - Lagring/layering: `deterministic-import-repair.ts` bor under `verify/repair-loop/`; `validate-and-fix.ts` bor under `autofix/`. Om import verify→autofix skapar cykel: extrahera kärnlogiken till en delad modul under `src/lib/gen/autofix/` och låt repair-loop konsumera samma implementation. EN implementation — ingen kopia. Ta bort gamla filen om allt flyttar (uppdatera alla importer + tester i samma PR).
   - Server-repair-vägen (`repair-loop.ts` ~469–481) ska fortsätta fungera oförändrat semantiskt (samma funktion, nu även anropad från finalize).

2. React/same-module-dedupe efter VARJE import-injektion.
   - Lägg `consolidateReactImports` + same-module-konsolidering + dubbelbindnings-validering som obligatoriskt eftersteg i den deterministiska import-repairen (stänger TS2300-klassen och "smörsajt"-scenariot: dubbel React-import i `components/three-canvas-shell.tsx` → webpack-krasch → preview-500).
   - Princip: ingen fixer ska kunna lämna ifrån sig två import-statements från samma modul med överlappande bindningar. Om ett sådant tillstånd upptäcks efter en fixer: konsolidera eller reverta fixerns ändring.

3. `ts2304-known-import-fixer` blir del av normalize-flödet.
   - Den är diagnostikdriven (kräver tsc-output) — exakt vad som finns vid warm-tsc-fail. Uppdatera registry-metadata (`ownerPhase`) så den speglar att fixern körs både i finalize-normalize och server-repair. Anpassa till registryts typer med minsta möjliga ändring.

4. Egen-komponent-klassen (Reveal, 14 träffar).
   - Vid TS2304 på ett namn som INTE finns i known-import-mappningen: kolla mot versionens egen fillista. Finns en matchande egen komponentfil → importera den. Finns ingen → låt befintligt beteende (cross-file-checker/stub) gälla; skapa INTE nya tysta stubbar i normalize. Ingen full component-registry — bara klassificeringen känt bibliotek vs egen fil vs okänt.

5. Tråda `repairScopeId` till alla fyra `runWarmTscPass`/`runWarmEslintPass`-callsites (skicka `repairScopeId: opts.repairScopeId`). Gäller även nya anrop du inför.

6. Begränsa `import-validator`:s blast radius.
   - Utöka guarden så att den även revertar när fixern INFÖR nya dubbelimport-bindningar från samma modul (billig post-check per fil, parser-baserad — ingen ny regex).
   - Om någon av dess JSX-scan-injektionsgrenar blir helt redundant mot den diagnostikdrivna vägen: ta bort grenen + dess tester i samma PR. Radera inte hela fixern i denna fas.

7. Docs-synk i samma PR: `docs/contracts/fixer-registry.md` (pipeline-ordning + ownerPhase) och `docs/architecture/llm-pipeline.md` (Fas 3 "typisk ordning": deterministisk import-repair före LLM-fix). Ersätt gammal text.

STOPPREGLER:
- Rör INTE verifier-policyn (`fast-path.ts` ~302–313, `policy.ts`) — Fas 2 äger den. Rör inte `persist-telemetry.ts` (Fas 0) eller preview/restore-ytor (Fas 4).
- Inga nya `runLlmFixer`- eller `runLlmRepairGate`-callsites — flytta/återanvänd befintliga vägar.
- Ingen ny regex-importkirurgi. Nya import-mutationer ska vara parser-säkra och valideras (parse + dedupe-kvitto).
- `RENDER_RISK_TS_CODES`, F3-gaten och promote-guarden rörs inte.
- Max 2 extra warm-tsc-pass per finalize (kostnadstak) — ingen loop.

SOPA FRAMFÖR EGEN DÖRR: flyttas logik → gamla filen/exporten bort + alla importer uppdaterade; redundanta JSX-scan-grenar bort med sina tester; docs ersätter.

TESTER & VERIFIERING:
- Regressionstest för smörsajt-mönstret: fil med befintlig React-import där repair-vägen injicerar `useEffect/useState/ReactNode` → resultatet har EN konsoliderad React-import, ingen TS2300.
- Test: TS2304 på känt bibliotek (Badge/Link) fixas deterministiskt vid warm-tsc-fail UTAN LLM-anrop (assertera att `runLlmRepairGate` inte anropas när deterministiska passet löser allt).
- Test: egen-komponent-klassificeringen (finns fil → import; finns ej → oförändrat beteende).
- Utöka `deterministic-import-repair.test.ts`, `validate-and-fix.test.ts`, `react-import-consolidated`-tester.
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på `src/lib/gen/autofix/` + `src/lib/gen/verify/` → grönt · `node scripts/dev/check-unicode-regex.mjs` om du rört regex.

PR-KRAV:
- Titel: `feat(autofix): fas 1 kontrollflöde - deterministisk import-normalisering före LLM och gate`
- Body: ny flödesordning (diagram/lista), vilka felklasser som stängs mekaniskt, layering-beslutet (flytt/delad modul), verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review) med triage av varje fynd.
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] Warm-tsc-fail → deterministisk import-repair + dedupe + re-check FÖRE LLM
- [ ] `consolidateReactImports`/same-module-dedupe körs efter varje import-injektion inkl. server-repair-vägen
- [ ] `ts2304-known-import-fixer` aktiv i normalize-flödet, registry-metadata uppdaterad
- [ ] Egen-komponent-klassificering på plats (utan component registry)
- [ ] `repairScopeId` trådad i alla warm-pass-anrop
- [ ] import-validator-guarden fångar även dubbelbindningar
- [ ] Docs synkade; flyttad/borttagen kod lämnar inga döda importer
- [ ] typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
