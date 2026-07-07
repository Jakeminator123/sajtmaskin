# Agent-prompt — Fas 6: Eval-svit & mät-tooling (smarthet 6/10)

Kopieras rakt in i en cloud-agent efter att Fas 3 (PR #364) mergats. Kan köras
parallellt med Fas 5-agenten (inga delade filer). OBS: agenten bygger tooling +
fixtures — själva prod-mätningen och policybesluten görs av orkestratorn/ägaren
efteråt (cloud-agenten har inte prod-DB-åtkomst).

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas6-evalsvit`, leverera EN PR mot master.

MISSION: Kontrollflödet har byggts om (PR #361/#362/#363/#360/#364: telemetri-hygien, preview-resync, import-normalisering före LLM, riskScore-verifier-policy, en repair-port med samma-signal-verifiering). Effekten ska nu kunna BEVISAS. Du levererar två saker: (1) en deterministisk eval-svit som reproducerar de historiskt vanligaste felklasserna mot dagens normalize/repair-pipeline utan LLM- eller DB-beroende, och (2) ett jämförelseverktyg som ställer färska control-stats-siffror mot den frysta baslinjen. Prod-datan (14 d t.o.m. 2026-07-02, 115 genereringar) som motiverar allt: 84 % av typecheck-felen var importrelaterade (TS2304 kända imports 60, TS2300 fixer-skapad dubbelimport 18, egna komponenter/Reveal 14), verifiern skippades i 69 % av körningarna, 1/28 gate-failade versioner räddades av repair.

LÄS FÖRST: `AGENTS.md`, `docs/schemas/quality-gate.md` (inkl. Fas 0:s frysta baslinje-avsnitt), `scripts/db/control-stats.mjs` (query-nycklarna, inkl. Fas 0:s `serverRepairOutcomes`/`deployOutcomes`/`dossierUsage` och Fas 2:s risk-/legacy-heavy-mappning), `src/lib/gen/autofix/deterministic-import-repair.ts`, `src/lib/gen/autofix/validate-and-fix.ts`. Verifiera mot koden; notera avvikelser i PR-body.

UPPGIFTER:

1. Eval-svit: `src/lib/gen/autofix/eval/` (fixtures + runner som vitest-fil).
   - ~20 deterministiska fixture-fall som var och en är en minimal fler-filsprojekt-snapshot (samma innehållsformat som pipelinen tar — titta på hur `validate-and-fix.test.ts` och `deterministic-import-repair.test.ts` bygger testinnehåll) med ett KÄNT historiskt fel, plus förväntat utfall efter det deterministiska normalize-/import-repair-passet.
   - Täck minst dessa klasser (härledda ur prod-statistiken; exakta symboler från `ts2304-known-import-fixer`-mappningen):
     a. TS2304 känd shadcn-komponent utan import (Badge, Button — historiskt 20+16 träffar)
     b. TS2304 `Link`/next-import saknas (6)
     c. TS2304 `LucideIcon`-typ + lucide-ikon saknas
     d. TS2304 egen komponent som finns i fillistan (Reveal-klassen, named + default export-varianterna)
     e. TS2304 egen komponent som INTE finns (ska INTE stubbas av normalize — förväntat: orörd/residual)
     f. TS2300 dubbel React-import (smörsajt-mönstret: befintlig `import React` + injicerad `import { useEffect }` — förväntat: EN konsoliderad import)
     g. TS2300 same-module-dubblett för icke-React-modul
     h. TS2440/TS1361/TS2552-varianterna som `deterministic-import-repair` hanterar
     i. shadcn∩lucide-kollisionsnamn med tydlig usage (children → shadcn; self-closing ikon → lucide)
     j. Blandfall: 3–4 fel i samma projekt (verifierar att passet inte introducerar nya dubbletter — kör dedupe-kvittot)
   - Runnern kör det deterministiska passet (INTE LLM — mocka/undvik `runLlmRepairGate` helt) och asserterar: förväntade imports finns, inga dubbelbindningar, residual-fall orörda. Varje fall får id + kort kommentar med prod-belägg ("Badge 20 träffar 14d-fönstret").
   - Sviten ska köras av vanliga `npx vitest run` (inga nätverk/DB/env-krav) och därmed ingå i CI automatiskt.

2. Baseline-jämförelseverktyg: `scripts/observability/compare-control-stats.mjs`.
   - Input: två JSON-filer (eller `--baseline`/`--current` paths) i det format `control-stats.mjs --json` skriver.
   - Lägg först in den frysta baslinjen som incheckad JSON: `scripts/observability/control-stats-baseline-2026-07-02.json` — bygg den ur siffrorna i Fas 0:s baslinje-avsnitt i `docs/schemas/quality-gate.md` (fältnamn ska matcha control-stats-outputen; det som inte finns i avsnittet markeras `null` med kommentar).
   - Output: en tabell (stdout, + `--md`-flagga för markdown) med KPI-raderna från master-planens mål: quality gate pass-%, typecheck-först-andel av gate-fails, importrelaterad andel av typecheck-fel (om härledbar ur datan — annars markera "kräver error-log-aggregat"), verifier-skip-% + skip-reasons (nya `safe_fixes_only` vs legacy heavy-load), repair-räddningsgrad, andel versioner failed, samt Fas 0-fälten (serverRepairOutcomes-fördelning, deployOutcomes, dossierUsage-topp).
   - Verktyget läser BARA filer — inga DB-anrop, inga secrets. Orkestratorn kör `control-stats.mjs` mot prod själv och matar in resultatet.
   - Lägg npm-script: `"stats:compare": "node scripts/observability/compare-control-stats.mjs"`.
   - Självtest: en liten vitest-fil eller `--self-test`-flagga med två inbäddade minimala JSON-exempel (följ mönstret från `scripts/dev/check-autofix-risk.mjs --self-test`).

3. Docs: kort avsnitt i `docs/schemas/quality-gate.md` under baslinje-avsnittet: hur mätavstämningen körs (tre kommandon: pull prod-snapshot → control-stats --json → stats:compare), vem som äger den (orkestrator/ägare) och att eval-sviten är CI-buren. Ersätt ev. gammal "kör om om en vecka"-prosa med detta.

STOPPREGLER:
- Ändra INTE pipeline-/repair-/gate-kod. Hittar du en bugg via eval-fallen: fixa INTE flödet i denna PR — dokumentera fyndet i PR-body och lägg en rad i `BUG-SWARM-BACKLOG.md` (§ Aktiv kö-format) med fil-ankare + repro (eval-fall-id).
- Inga nätverks-/DB-/secret-beroenden i något du levererar. `control-stats.mjs` får inte ändras semantiskt (endast om `--json`-outputen saknar ett fält jämförelsen behöver — då additivt fält, ingen ändring av befintliga nycklar).
- Eval-fixtures ska vara syntetiska minimala — kopiera INTE in riktiga användarsajter/prod-innehåll.
- Skapa inga filer under `docs/plans/`.

SOPA FRAMFÖR EGEN DÖRR: om du ersätter "kör om"-prosa i docs: ta bort den gamla texten; inga TODO-stubbar i eval-sviten — varje fall komplett med assertion.

TESTER & VERIFIERING:
- `npx vitest run src/lib/gen/autofix/eval/` → alla eval-fall gröna (eller dokumenterat förväntat-residual).
- `node scripts/observability/compare-control-stats.mjs --self-test` → OK.
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel.

PR-KRAV:
- Titel: `feat(eval): fas 6 kontrollflöde - deterministisk eval-svit + baseline-jämförelseverktyg`
- Body: eval-fallens tabell (id, felklass, prod-belägg, utfall), ev. buggar funna av sviten (med backlog-rad), jämförelseverktygets användning, verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review) med triage av varje fynd.
- Committa aldrig `.env*`, `.vercel/` eller secrets.

DEFINITION OF DONE:
- [ ] ~20 eval-fall täcker klasserna a–j, körs i vanlig vitest/CI utan nätverk
- [ ] Baslinje-JSON incheckad + `stats:compare` fungerar med `--self-test`
- [ ] Docs beskriver mätavstämningens tre steg och ägarskap
- [ ] Ev. fynd loggade i BUG-SWARM-BACKLOG (inte fixade i denna PR)
- [ ] typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
