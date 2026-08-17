# Eval — en canonical körväg

Sajtmaskin har **en** publik eval: `npm run eval`. Follow-up-context och
scaffold-selection är **interna delkontroller** (lanes) i samma körning, inte
egna produkter med egna CLI:n eller egna dokument.

Kanonisk kod: den här mappen. Kanonisk regel: `.cursor/rules/evals.mdc`.

## TL;DR

| Vill du … | Kör | Tid | Pengar |
|---|---|---|---|
| Köra de avgiftsfria lanerna | `npm run eval` | ~10–20 sek | Noll. Kräver inte `OPENAI_API_KEY` eller `POSTGRES_URL`. |
| Samma + 3 codegen-prompts (smoke) | `npm run eval -- --codegen` | ~3–8 min | OPENAI-quota för 3 prompts + DB |
| Samma + alla 18 codegen-prompts | `npm run eval -- --full` | ~15+ min | OPENAI-quota för 18 prompts + DB |
| En namngiven prompt + dump failande filer | `npm run eval -- --prompts=arcade-with-klarna --dump-files` | ~1–4 min | OPENAI-quota för den prompten + DB |
| Maskinläsbar utskrift (Backoffice) | lägg till `--json` | samma | samma som läget ovan |

Default **utan flaggor kostar noll**. Codegen-lanen startar bara efter `--codegen`, `--full`, `--prompts=…`, eller de tillfälliga flaggorna `--gate` / `--save-baseline` (full svit; tas bort i nästa PR).

## Lanes

Varje körning returnerar **separata** delresultat. Slå inte ihop tre procenttal till ett totalbetyg.

| Lane | Default | Vad den mäter | Kräver |
|---|---|---|---|
| `followup` | alltid | Follow-up-context och promptstorlek via `prepareGenerationContext`, utan LLM-codegen | inget |
| `scaffold` | alltid | Att `matchScaffoldAuto()` väljer rätt scaffold. Skriver `data/scaffold-eval/reports/scaffold-selection-latest.json` (samma path canvas + Backoffice "Eval exact-hit" redan läser) | inget. Semantisk ranking används bara om nyckel + embeddings redan finns; saknas de degraderar semantiken till keyword, vilket inte failar lanen |
| `codegen` | av | Hela orkestreringen + LLM-codegen + 12 checks för 3 eller 18 prompts | `OPENAI_API_KEY` + `POSTGRES_URL` |

Topputfall: `PASS` / `FAIL` / `PROVIDER_ERROR` / `INFRA_ERROR`. Exit 0 / 1 / 2 följer `resolveEvalRunOutcome` + `evalExitCode` i `runner.ts` för codegen, och `resolveCanonicalOutcome` i `canonical.ts` för hela körningen. Ett provider-/infra-fel i codegen vinner över en kvalitetsmiss.

Scaffold-lanens utfall härleds ur `keywordTop1Accuracy` mot
`SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT` i `canonical.ts` (ägbar policy,
inte en naturlag). Semantisk ranking (`semanticTop1Accuracy`) rapporteras
men styr inte utfallet — saknas embeddings lokalt degraderar semantiken
till keyword, vilket är förväntat och inte en fail.

`--json` skriver **bara** JSON på stdout (mänsklig text på stderr). Formen är stabil för Backoffice: `timestamp`, `mode`, `outcome`, `exitCode`, `lanes.{followup,scaffold,codegen}`. Codegen-lanen bär `skipReason` (`free_mode` | `blocked_by_failed_free_lane` | `null`) och `forced` så «läget var free», «gratislane failade så jag spenderade inte» och «kördes» inte kan förväxlas.

## Codegen-lanen

18 fasta prompts i `prompts.ts`: `coffee-shop`, `dashboard`, `portfolio`, `blog`, `pricing`, `auth`, `ecommerce`, `restaurant`, `agency`, `settings`, `booking-service`, `multi-page-brochure`, `saas-dashboard`, `content-heavy-blog`, `consultant-landing`, `realtor-multipage`, `dog-daycare`, `arcade-with-klarna`. `--codegen` kör smoke-delmängden `coffee-shop`, `restaurant`, `portfolio`. `--full` kör alla 18.

En failad gratislane **stoppar** den betalda codegen-lanen. Follow-up och scaffold är maskineriet codegen bygger på — är de trasiga mäter en körning för 20–25 USD skräp. Topputfallet är då `FAIL` (exit 1); codegen blir `SKIPPED` med `skipReason: "blocked_by_failed_free_lane"`, inte ett tyst vanligt skip. `--force` kör den betalda lanen ändå och sätter `forced: true` i JSON/utskrift.

`SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT` (90) kan alltså blockera en betald körning när keyword-top1 dippar under policyn. Det är avsiktligt, inte en bugg. `--force` är utvägen.

`--gate` och `--save-baseline` finns kvar i den här PR:en så den manuella baseline-workflowen fortfarande fungerar. De innebär full svit. Baseline-jämförelsen (`compareWithBaseline` + `eval-baseline.json`) skrivs som **informativ** utskrift även utan `--gate`. Nästa PR tar bort grinden (`--gate`, `--save-baseline`) och hela workflowen.

Gate-regler (från `baseline.ts`, bara när `--gate` är satt):

- `fail` om: någon `passed → failed`, snittpoäng ≤ −10 %, eller fler än 2 prompts tappar ≥20 %
- `warning` om: nya blocking-checks, snittpoäng ≤ −5 %, eller någon enskild prompt tappar ≥15 %
- `pass` annars

Prompts som aldrig nådde checkarna (`generationStatus: "skipped"`) jämförs inte. `overallDelta` räknas över **samma** prompt-id:n som faktiskt utvärderades.

Provider- och infra-fel rangordnas före kvalitetsdomen. Codegen-kvalitet härleds ur mätningen: `evaluated > 0` och `passed < evaluated` ger `quality_fail` (exit 1). `--gate` är en extra OR, inte enda vägen. Ett **permanent** provider-fault avbryter resten av sviten (`suite_aborted`). Transient 429/5xx/transport stoppar inte. `output_truncated` utan innehåll är kvalitetsutfall, inte infra.

**CI:** `.github/workflows/eval-baseline-update.yml` anropar `cli.ts --gate --save-baseline` direkt (inte `npm run eval`). Den är manuell + ev. schema; den är inte en andra eval-produkt. Skapa inte nya eval-workflows.

**Backoffice → Overhead → Eval** har ett läge (gratis / smoke / full), en knapp, och kostnadsbekräftelse före betald lane. Den anropar `npm run eval -- --json` och läser senaste codegen-summary från `data/eval-runs/latest/`. Export till `docs/evals/` är explicit knapp. Genererade rapporter är inte source of truth.

## Artefakter

Codegen-körningar skriver:

- `data/eval-runs/latest/summary.json`
- `data/eval-runs/latest/summary.md`
- `data/eval-runs/runs/<timestamp>-<prompt-id>/…`

Filinnehåll skrivs bara med `--dump-files`, `--dump-files=all` eller `SAJTMASKIN_EVAL_DUMP_FILES`.

Scaffold-lanen skriver `data/scaffold-eval/reports/scaffold-selection-latest.json` (gitignorerad). Radera inte den pathen utan att uppdatera canvas + `llm_flow_status.py` i samma ändring.

`src/lib/gen/autofix/eval/*.eval.test.ts` är vanliga Vitest-tester i CI — inte en konkurrerande eval-produkt.

## Realism-gap

Codegen-lanen kör `prepareGenerationContext()` + `generateCode()` och preflight-liknande checks. Den persistar ingen chat/version, drar inga credits och startar ingen preview-VM. `Surface/Final` är eval-yta vs komplett Next-projekt efter finalize.

## Felsökning

- Gratis-läget klagar på saknad DB → en regression. `resolveEvalEnvironment` får bara köras i codegen-lanen.
- `preflight=failed_env` (codegen) → sätt `POSTGRES_URL` eller kör `npm run env:pull`.
- `OPENAI_API_KEY missing` (codegen) → exporta i shell eller lägg i `.env.local`.
- Rapporten visar `PROVIDER`/`EMPTY`/`ENV` → körningen nådde inte modellen. Läs inte siffrorna som kvalitet.
- En prompt: `npm run eval -- --prompts=<id>`.

## Lägga till en ny codegen-prompt

1. Ny entry i `EVAL_PROMPTS` i `prompts.ts`.
2. Kör `npm run eval -- --prompts=<id>` lokalt.
3. När du vill ha den i baseline: full svit + `--save-baseline` (tills den flaggan försvinner).
4. Commita `prompts.ts` och ev. `eval-baseline.json`.

## Hänvisningar

- Regel: `.cursor/rules/evals.mdc`
- Backoffice: `backoffice/pages/eval_page.py`
- Scaffold-library (inte ett CLI): `src/lib/gen/scaffolds/scaffold-eval.ts`
- Follow-up-library (inte ett CLI): `src/lib/gen/eval/follow-up-context.ts`
