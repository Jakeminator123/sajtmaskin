# Fas 2·C — M4 findings (eval-baseline-gate)

**Uppdrag:** `config/ai_models/manifest.json` `repairPolicies.syntaxFixPasses`
skulle sänkas från `4` till `1` *om* en eval-baseline-körning kunde visa
(a) ≤ 5 % försämring på canonical prompts och (b) ≥ 10 % latensminskning
i median (kördoc: `OMTAG/fas2/C-autofix-import-hardening.md`, Steg 3).

**Utfall:** M4 **skippad** i denna PR. Flaggan lämnas oförändrad på
`syntaxFixPasses: 4` (pro/max/codex) respektive `2` (fast), `3`
(anthropic). Motivering nedan.

## Varför M4 inte kan gaterinas via dagens eval-baseline

`scripts/evals/run-baseline.mjs` + `evals/README.md` dokumenterar
explicit att baseline **enbart** täcker den deterministiska
`matchScaffoldAuto`-fasen (scaffold-selection + `ScaffoldSelectionMeta`).
Citat ur README:

> Enbart den **deterministiska scaffold-selection-fasen** … Fullt finalize-
> pipeline-resultat kräver en LLM-call, Postgres, session, tenant och
> credits — det är inte något en ren klon kan reproducera. … Dagens
> runner stubbar den fliken med ett stderr-meddelande.

`syntaxFixPasses` appliceras i `runSyntaxFixPasses` (se
`src/lib/gen/autofix/validate-and-fix.ts`) — djupt efter scaffold-
selection, som del av post-generation-autofix. Baselinen i `evals/` kör
aldrig den kedjan, så den är principiellt oförmögen att mäta:

- fix-kvalitet efter LLM-autofix
- total `durationMs` där `syntaxFixPasses` är dominerande
- `sajtmaskin_fixer_call_total{phase="syntax"}`-frekvens

Gaten `≤ 5 % försämring på canonical prompts + ≥ 10 % latensminskning
i median` kan därför inte prövas empiriskt idag utan:

1. En reproducerbar finalize-path som inte kräver DB/session/credits
   (`EVAL_FULL=1`-reservationen nämnd i `evals/README.md`), **eller**
2. Ett produktions-telemetri-fönster som separerar
   `syntaxFixPasses=1` från `syntaxFixPasses=4`-runs i
   `sajtmaskin_fixer_call_total` + `durationMs`.

Ingen av dessa är tillgängliga i denna PR.

## Körd baseline-diff (för dokumentation)

Körd på `omtag/fas2-C-autofix-import-hardening`-branchen efter E4 + E5:

```
exact=9/10 acceptable=10/10 errors=0
```

`diff-results.mjs` rapporterar 3 `REGRESS scaffold_selection duration
…× slower` (agency-b2b, blog-minimalist, landing-pulseframe). Detta är
**normal jitter** från OpenAI-embedding-API:ets cold-start-varians som
README uttryckligen säger att man ska ignorera ("Allt annat rapporteras
som `info`. Tröskeln ska inte reagera på naturlig drift i duration
eller mindre cosinus-jitter från OpenAI-embeddings."). `actualScaffold`,
`selectionMethod` och `selectionConfidence` är identiska med
`baseline-master`, så det underliggande beslutet är bit-för-bit samma.

Inga *scaffold*-regressioner — bara varma/kalla embedding-latenser som
varierar oberoende av branch.

## Vad M-lagret föreslog och varför vi inte plockar M3 istället

`gpt_review/filer/M-medium-hard-layer.md` M3 (cross-file-import-fixer-
konsolidering) är explicit **telemetri-blockerad** tills ~2026-04-27.
OMTAG/PARKED.md listar även M3 som "≥ 1 vecka telemetri efter Fas 2·C".
Vi håller oss till E-lagret som är direkt körbart + E4/E5 som landat.

## Rekommendation — när kan M4 återprövas?

Återöppna M4 när *minst ett* av följande är uppfyllt:

- `EVAL_FULL=1`-pathen har en reproducerbar autofix-syntax-pass-surface
  så `scripts/evals/run-baseline.mjs` kan mäta total duration och
  residual error count per tier.
- Produktion har kört ≥ 1 vecka med `syntaxFixPasses=4` så
  `sajtmaskin_fixer_call_total{phase="syntax"}` + preflight-issue-
  counters har stabil bas-nivå att jämföra mot när man A/B:ar
  `syntaxFixPasses=1` bakom en feature-flag.
- Telemetri visar att `syntaxFixPasses > 1` sällan faktiskt *förbättrar*
  error-residualen (mönster: andra+tredje pass adderar fixes men löser
  inte flera syntax-fel än första passet).

Spårad som kandidat för Fas 3 follow-up — inte parkerad permanent.

## Status

- E4, E5, E6 landade på samma branch utan att röra `manifest.json`.
- `config/ai_models/manifest.json` — oändrad i denna PR.
- Inga downstream-konsumenter (autofix, pipeline, validate-and-fix) har
  antaganden som skulle brytas av en framtida M4-sänkning; de läser
  flaggan via `readRepairPolicies()` som redan stöder per-tier-värden.
