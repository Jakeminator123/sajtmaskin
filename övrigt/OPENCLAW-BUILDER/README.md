# OpenClaw Builder

Status: **arkitektur- och försöksunderlag**. Den här mappen ändrar ingen
produktionskod och är inte en ny runtime-sanningskälla.

Basgranskning: `master` vid `22673963a88cca84264929abcdfb3fa8a4afe611` den 24 augusti 2026.

## Beslut i en mening

OpenClaw bör bli den projektledande byggagenten, men Sajtmaskins befintliga
orkestrering, versionsmotor, finalize, preview och kvalitetsgrindar ska fortsatt
vara auktoritativa.

Agenten får vara **bred i ett isolerat användarprojekt** och **smal i
plattformen**.

## Varför spåret finns

Nuvarande Sajtagenten upplevs intelligent därför att Next-appen sätter ihop bra
kontext. Den är däremot inte en fullt verktygsförsedd projektagent:

- OpenClaw kör på Render med `skills: []` och `tools.profile: minimal`.
- Den har inget shell, filsystem, browserverktyg, subagenter eller direkt
  skrivväg till användarprojektet.
- Projektkod skickas som ett begränsat kontextblock; agenten navigerar inte
  själv mellan filer.
- Vanliga ändringar görs genom att OpenClaw skickar en ny builder-prompt.
- Snabbändringar är små, användargodkända operationer mot befintliga filer.

Det är säkert och väl avgränsat, men långt från den agentiska builder som detta
spår beskriver.

## Mappkarta

| Fil | Innehåll |
| --- | --- |
| [00-NULAGE-OCH-OVERRASKNINGAR.md](00-NULAGE-OCH-OVERRASKNINGAR.md) | Vad OpenClaw faktiskt kan och vad som överraskar |
| [01-FILKARTA-OCH-DATAFLODE.md](01-FILKARTA-OCH-DATAFLODE.md) | Var prompt, filer, preview och verifiering ligger |
| [02-MALARKITEKTUR.md](02-MALARKITEKTUR.md) | Rekommenderad hybridarkitektur |
| [03-VERKTYGSKONTRAKT.md](03-VERKTYGSKONTRAKT.md) | Agentens föreslagna verktyg och gränser |
| [04-SAKERHET-OCH-BEHORIGHETER.md](04-SAKERHET-OCH-BEHORIGHETER.md) | Threat model och behörighetsmatris |
| [05-GENOMFORANDEPLAN.md](05-GENOMFORANDEPLAN.md) | Ordnad genomförandeplan |
| [06-UTVARDERING-OCH-ROLLOUT.md](06-UTVARDERING-OCH-ROLLOUT.md) | A/B-test, mätetal, rollout och rollback |
| [07-BESLUT-OCH-OPPNA-FRAGOR.md](07-BESLUT-OCH-OPPNA-FRAGOR.md) | Beslutslogg och frågor som kräver Jakob |
| [08-AI-WORKFLOW-CANVAS.md](08-AI-WORKFLOW-CANVAS.md) | Möjlig koppling till AI Workflow Canvas |
| [BRANCH-GOVERNANCE.md](BRANCH-GOVERNANCE.md) | Hur `builder-branch` ska behandlas och skyddas |
| [canvas/OPENCLAW-BUILDER-CANVAS.md](canvas/OPENCLAW-BUILDER-CANVAS.md) | Samlad Now/Next/Later/Never-canvas |
| [plans/](plans/) | En genomförbar planfil per fas |
| [diagrams/](diagrams/) | Mermaid-källor och renderade SVG-bilder |

## Icke förhandlingsbart

1. `engine_versions.files_json` förblir kanonisk projektsnapshot.
2. `GenerationInputPackage`, BuildSpec, scaffold, variant, dossiers och
   source receipt byggs av sina befintliga ägare; agenten får inte uppfinna
   parallella register.
3. Alla kandidater binds till `tenant`, `chatId`, `baseVersionId` och
   `filesRevision`. Stale base stoppas fail-closed.
4. Agenten skriver aldrig direkt till Postgres, Fly-volymen, Vercel-projektet
   eller Sajtmaskins plattformsrepo.
5. Dependency-installation och byggskript körs i en hemlighetsfri sandbox.
6. Nuvarande finalize, preview, RenderGate och ReleaseGate förblir sista ordet.
7. Varje agentjobb har hårda gränser för tid, modellvarv, previewloopar,
   tokens, kostnad, filstorlek och nätverk.

## Rekommenderat första experiment

Bygg inte den skrivande agenten först. Börja med en separat read-only
OpenClaw Builder som får projektspecifika verktyg för att lista, söka och läsa
filer samt läsa previewstatus, loggar och skärmbild. Kör den sedan som shadow
planner mot samma prompts som nuvarande pipeline. Först när den mäter bättre
planer utan läckage eller versionsdrift bör kandidatskrivning låsas upp.

## Sanningskällor i repot

- OpenClaw-konfiguration: `infra/openclaw/generate-config.mjs`
- OpenClaw-route och kontext: `src/app/api/openclaw/chat/route.ts` och
  `src/lib/openclaw/`
- Orkestrering: `src/lib/gen/orchestrate/` och
  `src/lib/gen/generation-input-package.ts`
- LLM-pipeline: `docs/architecture/llm-pipeline.md`
- Versioner: `src/lib/db/schema.ts`, `src/lib/gen/version-manager.ts`
- Preview: `src/lib/gen/preview/` och `preview-host/`
- Verifiering: `src/lib/gen/verify/`
- Agentarbetsflöde: `config/agent-workflow.json`

Prosan här ska uppdateras när dessa owners förändras. Den får aldrig användas
som skäl att kringgå deras runtimekontrakt.
