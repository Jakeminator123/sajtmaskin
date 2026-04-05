# Scaffold-kontroll och logik

Det här dokumentet är en lokal kontrollkarta for att förstå vad som faktiskt
är runtime, vad som är research/buildinput, vad som sparas efter en generering
och hur man felsöker utan att tappa greppet.

## 1. Tre lager som verkligen styr runtime

Det är bara tre lager som är direkt runtime-kritiska för own-engine:

1. `src/lib/gen/scaffolds/`
2. `src/lib/gen/template-library/`
3. `src/lib/gen/scaffolds/scaffold-research.generated.json`

Allt i `data/external-template-pipeline/` är research-/buildinput, inte runtime
i sig.

## 2. Exakta filsökvägar

### Runtime scaffolds

- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/serialize.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/scaffold-embeddings.json`

### Scaffold-familjer

- `src/lib/gen/scaffolds/base-nextjs/manifest.ts`
- `src/lib/gen/scaffolds/landing-page/manifest.ts`
- `src/lib/gen/scaffolds/saas-landing/manifest.ts`
- `src/lib/gen/scaffolds/portfolio/manifest.ts`
- `src/lib/gen/scaffolds/blog/manifest.ts`
- `src/lib/gen/scaffolds/dashboard/manifest.ts`
- `src/lib/gen/scaffolds/auth-pages/manifest.ts`
- `src/lib/gen/scaffolds/ecommerce/manifest.ts`
- `src/lib/gen/scaffolds/content-site/manifest.ts`
- `src/lib/gen/scaffolds/app-shell/manifest.ts`

### Runtime template-library

- `src/lib/gen/template-library/template-library.generated.json`
- `src/lib/gen/template-library/template-library-embeddings.json`
- `src/lib/gen/template-library/search.ts`
- `src/lib/gen/template-library/runtime-guidance.ts`
- `src/lib/gen/template-library/types.ts`

### External-template pipeline (research/buildinput)

- `data/external-template-pipeline/README.md`
- `data/external-template-pipeline/raw-discovery/current/catalog.json`
- `data/external-template-pipeline/raw-discovery/current/summary.json`
- `data/external-template-pipeline/raw-discovery/current/source-metadata.json`
- `data/external-template-pipeline/repo-cache/`
- `data/external-template-pipeline/reference-library/`
- `data/external-template-pipeline/reports/`

### Dossiers / cache / reports

- Dossiers: `data/external-template-pipeline/reference-library/`
- Repo-cache: `data/external-template-pipeline/repo-cache/`
- Curationsrapporter: `data/external-template-pipeline/reports/`

### Scripts som bygger runtime-artifacts

- `scripts/template-library/import-template-discovery.ts`
- `scripts/template-library/hydrate-template-library-cache.ts`
- `scripts/template-library/build-template-library.ts`
- `scripts/template-library/full_template_refresh.py`
- `scripts/scaffolds/promote-to-scaffold.ts`
- `scripts/scaffolds/scaffold-candidate-report.ts`
- `scripts/scaffolds/curate-scaffold-candidates.ts`
- `scripts/embeddings/generate-template-library-embeddings.ts`
- `scripts/embeddings/generate-scaffold-embeddings.ts`

### Kontrollscript

- `scripts/template-library/validate-runtime-artifacts.ts`
- körs via `npm run template-library:validate-runtime`

### Preview / version / repair

- `src/lib/gen/server-verify.ts`
- `src/app/api/engine/chats/[chatId]/quality-gate/route.ts`
- `src/app/api/engine/chats/[chatId]/repair/route.ts`
- `src/lib/providers/own-engine/generation-stream-post-finalize.ts`
- `src/lib/db/engine-version-lifecycle.ts`
- `src/components/builder/VersionHistory.tsx`
- `src/app/builder/useBuilderPageController.ts`

## 3. Vad som ar duplicering och vad som bara ar olika lager

### Inte samma sak

- Builderns Mallar-tab: `src/lib/templates/`
- Runtime `template-library`: `src/lib/gen/template-library/`
- Runtime scaffolds: `src/lib/gen/scaffolds/`
- External-template research: `data/external-template-pipeline/`
- Export/download scaffold: `src/lib/gen/project-scaffold.ts`

### Riktig duplicering eller naming debt

- `previewUrl`, `sandboxUrl`, `demoUrl` beskriver delvis samma verklighet i olika
  kontrakt/lager.
- `sandbox` lever kvar i routes/DB-kontrakt, trots att tier-2 i praktiken går via
  VM / `preview_host`.
- Sync create och sync follow-up hade tidigare olika `latestVersion`-shape.
- En äldre repair-källa kunde tidigare lämnas kvar i `repairing` efter att en ny
  repaired version promotats.

## 4. Vad som nu är fixat i `master`

Efter den senaste stabiliseringsvändan finns följande i `master`:

- äldre versioner som reparerats lämnas inte kvar felaktigt i `repairing`
- versions-UI visar `Omtag` när en äldre version ersatts av en ny repaired version
- previewn faller inte lika lätt tillbaka tyst till senaste versionens URL när du
  valt en äldre version manuellt
- vanliga website-flöden får oftare lättare heuristik:
  - mindre aggressiv `premium`-eskalering
  - mindre aggressiv deep-brief-gating
  - adaptiv `reasoning_effort`
- bildmaterialisering efter att versionen sparats rapporterar tydligare status
- KB-sök och template-library-rankning går parallellt i systempromptbygget

## 5. Hur en generering ska tolkas

I loggar som `övrigt/slutet_på_en_generering.txt` betyder de viktigaste stegen:

- `site.start` - codegen börjar
- `site.done` - versionen är finaliserad och sparad i DB
- `sandbox_start_outcome` - tier-2 VM-start försökte skapa, återanvända eller
  återuppta en preview-session
- `sandbox_preview_ready` - live-previewn är uppe
- `quality-gate` - separat kontroll efter att versionen redan sparats
- `repair` - quality-gate försökte laga en tidigare version och kan skapa en ny
  promoted version

### Vad som faktiskt sparas

- kodträdet: `engine_versions.files_json`
- preview-URL per version: `engine_versions.sandbox_url`
- versionsrader + status: `engine_versions`
- versionsloggar / error-loggar: via `createEngineVersionErrorLogs`
- generationstelemetri: `createGenerationTelemetryRecord`

### Evals vs telemetri

- **Telemetri** skapas automatiskt under vanliga builds:
  - `createGenerationTelemetryRecord`
  - `createEngineVersionErrorLogs`
  - `logs/generationslogg/*`
  - `logs/sajtmaskin-local.log`
- **Evals** är separata jämförelse-/scorecard-körningar som du startar själv:
  - `scripts/eval/run-eval.ts`
  - `src/lib/gen/eval/cli.ts`
  - `npm run eval`
  - `npm run eval:suite`
  - `npm run eval:gate`

Om du inte uttryckligen kör eval-kommandon har du normalt **ingen eval score** för
en vanlig användargenerering, bara telemetri och versionsdata.

### Exempel från `övrigt/slutet_på_en_generering.txt`

I den loggen ser man:

- chat: `a276d1ff-84cd-4059-8baa-6698bfdb60e8`
- första sparade version: `a1955d9c-cc5b-4489-bf41-706f8e2e0d89`
- `site.done` efter cirka 383 740 ms
- tier-2 start som `sandbox_start_outcome: recreated`
- live-preview redo via `sandbox_preview_ready`
- senare `quality-gate`
- senare `repair`
- därefter en ny repaired/promoted version: `419d127d-03a1-44b5-b402-85c3a66c5b3d`

Det visar två viktiga saker:

1. En användbar sida kan vara **sparad och körbar** redan vid första `site.done`.
2. En senare `repair` kan skapa **en ny version**, vilket inte betyder att den
   första versionen försvann — bara att det finns en nyare kandidat som kan ta
   över previewn.

### Vad som bara är operativt brus

- täta `readiness`-anrop
- `sandbox-heartbeat`
- `sandbox-status`
- `inspector-element-map`
- upprepade `versions`-anrop från UI-polling

Det betyder inte automatiskt att något är trasigt.

## 6. Enkel debug-rutin när en scaffold känns fel

Kontrollera i denna ordning:

1. `src/lib/gen/scaffolds/registry.ts`
2. valt scaffold-manifest, t.ex. `src/lib/gen/scaffolds/landing-page/manifest.ts`
3. `src/lib/gen/scaffolds/scaffold-research.generated.json`
4. matchande post i `src/lib/gen/template-library/template-library.generated.json`
5. `src/lib/gen/scaffolds/matcher.ts`
6. `src/lib/gen/route-plan.ts`
7. `src/lib/gen/system-prompt.ts`

Om ett resultat fortfarande känns fel:

- kör `npm run template-library:validate-runtime`
- kontrollera om `landing-page` eller annan family har märkliga references
- kontrollera om prompten blev `standard` eller `premium`
- kontrollera om deep brief kördes
- kontrollera om `site.done` kom snabbt men preview tog lång tid, eller om det var
  codegen-steget som var långsamt

## 7. Kontroll av cursorignored / genererade filer

Kör:

```bash
npm run template-library:validate-runtime
```

Scriptet kontrollerar:

- `src/lib/gen/template-library/template-library.generated.json`
- `src/lib/gen/template-library/template-library-embeddings.json`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/scaffold-embeddings.json`
- `data/external-template-pipeline/raw-discovery/current/catalog.json`
- scaffold-manifest-varningar från `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`

Det ger:

- exists / missing
- parse ok / parse fail
- counts
- freshness-varningar
- scaffold-varningar

## 8. Om du vill återta kontrollen

Fokusera bara på dessa tre familjer först:

1. `landing-page`
2. `content-site`
3. `saas-landing`

Få dem stabila innan du oroar dig för resten.

Och när något känns fel: börja alltid i runtime-lagret, inte i research-lagret.
