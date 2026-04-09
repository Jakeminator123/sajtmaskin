# 2026-04-09 — LLM-pipeline, quality gate och preview-host

## Sammanfattning

Den här omgången fokuserade på tre områden:

1. göra freeform-/follow-up-generering mer robust
2. förbättra observability kring vad som faktiskt händer i LLM-flödet
3. förstå och minska fel som uppstår i preview-host / Fly.io

## Vad som implementerades

### 1. Exporterad användarsajt (`sajt_hydro`)

- `app/opengraph-image.tsx`
  - la till `import { ImageResponse } from "next/og"`
- `app/layout.tsx`
  - la till `data-scroll-behavior="smooth"` på `<html>`
- `package.json`
  - lättade Node-range till `>=22.14.0`

Resultat:

- `npm run typecheck` passerade efter fixarna

### 2. Deterministisk autofix i Sajtmaskin

Nya/förbättrade fixar i plattformen:

- `src/lib/gen/autofix/common-import-fixer.ts`
  - ny fixer: `fixNextOgImageResponseImport()`
- `src/lib/gen/autofix/pipeline.ts`
  - kopplade in `next-og-image-response-import-fixer`
- `src/lib/gen/repair-generated-files.ts`
  - samma fixer körs även i repair-/merge-lagret
- tester uppdaterade i:
  - `src/lib/gen/autofix/common-import-fixer.test.ts`

Syfte:

- fånga `new ImageResponse(...)` utan import redan före quality gate
- minska behovet av sena repair-loopar

### 3. BuildSpec / repair-kontext

- `src/lib/gen/build-spec.ts`
  - targeted repair-prompter känns nu igen via repair-/quality-gate-signaler
  - repair-followups får minst `contextPolicy: "normal"` i stället för att alltid degraderas till `light`
- tester uppdaterade i:
  - `src/lib/gen/build-spec.test.ts`

Syfte:

- systemägda repair-prompter ska inte behandlas som små copy-ändringar

### 4. Node-versioner

- scaffold-template:
  - `src/lib/gen/project-scaffold.ts`
  - `src/lib/gen/project-scaffold.test.ts`
- repo-versioner synkade:
  - `.nvmrc`
  - `.node-version`
  - `.tool-versions`
  - `package.json` / `volta`

Mål:

- minska förvirring mellan Node 22 och 25
- undvika onödiga `EBADENGINE`-varningar i exporterade projekt

### 5. Logging / fault-fix index

- `src/lib/logging/generation-log-writer.ts`
  - utökat `fault-fix-index.md` med:
    - fas
    - severity
    - skapad av / fixad av
    - modelltier
    - provider
    - pass
    - chatId
    - versionId
    - lineageHash
  - lade till stöd för:
    - `verifier-pass`
    - `scaffold-retry.suggested`
- tester uppdaterade i:
  - `src/lib/logging/generation-log-writer.test.ts`

### 6. Quality gate-dokumentation

- ny fil:
  - `docs/schemas/quality-gate.md`
- uppdaterad fas-readme:
  - `logs/llm-segmentts-and-index/readme.txt`
  - quality gate är nu ett explicit steg i Phase 3
- uppdaterad dashboard-karta:
  - `config/dashboard/domain-map.json`

## Två viktiga testgenereringar

### A. Bröd & Bönor (utan deep brief i praktiken)

Utfall:

- scaffoldvalet blev först `landing-page`
- merge gav syntaxfel
- scaffold-import-drift upptäcktes
- `base-nextjs` användes i repair-turn
- quality gate hittade senare `ImageResponse`-felet

Lärdom:

- för lite brief/spec gav sämre scaffoldmatchning
- sena repair-pass behövdes

### B. FlowBoard (med deep brief + riktad scaffold-intention)

Utfall:

- deep brief kördes
- prompten expanderades kraftigt
- scaffold blev `saas-landing`
- premium quality target
- preflight passerade utan errors/warnings
- en merged-syntax-fix krävde 1 LLM-fixer-pass
- quality gate kördes i bakgrunden
- preview-hosten började sedan slå i minnes-/stabilitetsproblem på Fly

Lärdom:

- deep brief förbättrade scaffoldmatchning tydligt
- pipelinekvaliteten var märkbart bättre än i första testet

## Preview-host / Fly.io

Observationer från Fly-dashboard och loggar:

- Firecracker memory låg nära taket
- health check på port 8080 började fallera
- `connection closed before message completed`
- vit preview trots `preview_ready`
- quality gate tog ~3.7 minuter

Bedömning:

- preview-host-maskinen är för liten för kombinationen:
  - `npm install`
  - `npm run dev`
  - `tsc --noEmit`
  - eventuella lint/checks

Åtgärd:

- `preview-host/fly.toml`
  - la till `[[vm]]`
  - `memory = "4gb"`
  - `cpus = 2`

## Saker som fortfarande bör göras senare

### Pipeline / generator

- överväg deep brief som default för första freeform-generering
- lägg till generisk fix för `scroll-behavior: smooth` även när den kommer via CSS, inte bara HTML-className
- validera att repair-svar faktiskt adresserar alla listade fel, inte bara en del
- fundera på om quality gate oftare ska fungera som telemetri/confirm-lager snarare än primär felupptäckt

### UI / builder

- `Preview-klar` bör spegla VM-status bättre
- separera SEO-varningar visuellt från blockerande fel
- förbättra heartbeat-/reload-beteende vid versionsbyte för att minska vita previews och 429-spikar

### Logging / observability

- skriv CSV parallellt till global `logs/llm-segmentts-and-index/error-log.csv`
- överväg token-/provider-/modelltelemetri per lane i körloggen
- överväg att exponera quality-gate-historik tydligare i dashboarden

## Viktiga begrepp att behålla

- preview-lane och verify-lane är olika saker
- deep brief och dynamic instructions är olika lager
- runtime scaffolds ska inte förväxlas med external-template-pipeline
- `/api/v0/` är API-versionering, inte Vercels v0-produkt
