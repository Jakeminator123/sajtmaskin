# Eval — vad det är, vilka det finns, hur man kör

Sajtmaskin har **tre olika "eval"-system** som det är lätt att blanda ihop. Den här filen säger vilken som är vilken, när man ska köra dem, och vad de kostar.

## TL;DR

| Vill du … | Kör | Tid | Pengar |
|---|---|---|---|
| Verifiera att codegen-pipelinen inte regressat | `npm run eval:gate` | ~15 min | OPENAI-quota för 15 prompts |
| Snabbare produktlik smoke med 3 prompts + prompt/preflight telemetry | `npm run eval:smoke` | ~3–8 min | OPENAI-quota för 3 prompts |
| Uppdatera baseline efter en avsiktlig förbättring | `npm run eval:baseline` | ~15 min | Samma som ovan |
| Få en human-läsbar rapport + scorecard | `npm run eval` | ~15 min | Samma som ovan |
| Bara mäta att scaffold-pickern väljer rätt | `npm run scaffolds:eval` | ~10 sek | Bara embeddings (snabbt + billigt) |
| Köra gate manuellt från driftpanelen | `Backoffice → Overhead → Eval → Kör eval:gate` | ~15-45+ min | OPENAI-quota för 15 prompts |

## De tre eval-systemen

### 1. Codegen-eval — `npm run eval:suite` / `eval:gate` / `eval:baseline`

**Vad:** kör hela orkestreringen + LLM-codegen för 15 fasta prompts (`coffee-shop`, `dashboard`, `portfolio`, `blog`, `pricing`, `auth`, `ecommerce`, `restaurant`, `agency`, `settings`, `booking-service`, `multi-page-brochure`, `saas-dashboard`, `content-heavy-blog`, `consultant-landing`). `eval:smoke` kör en snabbare delmängd (`coffee-shop`, `restaurant`, `portfolio`) och rapporterar samma prompt/preflight-telemetri.

För varje prompt körs 12 deterministiska checks (sanity, syntax, exports, imports, accessibility, semantic-tokens, …) plus ev. en `syntax`-check när `shouldCompile: true`.

**Filer:**
- `src/lib/gen/eval/cli.ts` — CLI-entry
- `src/lib/gen/eval/runner.ts` — kör eval mot `prepareGenerationContext` + `generateCode` (samma path som production)
- `src/lib/gen/eval/prompts.ts` — de 15 prompts:arna + förväntningar (min/max files, required imports)
- `src/lib/gen/eval/checks.ts` — de 12+ checks
- `src/lib/gen/eval/baseline.ts` — load/save/compare baseline
- `src/lib/gen/eval/eval-baseline.json` — committad baseline (uppdateras via PR från CI)

**Kommandon:**
```bash
npm run eval:suite      # köra + skriv jämförelse till konsol om baseline finns (men exit 0 även vid regression)
npm run eval:gate       # köra + exit 1 vid regression mot baseline
npm run eval:baseline   # köra + exit 1 vid regression OCH spara ny baseline (--gate + --save-baseline)
```

**Skillnaden i klartext:** alla tre kör SAMMA eval-svit (15 prompts, en LLM-körning). Bara flaggorna skiljer:
- `eval:suite` — utan flaggor. Visar resultat + jämförelse, men låter dig se regressioner utan att ditt CI failar.
- `eval:gate` — `--gate`. Bra för CI/PR.
- `eval:baseline` — `--gate --save-baseline`. Försöker spara ny baseline MEN gate:n förhindrar att en sämre baseline skrivs (du ska inte kunna råka commita en regression).

**Gate-regler** (från `baseline.ts:179-190`):
- `fail` om: någon `passed → failed`, snittpoäng ≤ −10 %, eller fler än 2 prompts tappar ≥20 %
- `warning` om: nya blocking-checks, snittpoäng ≤ −5 %, eller någon enskild prompt tappar ≥15 %
- `pass` annars

**Kostnad:** ~15 prompts × LLM-codegen-anrop. På `gpt-5.3-codex` med stora outputs blir det fort några dollar per körning. Kör inte casually.

**CI:** `.github/workflows/eval-baseline-update.yml` kör `eval:gate --save-baseline` veckovis (måndagar 04:11 UTC) + manuellt via workflow_dispatch. Vid förbättring → öppnar draft-PR med ny baseline. Vid regression → workflow failar.

> **OBS:** detta är **inte** wirat in på `pull_request`-trigger — varje PR skulle dra OPENAI-quota. Designval. Om du vill ha det i framtiden: kostnadsuppskatta först.

**Backoffice:** `Backoffice → Overhead → Eval` har en bekräftad knapp för `npm run eval:gate`. Den laddar `.env.local` in i subprocess-env, kör från repo-roten och sparar en datumstämplad markdownrapport under `docs/evals/`. Den kör aldrig `eval:baseline` och uppdaterar därför inte `eval-baseline.json`.

### 2. Klassisk eval — `npm run eval`

**Vad:** wrapper kring samma `runEval()` MEN lägger till:
- Markdown-rapport till `eval-output/eval-report-YYYY-MM-DD.md` (gitignored)
- "Scorecard" som mappar checks till 5 kategorier (`code-quality`, `integrations`, `orchestration`, `autofix`, `streaming-ux`) med target ≥70 % per kategori
- Repo-needle checks som verifierar att specifika exports finns i `src/lib/gen/`-filer

