# evals — mätstickan

Canonical prompts för OMTAG-02. Varje körning sparar en tidsstämplad mapp
under `evals/results/` så att vi kan säga *"efter commit X tappade prompt Y
selectionMethod från `embedding` till `default`"* istället för *"det känns
sämre"*.

## Innehåll

| Fil/mapp | Vad |
|---|---|
| `*.prompt.json` | 10 canonical prompts (OMTAG-02 tabell). Innehåller `id`, `prompt`, `buildIntent` och `expected`. |
| `results/baseline-master/` | Incheckad baseline från dagens master. Uppdateras **bara** medvetet efter konsoliderings-waves. |
| `results/<YYYY-MM-DD-HHMM>/` | Lokala körningar (gitignorerade — se `.gitignore`). |
| `results/<slug>/_summary.json` | Aggregat per körning: hit-ratio + per-prompt-sammanfattning. |

## Kör baseline

```bash
# Full baseline (10 prompts, ~30s med embedding-query):
node scripts/evals/run-baseline.mjs

# Subset (debug):
node scripts/evals/run-baseline.mjs --prompts landing-

# Skriv till specifik mapp:
node scripts/evals/run-baseline.mjs --output-dir evals/results/my-branch
```

## Diff mot baseline

Innan merge: kör baseline på din branch och diffa mot `baseline-master/`:

```bash
node scripts/evals/run-baseline.mjs --output-dir evals/results/pr-omtag-05
node scripts/evals/diff-results.mjs \
  evals/results/baseline-master \
  evals/results/pr-omtag-05
```

Diff-scriptet flaggar som **regression** när:

- Vald scaffold ändras till något som inte matchar `expected.scaffold`
  eller `expected.acceptable_scaffolds`.
- `selectionMethod` faller tillbaka till `default`.
- `selectionConfidence` sjunker (`high → medium`, `medium → low`).
- Embedding-query fejlar (`embeddingFailed: true`).
- Scaffold-selection går >1,5× långsammare.

Allt annat rapporteras som `info`. Tröskeln ska inte reagera på naturlig
drift i duration eller mindre cosinus-jitter från OpenAI-embeddings.

## Vad baseline **innehåller** just nu

Enbart den **deterministiska scaffold-selection-fasen** (`matchScaffoldAuto`
+ `ScaffoldSelectionMeta`). Varje resultat innehåller:

| Fält | Källa |
|---|---|
| `phases.scaffold_selection.durationMs` | Wall-clock för `matchScaffoldAuto`. |
| `phases.scaffold_selection.scaffoldId` | Vald scaffold-id eller `null`. |
| `phases.scaffold_selection.meta` | Full `ScaffoldSelectionMeta` (topCandidates, keywordScores, embeddingTopResult, selectionMethod, selectionConfidence, semanticUnavailableReason, embeddingOverrideReason). |
| `scaffoldSelectionMeta` | Samma som ovan, duplicerat på toppnivå för enkel diff. |
| `expectedMatch.{expectedScaffold, actualScaffold, match, acceptableHit}` | Jämförelse mot prompt-filens `expected`. |
| `envSignals.{openAiKeyPresent, scaffoldKeywordMatchEnvRaw}` | Kontext för reproduktion. |

## Vad baseline **inte** innehåller ännu

Fullt finalize-pipeline-resultat kräver en LLM-call, Postgres, session,
tenant och credits — det är inte något en ren klon kan reproducera. OMTAG-02
dokumenterar detta avsiktligt:

> Ingen ML-scoring / LLM-as-judge (det är en ny indirection — håll det
> deterministiskt).

Den fulla pipelinen (`preflight.summary`, autofix-stats, `verifier.*`,
`previewBlocked`, `verificationBlocked`) är `EVAL_FULL=1`-reserverat — ett
följdjobb för när vi har en reproducerbar finalize-surface (t.ex. en testbar
version av `finalizeAndSaveVersion` som inte kräver DB/network). Dagens
runner stubbar den fliken med ett stderr-meddelande.

Om du behöver fullt pipeline-data idag: kör mot en lokal dev-server
(`npm run dev`) manuellt och kopiera in resultatet från
`devLog` / `createGenerationTelemetryRecord`.

## När bumpar man baseline-master?

- Efter att en OMTAG-fas har mergats till master **och** ändrat scaffold-
  selection medvetet (t.ex. nya embeddings, nya keyword-banks).
- PR-beskrivningen ska visa diff-output och motivera ändringen.
- Uppdateringsprocedur:
  ```bash
  git checkout master && git pull
  node scripts/evals/run-baseline.mjs --output-dir evals/results/baseline-master
  git add evals/results/baseline-master && git commit -m "evals: bump baseline-master"
  ```

## Format — prompt-filer

```json
{
  "id": "landing-pulseframe",
  "prompt": "Bygg en lyxig kamera-SaaS-landing …",
  "buildIntent": "website",
  "expected": {
    "scaffold": "landing-page",
    "variant_any_of": ["saas-hero", "product-focused"],
    "min_routes": 1,
    "acceptable_scaffolds": ["saas-landing"]
  }
}
```

- `id` — slug; används som filnamn under `results/*/<id>.json`.
- `buildIntent` — valfri (`"website"` default); styr fallback-scaffold.
- `expected.scaffold` — det "rätta" scaffold-id:t vi siktar på.
- `expected.acceptable_scaffolds` — alternativ som fortfarande räknas som
  OK (t.ex. `landing-page` acceptar `saas-landing` för en SaaS-prompt).
- `variant_any_of` och `min_routes` — reserverade för full pipeline; läses
  inte av scaffold-baseline idag.