**Filer:**
- `scripts/eval/run-eval.ts` — entry
- `src/lib/gen/eval/scorecard.ts` — kategori-mapping + target-scoring
- `src/lib/gen/eval/report.ts` — markdown-formattering

**När köra:** när du vill ha en mänskligt läsbar översikt utan att uppdatera baseline. Bra för manuell granskning av en lokal förbättring innan du flyttar den till baseline-CI:n.

### Realism-gap mot vanlig builder-generering

Codegen-evalen är mer produktlik än scaffold-eval, men den är fortfarande inte en riktig builder-session:

- Den kör `prepareGenerationContext()` + `generateCode()` och preflight-liknande checks.
- Den persistar ingen chat/version, drar inga credits och startar ingen preview-VM.
- Den kör inte exakt client-brief/server-auto-brief-vägen från create-chat-routen.
- Den mäter nu `promptSize`, största dynamic blocks, preflight errors/warnings, preview-block och skyddade paths så skillnaden mot manuella generationer blir lättare att se.

För slutlig produktverifiering: kör samma prompt manuellt i lokal builder och jämför mot evalrapportens `Prompt / Preflight Telemetry`.

### 3. Scaffold-selection-eval — `npm run scaffolds:eval`

**Vad:** mäter bara att `matchScaffoldAuto()` väljer rätt scaffold för en given prompt. Inte codegen.

**Filer:**
- `scripts/scaffolds/eval-scaffold-selection.ts` — entry
- `src/lib/gen/scaffolds/scaffold-eval.ts` — kärnan
- Output: `data/scaffold-eval/reports/scaffold-selection-latest.json`

**Var datan visas:** `Backoffice → Overhead → Eval`-sidan läser `scaffold-selection-latest.json` för scaffold-eval. Samma sida visar också codegen-baseline-status och kan köra `eval:gate`, men de två systemen är separata.

**När köra:** efter att du justerat scaffold-keywords, embeddings, eller variant-konfiguration. Kostar i princip inget (lokala embeddings + keyword-matching).

## Vanliga förvirringar

- **"Vad visar backoffice-Eval-sidan?"** — både *scaffold-selection-eval* (#3 ovan) och codegen-evalens baseline/gate-rapporter. Scaffold-tabellen är inte codegen-eval; codegen-knappen kör `eval:gate` och skriver rapporter till `docs/evals/`.
- **"Varför saknas eval-baseline.json sometimes?"** — den är committad så den ska alltid finnas. Om den inte finns: kör `npm run eval:baseline` en gång för att skapa den, och commita resultatet.
- **"Failar `eval:gate` om baseline saknas?"** — nej, den varnar bara ("No baseline found"). Bara faktiska regressions failar.
- **"Är `npm run eval` (utan suffix) samma sak som `eval:suite`?"** — nej. Båda kör samma `runEval()`-motor, men `eval` skriver till `eval-output/` med scorecard, `eval:suite` skriver inget men jämför mot baseline. Använd `eval:gate` för CI-typ-flöden, `eval` för human-debug.

## Förväntade tid + cost-uppskattning per körning

Baserat på baseline från 2026-03-18 (`gpt-5.3-codex`, 15 prompts):
- Per prompt: 38–73 sekunder (varierar med komplexitet — `multi-page-brochure` och `saas-dashboard` är dyrast)
- Total wall-clock: ~10–15 minuter
- Total tokens: hundratusentals input + hundratusentals output, beror på prompt
- Pris: snarare i $1–$5-range än cent-range. Kontrollera `OPENAI_API_KEY`-quota innan du startar.

## Felsökning

- `Error: Database URL missing` → eval triggar `prepareGenerationContext` som vill ha DB. Sätt `POSTGRES_URL` eller kör `npm run env:pull` först.
- `OPENAI_API_KEY missing` → exporta i shell eller lägg i `.env.local`.
- Eval failar på en specifik prompt utan tydlig orsak → kör med en eller två prompts: importera `runEval` direkt och passa `{ prompts: [EVAL_PROMPTS[0]] }`.
- Baseline-jämförelsen saknar prompts → en ny prompt har lagts till i `prompts.ts` men baseline är gammal. Det är OK — `compareWithBaseline` skippar prompts som saknas i baseline. Kör `eval:baseline` när du är klar att flytta över.

## Lägga till en ny eval-prompt

1. Lägg ny entry i `EVAL_PROMPTS` i `src/lib/gen/eval/prompts.ts`.
2. Kör `npm run eval:suite` lokalt och kontrollera att den passerar.
3. Kör `npm run eval:baseline` för att lägga in den i baseline.
4. Commita både `prompts.ts`-ändringen och `eval-baseline.json`.

## Hänvisningar

- CI-workflow: `.github/workflows/eval-baseline-update.yml`
- Kvarvarande punkt om CI-gate på PR: `docs/plans/active/Kvarvarande-uppgifter.md` (sök "eval" / "CI-gate")
- Backoffice-sidan: `backoffice/pages/eval_page.py` (registrerad som `PageSpec("Eval", "Overhead", …)` i `backoffice/pages/__init__.py`)
