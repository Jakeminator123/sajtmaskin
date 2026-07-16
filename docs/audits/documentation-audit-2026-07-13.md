# Dokumentationsrevision 2026-07-13

> Fas 0: inventering utan radering eller produktbeteendeändring.
>
> Bas: `origin/master` vid `adbcb2b2327e86180b8bc4551ff416eced61d8a7`.
>
> Owner avgörs per faktatyp: canonical executable eller deklarativ owner →
> runtime-konsument/validator → genererad projektion → handskriven mental modell
> → historik. Genererad Markdown är aldrig en ny owner.

## Verifierad startpunkt 2026-07-13

Tabellen är revisionsögonblicket när arbetet startade. Den senare
completion-matrisen redovisar efterföljande PR-status utan att skriva om
startbeviset.

| Kontroll                 | Resultat                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| Repo                     | `Jakeminator123/sajtmaskin`                                        |
| `origin/master`          | `adbcb2b2327e86180b8bc4551ff416eced61d8a7`                         |
| Huvudcheckout            | Ren, `master...origin/master`                                      |
| Arbetsyta                | Separat worktree på `cursor/docs-audit-95a3`                       |
| Öppna PR:er              | #520–#524, endast Dependabot; ingen överlappande dokumentations-PR |
| CI-läge                  | #520, #521, #522 och #524 gröna; #523 har röd `quality`            |
| Befintligt docs-kontrakt | Inget `docs:generate` eller `docs:check`                           |

## Metod och avgränsning

Revisionen läser kod, registries, schemas, policies, tester och CI före
Markdown. Dokumentfamiljer klassas som:

| Klass    | Betydelse                                                                            |
| -------- | ------------------------------------------------------------------------------------ |
| KEEP     | Aktiv, korrekt och har ett tydligt ansvar.                                           |
| REWRITE  | Ämnet behövs men innehållet är för brett, stale eller blandar historik med kontrakt. |
| GENERATE | Stabil strukturerad källa finns; handskriven inventarie bör ersättas.                |
| ARCHIVE  | Historiskt värde finns, men dokumentet får inte uppfattas som aktuell vägledning.    |
| DELETE   | Duplicerad eller avslutad artefakt vars återstående värde täcks av git-historik.     |

Deletion-kandidater är bara rekommendationer i denna fas. Kodradering kräver
separat PR och full beviskedja.

## Inventering av dokumentationsytan

Följande grupper täcker de primära spårade dokumentationsytorna och
load-bearing root-dokumenten. Det är en beslutsinventering, inte ett påstående
om att varje Markdown-, text-, canvas- och README-fil listas individuellt.
Rader med glob representerar varje fil som matchar globen.

Om en exakt fil-för-fil-lista behövs ska den genereras från git-indexet och
kontrolleras maskinellt. Den ska inte underhållas som ännu en handskriven
inventarie.

| Path                                                                      | Nuvarande roll                                 | Canonical source                            | Åtgärd                                            | Risk  | Bevis                                                                                                | PR-fas |
| ------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- | ------ |
| `README.md`                                                               | Repo-router                                    | Kod + `package.json`                        | REWRITE                                           | Låg   | Rätt form men daterad status och för stor områdeskarta                                               | 1      |
| `AGENTS.md`                                                               | Agent-entry                                    | `.cursor/README.md` + regler                | REWRITE                                           | Låg   | Duplicerar mycket driftinformation; ska vara tunn pekare                                             | 1      |
| `docs/README.md`                                                          | Fullt docs-nav                                 | Faktiskt filträd                            | REWRITE                                           | Låg   | Lång navtabell och några stale/phantom paths                                                         | 1      |
| `docs/documentation-lifecycle.md`                                         | Docs-policy                                    | Docs-struktur + planregel                   | REWRITE                                           | Låg   | Rätt ägare men saknar genererad-docs-kontrakt                                                        | 1      |
| `docs/architecture/README.md`                                             | Arkitektur-router                              | Runtime-kontrakt                            | KEEP                                              | Låg   | Tunn och kodförankrad                                                                                | 1      |
| `docs/architecture/system-overview.md`                                    | Stabil huvudloop                               | Engine/gen/preview/deploy                   | REWRITE                                           | Låg   | BuildSpec och normalize-steget saknas i huvudloopen                                                  | 1      |
| `docs/architecture/llm-pipeline.md`                                       | Enda körflödesdoc                              | `src/lib/gen/`, engine-routes               | KEEP                                              | Medel | Aktiv men implementationstung; trimmas senare, inte i grund-PR                                       | 3      |
| `docs/architecture/runtime-contracts.md`                                  | Invariants och signalägare                     | Runtime owners                              | KEEP                                              | Medel | Värdefullt kontraktslager; ska inte bli enum-inventarie                                              | 1      |
| `docs/architecture/code-map.md`                                           | Kodorientering                                 | Filträdet                                   | REWRITE                                           | Låg   | Bra grund; sökkommandon är Bash-formulerade trots PowerShell-policy                                  | 1      |
| `docs/architecture/glossary.md`                                           | Kanonisk ordlista                              | Befintlig glossary + terminologipolicy      | KEEP/GENERATE-IN-PLACE                            | Medel | Strukturerad källa får bara skriva befintlig canonical path eller göra en full länk-/regelmigration  | 2      |
| `docs/architecture/templates.md`                                          | Template-gräns                                 | `src/lib/templates/` + Blob                 | KEEP                                              | Låg   | Klargör v0-mall kontra scaffold/dossier                                                              | 1      |
| `docs/contracts/**/*.md`                                                  | Mänskliga kontrakt, även nested policy/beslut  | Kod/schemas/policies per fil                | KEEP/REWRITE                                      | Medel | 10 filer totalt; top-level och nested familjer ingår, enumlistor flyttas till generated              | 2–3    |
| `docs/schemas/*.md`                                                       | Mänskliga schemaförklaringar                   | Runtime types + strict schemas              | KEEP/REWRITE                                      | Medel | 10 kontraktdocs; `builder-entry-contract.md` har borttagen v0-route                                  | 1–3    |
| `docs/schemas/strict/*.schema.json`                                       | Maskinläsbara speglar                          | Runtime Zod/TS där sådan finns              | KEEP                                              | Hög   | 20 schemas; flera valideras hårt i CI                                                                | —      |
| `docs/schemas/strict/README.md`                                           | Schema-router                                  | Strict-schema-katalogen                     | KEEP                                              | Låg   | Aktiv pekare                                                                                         | 1      |
| `docs/runbooks/*.md`                                                      | Operativ felsökning                            | Preview-/deploy-kod                         | KEEP                                              | Låg   | Två avgränsade runbooks                                                                              | 1      |
| `docs/operating/**/*.md`                                                  | Operativ referens, inklusive incidents         | Backoffice/runtime                          | KEEP                                              | Låg   | Tre filer totalt; top-level och incidentunderlaget ingår                                             | 1      |
| `docs/llm/*.md`                                                           | Dossier-författning/selection                  | Dossier registry + selector                 | REWRITE                                           | Medel | Två filer; selection-texten är äldre än nuvarande mock/F3-kontrakt                                   | 3      |
| `docs/howto/*.md`                                                         | Lokal setup                                    | Scripts                                     | KEEP                                              | Låg   | En aktiv warm-cache-guide, saknas i navet                                                            | 1      |
| `docs/evals/README.md`                                                    | Eval-router                                    | Eval scripts                                | KEEP                                              | Låg   | Tunn pekare                                                                                          | 1      |
| `docs/ENV.md`                                                             | Env-onboarding och lagergränser                | `src/lib/env.ts` + `config/env-policy.json` | KEEP/REWRITE                                      | Hög   | Load-bearing pekare; fulla nyckel-/policylistor ska genereras, inte kopieras manuellt                | 2      |
| `docs/testing.md`                                                         | Test- och stabilitetskontrakt                  | `package.json`, Vitest-config och workflows | KEEP/REWRITE                                      | Medel | Ska beskriva blockerande kontra Advisory-lanes utan att duplicera workflowimplementation             | 2      |
| `docs/dependency-policy.md`                                               | Dependency-policy                              | `package.json` + CI                         | KEEP                                              | Låg   | Aktiv policy                                                                                         | 1      |
| `docs/delivery-bias.md`                                                   | Arbetsprincip                                  | Agentregler                                 | KEEP                                              | Låg   | Stabil mental modell                                                                                 | 1      |
| `docs/övergripande-vision-och-mål.md`                                     | Produktvision                                  | Produktbeslut                               | KEEP                                              | Låg   | Inte runtime; ska märkas och länkas som vision                                                       | 1      |
| `docs/external-pipelines/*.md`                                            | Borttagen extern pipeline                      | Git-historik                                | ARCHIVE/DELETE → DONE — PR #530                   | Låg   | Legacydokumentet raderas; git-historiken bevarar pipelinebeslutet                                    | 3      |
| `docs/audits/path-audit-2026-07-02.md`                                    | Tidigare punktrevision                         | Git-historik + dagens kod                   | ARCHIVE                                           | Låg   | Delvis åtgärdad och delvis stale efter #458/#465                                                     | 3      |
| `docs/archive/README.md`                                                  | Arkiv-router                                   | Arkivpolicy                                 | KEEP                                              | Låg   | Tydlig pekare                                                                                        | 1      |
| `docs/archive/status/STATUS-2026-04-20.md`                                | Cloud-loop-status                              | Git-historik                                | DELETE → DONE — PR #530                           | Låg   | Statusfilen raderas; fyra historikcommits bevarar ögonblicksbilden                                   | 3      |
| `docs/old/README.md`                                                      | Git-historikpekare                             | Git                                         | KEEP                                              | Låg   | Avsiktligt tom yta                                                                                   | 1      |
| `docs/plans/README.md`                                                    | Plan-router                                    | Plan-livscykel                              | KEEP                                              | Låg   | Rätt ansvar                                                                                          | 1      |
| `docs/plans/active/README.md`                                             | Aktivt koncentrat                              | Faktiskt aktiva planer                      | REWRITE                                           | Medel | Innehåller mycket levererad historik och är inte längre tunn                                         | 3      |
| `docs/plans/active/*.md` exkl. `README.md`                                | Aktiva eller väntande planer                   | Pågående beslut                             | KEEP/REWRITE                                      | Medel | Sju planer; den separata aktiva routern undantas och backoffice-planen är stale                      | 3      |
| `docs/plans/archived/**/*.md`                                             | Parkerad/ersatt historik                       | Git + ersättande docs                       | ARCHIVE                                           | Låg   | 19 filer; flera brutna parent-/ersättningslänkar                                                     | 3      |
| `docs/plans/avklarat/README.md`                                           | Avklarat-index                                 | Git/PR-historik                             | KEEP                                              | Låg   | Aktiv router till historik                                                                           | 3      |
| `docs/plans/avklarat/bug-swarm/**/*.md`                                   | Buggarkiv                                      | `BUG-SWARM-BACKLOG.md`                      | ARCHIVE                                           | Låg   | Historiskt underlag med tydlig live-ägare                                                            | 3      |
| `docs/plans/avklarat/grandmaster/*.md` exkl. `_backlog-deferrad.md`       | Levererad planhistorik                         | Runtime + git                               | ARCHIVE                                           | Låg   | Genomförda planer; den aktiva deferred-backloggen undantas                                           | 3      |
| `docs/plans/avklarat/grandmaster/_backlog-deferrad.md`                    | Pausade/aktiva följdbeslut                     | Aktiv plan-router + produktbeslut           | KEEP/REWRITE                                      | Medel | Länkas från aktiv router och får inte märkas som enbart historik                                     | 3      |
| `docs/plans/avklarat/grandmaster/aktiviteter/*.md`                        | Engångs-agentuppgifter med kod-/testreferenser | Git-historik + aktiva source-referenser     | KEEP/ARCHIVE                                      | Medel | Flera filer refereras av scripts, config och stabilitetstester; radera först efter referensmigrering | 3      |
| `docs/plans/avklarat/kontrollflode/00-master-plan.md`                     | Historiskt beslut                              | Runtime + PR #360–#367                      | ARCHIVE                                           | Låg   | Alla sju faser levererade                                                                            | 3      |
| `docs/plans/avklarat/kontrollflode/aktiviteter/*.md`                      | Engångsprompter                                | Git-historik                                | DELETE AFTER REFERENCE MIGRATION → DONE — PR #530 | Medel | #530 ersätter masterplanens kataloglänk med git-/PR-historik och raderar sju prompter                | 3      |
| `docs/plans/avklarat/kontrollflode/underlag/*`                            | Beslutsunderlag för prod-mätning               | Kontrollflödets masterplan                  | KEEP                                              | Medel | Aktiv och avklarad router länkar hit tills den kvarvarande mätavstämningen är stängd                 | 3      |
| `docs/plans/avklarat/stabilisering-2026-07/00-master-plan.md`             | Historiskt beslut                              | Runtime + PR #374–#383                      | ARCHIVE                                           | Låg   | Levererade vågor                                                                                     | 3      |
| `docs/plans/avklarat/stabilisering-2026-07/aktiviteter/*.md`              | Engångsprompter                                | Git-historik                                | DELETE AFTER REFERENCE MIGRATION → DONE — PR #530 | Medel | #530 ersätter masterplanens kataloglänk och raderar tre Våg 1-prompter                               | 3      |
| `docs/plans/avklarat/stort-framsteg-2026-07-03/2026-07-03_1058.md`        | Rå sessionsnotis                               | Slutrapport + git                           | DELETE → DONE — PR #530                           | Låg   | Slutrapportens länk är migrerad; git-historiken bevarar rånotisen                                    | 3      |
| `docs/plans/avklarat/stort-framsteg-2026-07-03/2026-07-03_slutrapport.md` | Sammanställd prod-evidens                      | Stabiliseringsmasterplanen                  | KEEP/ARCHIVE                                      | Medel | Aktiv masterplan och aktivitetsprompt länkar rapporten; radera först efter separat referensmigrering | 3      |
| `docs/plans/avklarat/*.md` exkl. `README.md`                              | Avslutade beslut/planer                        | Runtime + git                               | ARCHIVE                                           | Låg   | Aktiv router undantas; behåll beslut med referensvärde och rensa rena handoffs separat               | 3      |
| `docs/canvases/llm-flow.canvas.txt`                                       | Genererad visualisering                        | Canvas-script + runtime                     | GENERATE                                          | Låg   | Artefakt, inte kontraktskälla                                                                        | 2      |
| `docs/canvases/llm-flow-canvas.plan.md`                                   | Canvas-plan                                    | Git-historik                                | ARCHIVE/DELETE → DONE — PR #530                   | Låg   | Planen raderas; genererad canvas och scriptägare behålls                                             | 3      |
| `.cursor/rules/*.mdc`                                                     | Agentpolicies                                  | Regelfilerna själva                         | KEEP/REWRITE                                      | Medel | 23 filer; policy, inte app-runtime                                                                   | 1–3    |
| `.cursor/commands/**/*.md`                                                | Agentkommandon                                 | Skills/regler                               | KEEP                                              | Låg   | Operativa agentverktyg                                                                               | —      |
| `.cursor/skills/**/SKILL.md`                                              | Agent-SOP                                      | Skillimplementation                         | KEEP                                              | Låg   | Aktiva verktyg; deprecated status ska vara explicit                                                  | —      |
| `.cursor/**/README.md` exkl. `.cursor/README.md`                          | Supportkonventioner för skills/swarms/loggar   | Länkande skills och gitignore-policy        | KEEP/REWRITE                                      | Medel | Aktiva skills länkar dessa README-filer; de ska ha explicit owner                                    | 1–3    |
| `.cursor/README.md`                                                       | Cursor-router                                  | Faktiska regler/skills                      | REWRITE                                           | Låg   | För lång driftinventarie; ska peka, inte duplicera                                                   | 1      |
| `config/README.md`                                                        | Config-router                                  | `config/` + loaders                         | KEEP                                              | Låg   | Tydlig ingång                                                                                        | 1      |
| `config/control-plane/README.md`                                          | Registry-router                                | Registry JSON + validator                   | KEEP                                              | Låg   | Beskriver meta-indexets begränsning                                                                  | 2      |
| `config/ai_models/*.md` exkl. `25-pricing.md`                             | Modelloperatörsdocs                            | Manifest + Zod-loader                       | REWRITE                                           | Medel | Modellinventarier bör genereras från manifest                                                        | 2      |
| `config/ai_models/25-pricing.md`                                          | Mänsklig prisreferens                          | `config/ai_models/pricing.json`             | GENERATE/REWRITE                                  | Hög   | Kostnadsscript och backoffice konsumerar pricing.json; manifestet är inte pris-owner                 | 2      |
| `config/codegen-core-manifest.json` + `config/prompt-core/*.md`           | Core Rules och assembly-ordning                | `src/lib/gen/static-core-loader.ts`         | KEEP                                              | Hög   | Manifestet äger fragmenturval/ordning; Markdownfilerna är runtime-input                              | —      |
| `data/dossiers/**/instructions.md`                                        | Runtime prompt-input                           | Dossiermanifest + registry                  | KEEP                                              | Hög   | 36 filer, laddas av runtime                                                                          | —      |
| `data/**/README.md`                                                       | Data-livscykel                                 | Respektive script/loader                    | KEEP/REWRITE                                      | Låg   | Tre pekare; kontrollera vid berörd dataändring                                                       | 1–3    |
| `src/**/README.md`                                                        | Lokala kodkartor                               | Närliggande kod                             | KEEP/REWRITE                                      | Låg   | Sju filer; endast behåll om de förklarar lokal gräns                                                 | 3      |
| `scripts/README.md`                                                       | Script-router                                  | `package.json` + scripts                    | REWRITE                                           | Låg   | Länkar till saknad rot-`archive/` och har stale inventarie                                           | 1      |
| `preview-host/README.md`                                                  | Host-runbook                                   | `preview-host/src/`                         | REWRITE                                           | Medel | Aktiv men behöver sync med patch/prewarm-kontrakt                                                    | 3      |
| `e2e/README.md`                                                           | E2E-router                                     | Playwright-configs                          | KEEP                                              | Låg   | Aktiv pekare                                                                                         | 1      |
| `infra/**/*.md`                                                           | OpenClaw/infra runtimeinput                    | Infra-config                                | KEEP                                              | Medel | Sex agent-/workspacefiler plus `infra/README.md`; inte vanliga docs                                  | —      |
| `.github/README.md`                                                       | CI-router                                      | Workflows                                   | REWRITE                                           | Låg   | Påstår felaktigt att GitHub CI kör `build`                                                           | 1      |
| `BUG-SWARM-BACKLOG.md`                                                    | Enda buggsanning                               | Backlog-checkscript                         | KEEP                                              | Hög   | Load-bearing i preflight                                                                             | —      |

## Kanoniska owners och generatorpotential

| Område           | Canonical owner                                                       | Validering/konsument                       | Generera                                                   | Kommentar                                                            |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Capabilities     | `manifest.capability` i `data/dossiers/{hard,soft}/*/manifest.json`   | Dossier registry/selection + dossier tests | `capabilities.generated.md`                                | `capability-map.json` är en genererad vy, inte owner                 |
| Dossiers         | `data/dossiers/{hard,soft}/` + runtime-AJV                            | `dossiers:validate-all`                    | `dossiers.generated.md`                                    | Generera id, capability, class, mock, env/deps och verifieringsdatum |
| Scaffolds        | `src/lib/gen/scaffolds/*/manifest.ts`, listade i `registry.ts`        | `scaffolds:validate`                       | `scaffolds.generated.md`                                   | Importera registry via `tsx`; kopiera inte filinnehåll               |
| Variants         | `config/scaffold-variants/*/*.json`                                   | Runtime registry + schema/editor           | `variants.generated.md`                                    | Generera relationer och designfält, inte promptprosa                 |
| Modeller         | `config/ai_models/manifest.json` validerad av `load-manifest.ts`      | Manifest parity + route-timeout check      | `models.generated.md`                                      | Märk declared-only-fält tydligt                                      |
| Policies         | `config/control-plane/{schema,policy}-registry.json`                  | `control-plane:check`                      | `policies.generated.md`                                    | Meta-index; varje rad måste peka på verklig owner                    |
| Env              | `src/lib/env.ts` för runtime; `config/env-policy.json` för governance | Typecheck + env parity/audit               | Del av `policies.generated.md`                             | Generera aldrig värden eller secrets                                 |
| BuildSpec        | `src/lib/gen/build-spec/types.ts` + derive-kod                        | Typecheck + orchestration tests            | `build-spec.generated.md`                                  | Endast typer, enumvärden och owner; inte heuristik som pseudokod     |
| Verification     | `quality-gate-checks.ts` + `manifest.json#qualityGateTiers`           | Quality-gate tests                         | Del av `policies.generated.md`                             | RenderGate/ReleaseGate i docs, kodnamn i parentes                    |
| Preview          | `BuildSpec.previewPolicy`, preview helpers och preview-host           | Preview tests/guards                       | Del av `policies.generated.md`                             | Ingen fristående stabil JSON-policy finns                            |
| Generation modes | `BuildSpecGenerationMode` + `isEffectiveInit`                         | Orchestration/follow-up tests              | Del av `build-spec.generated.md`                           | Skilj från fault-telemetrins mode-strängar                           |
| Terminologi      | `docs/architecture/glossary.md` + befintlig terminologipolicy         | Docs-check; ingen app-runtime              | Generera befintlig canonical path eller gör full migration | Skapa inte en parallell glossary-namespace                           |

Owner-modellen ovan är avsiktligt faktaspecifik:

- modellval och `qualityGateTiers` ägs deklarativt av modellmanifestet,
- env-klassificering ägs av `config/env-policy.json`, medan `src/lib/env.ts`
  äger vilka nycklar runtime får läsa,
- runtime-Zod/TypeScript kan validera ett manifest utan att bli owner för varje
  deklarerat beslut,
- strict schemas är maskinläsbara speglar där runtime-typen äger formen,
- registries äger tillgängliga identiteter när runtime faktiskt laddar dem,
- genererade dokument visar dessa relationer men äger inga beslut.

## Kända dubbla lager

Följande är inte automatiskt dubbletter. Hierarkin måste synas i generatorn:

| Högre sanning                   | Lägre/speglande lager                     | Beslut                                           |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| `src/lib/env.ts`                | `config/env-policy.json`                  | Runtime-nycklar respektive klassificeringspolicy |
| Zod i `load-manifest.ts`        | `manifest.schema.json`                    | Runtime respektive editor-schema                 |
| Dossier runtime-AJV             | `docs/schemas/strict/dossier.schema.json` | Samma valideringskedja; behåll                   |
| Dossiermanifest på disk         | `capability-map.json`                     | Regenererad tooling-vy; aldrig runtime-owner     |
| `docs/architecture/glossary.md` | `config/naming-dictionary.json`           | Full ordlista respektive liten warn-seed         |
| `glossary.md`                   | `.cursor/rules/terminology.mdc`           | Full källa respektive kort agentöversikt         |
| Runtime status-projektion       | UI-status                                 | UI ska konsumera, inte återhärleda               |

## Drift, motsägelser och brutna paths

| Yta | Status 2026-07-16 | Bevis eller nästa steg |
| --- | --- | --- |
| Aktiv Markdown-link/path-drift | LÅST | #533 gör `npm run docs:links` blockerande i CI. |
| `.github/README.md` och root `README.md` | FIXED | #528 gör dem till tunna routers utan felaktigt buildpåstående eller snapshotdatum. |
| `scripts/README.md` och aktiv planrouter | FIXED | #535 tunnar båda routers; #541 rättar preview-hostens verifieringssekvens utan dubbelkörning. |
| `config/naming-dictionary.json` | LÅST | #534 migrerar kanoniska termer och blockerar strukturell glossary-/aliasdrift. |
| `docs/schemas/builder-entry-contract.md` | FIXED OCH LÅST | #537 rättar den borttagna chat-referensen; #540 härdar guarden mot route groups, configs, public JS och breda docsundantag. |
| Historiska grandmaster-/planfiler | PARTIAL | Aktiv docs-CI ignorerar historik medvetet; återstående värdefulla filer ska få arkivheader och övriga raderas när git räcker. |

Historiska dokument ska inte få sina sakuppgifter omskrivna som om de vore
aktuella. De ska antingen få en arkivheader med ersättare eller tas bort när git
redan är tillräckligt arkiv.

## Legacy-kod: resultat utan radering

| Kandidat                                | Bedömning        | Bevis                                                                | Nästa säkra steg                                  |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `src/components/audit/`                 | KEEP             | Aktiv via audit-modal, `/api/audit`, `/api/audits` och tester        | Lägg route-test innan eventuell produktavveckling |
| `src/components/kostnadsfri/`           | KEEP             | Aktiv sida, DB-service, verify-route och extern provisioneringsroute | Extern caller-risk; radera inte                   |
| `src/components/modals/`                | KEEP             | Landing, category, wizard, audit och onboarding importerar ytan      | Ingen nollimporterad äldre modal hittad           |
| `src/app/api/figma/`                    | TESTED; NEEDS TELEMETRY | Aktiv klientcaller och feature-gate; #536/#539 lägger parser-/routetest och giltig App Router-exportgräns | Mät trafik före eventuell deletion |
| `src/app/api/wizard/`                   | KEEP             | Primär entry, fyra routes, credits och modellmanifest                | Lägg route-tester; ingen cleanup nu               |
| `src/app/api/integrations/marketplace/` | TESTED; NEEDS TELEMETRY | F3-envpanel och admin använder routes; #536 lägger route-/strategitest | Trafikdata före eventuell deletion |
| `src/app/api/integrations/mcp/`         | TESTED; NEEDS TELEMETRY | F3-yta läser blueprint; #536/#539 testar prioritering och låser app-projektet som env-owner | Trafikdata före eventuell deletion |
| Template-routes                         | KEEP             | Aktiv Template (v0-mall)-produkt, Blob i prod och lokal dev-fallback | Namnet v0 är inte i sig deletion-bevis            |
| Adminytor                               | KEEP             | Aktiv app-admin och separat backoffice med olika ansvar              | Konsolidera inte utan produktbeslut               |
| Dubbla `path-utils`                     | KEEP             | Traversal-säkerhet respektive route-normalisering                    | Olika semantik, inte dubblett                     |
| `/api/v0/projects/instructions`         | COMPAT/TOMBSTONE | 410 och inga interna callers                                         | Telemetri/deprecation före route-deletion         |

## `engine` och `v0`

| Yta                                            | Faktisk roll                        | Kontrakt                                                                             |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `src/app/api/engine/chats/**`                  | Kanonisk builder/own-engine API-yta | Nya chatfunktioner hör hemma här eller i delegerad `src/lib/api/engine/chats/`-logik |
| `src/app/api/v0/chats/**`                      | Borttagen                           | Ska inte återuppstå                                                                  |
| `src/app/api/v0/deployments/**`                | Aktiv, egen deploylogik             | API-versionerad compatibility boundary; inte engine-re-export                        |
| `src/app/api/v0/projects/[projectId]/env-vars` | Aktiv CRUD för F3                   | Behåll tills versionerad ersättare och caller-migration finns                        |
| `src/app/api/v0/projects/instructions`         | 410 tombstone                       | Ingen ny affärslogik; deletion kräver extern-callerbevis                             |

Levererad CI-regel i #537, härdad i #540:

1. failar om `src/app/api/v0/chats/**` återkommer, även via App Router route groups,
2. failar på nya `/api/v0/chats`-callers i aktiv kod, root-konfig, `vercel.json` och körbar JavaScript under `public/`,
3. failar på nya aktiva docsreferenser; bara exakta historiska migrationsrader undantas,
4. tillåter befintliga deploy/env-routes uttryckligen,
5. dokumenterar att ny affärslogik inte får läggas i compatibility-adaptrar.

## Nuvarande CI- och testkontrakt

| Kontroll              | Status                                       | Kommando                                                     |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| TypeScript            | Blockerande `quality`                        | `npm run typecheck`                                          |
| ESLint                | Blockerande `quality`                        | `npm run lint`                                               |
| Vitest                | Blockerande `quality`                        | `npm run test:ci`                                            |
| Follow-up-invariants  | Blockerande, kör även efter tidigare testfel | `npm run test:followup-contract`                             |
| Baseline dependencies | Blockerande                                  | `npm run baseline-deps:verify`, `npm run baseline-deps:tree` |
| Scaffolds             | Blockerande                                  | `npm run scaffolds:validate`                                 |
| Dossiers              | Blockerande                                  | `npm run dossiers:validate-all`                              |
| Control plane         | Blockerande                                  | `npm run control-plane:check`                                |
| Route timeouts        | Blockerande                                  | `npm run route-timeouts:check`                               |
| Preflight-paritet     | Blockerande                                  | `npm run preflight:common`                                   |
| DB schema drift       | Eget blockerande jobb                        | `npm run db:schema-drift`                                    |
| Prod migrations apply | Trusted non-PR: tillämpar migrationer/index  | `.github/workflows/ci.yml` → `prod-migrations-apply`         |
| Prod migration ledger | Trusted non-PR: verifierar prod-ledger       | `.github/workflows/ci.yml` → `prod-migrations-applied`       |
| Backoffice            | Eget blockerande jobb                        | `npm run backoffice:test`                                    |
| Review window         | Required PR-job; vänt-/freshness-kontrakt    | `.github/workflows/review-window.yml`                        |
| DB + Blob PR smoke    | PR utan secrets; validerar script/skip-path  | `.github/workflows/db-blob-sync-check.yml`                   |
| DB + Blob parity      | Credentialed gate på trusted non-PR-event    | `.github/workflows/db-blob-sync-check.yml`                   |
| Preview-host          | Eget blockerande jobb                        | Hostens `check`, `test:guards`, `test:patch`                 |
| Stability             | Advisory                                     | `npm run test:stability`                                     |
| Terminologitäckning   | Advisory och alltid exit 0                   | `npm run check:terms`                                        |
| Terminologi-ownership | Blockerande `quality`                       | `npm run check:terms:contract`                               |
| Borttagen v0-chat-yta  | Blockerande `quality`                       | `npm run compat:v0-chat-boundary:check`                      |
| Aktiva docs-länkar    | Blockerande `quality`                       | `npm run docs:links`                                         |
| Kontraktsdocs         | Blockerande `quality`                       | `npm run docs:check`                                         |
| Docs guardtester      | Blockerande via `test:ci`                   | `npm run docs:test`                                          |
| Format                | Inte i GitHub CI                             | `npm run format:check`                                       |
| Next build            | Inte i GitHub CI; körs av Vercel             | `npm run build`                                              |

De blockerande docs-kontrollerna arbetar bara på deterministiska projektioner,
strukturellt ägarskap och aktiva paths. Den breda termtäckningen är fortsatt
Advisory, och historikytor ger därför inte falska Blockers.

`review-window` bevisar bara att PR:n och dess head-SHA har fått ett avgränsat
granskningsfönster och att kända botar hunnit köra. Jobbet läser eller triagerar
inte reviewfynd.

## PR-plan

| PR  | Scope                                   | Förväntad diff                                                                                                             | Risk  | Rollback                               |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------- |
| 0   | Denna revisionsrapport                  | En fil, ingen radering                                                                                                     | Låg   | Revert rapportfilen                    |
| 1   | Dokumentationsgrund                     | Root/docs/Cursor/GitHub-router, system overview, code-map, mental model, F2/F3, init/follow-up                             | Låg   | Revert docscommit                      |
| 2A  | Dossier/capability-generator            | Generator, generated capability/dossier docs, scripts                                                                      | Medel | Ta bort script/output; runtime orörd   |
| 2B  | Scaffold/variant/model/policy-generator | Separat generatorutökning + generated docs                                                                                 | Medel | Revert generatorutökningen             |
| 2C  | `docs:check` i CI                       | Deterministisk driftkontroll, package scripts, CI                                                                          | Medel | Ta bort CI-steget; generated docs kvar |
| 2D  | Strukturerad terminologi                | Strukturerad källa + generering till befintlig `docs/architecture/glossary.md`, eller full migrering av alla länkar/regler | Medel | Återgå till handskriven glossary       |
| 3A  | Aktiv docs-hygien                       | Brutna aktiva länkar, slim active-router                                                                                   | Låg   | Revert docscommit                      |
| 3B  | Historikstädning                        | Arkivheaders + deletion av bevisade engångsartefakter                                                                      | Låg   | Git-revert återställer filer           |
| 4   | Lågrisk kod-/asset-cleanup              | Endast nollrefererade filer med removal-test                                                                               | Medel | Revert per featurefamilj               |
| 5   | Featurefamiljer                         | Audit, kostnadsfri, figma, wizard, marketplace/MCP var för sig                                                             | Hög   | Separat feature-PR och route-rollback  |
| 6A  | Engine/v0 guardrail                     | CI-regel, ingen route-deletion                                                                                             | Låg   | Revert guardscript                     |
| 6B+ | Owner-konsolidering                     | En signalägare per separat PR                                                                                              | Hög   | Revert per kontrakt                    |

PR 4–6 ska inte starta utifrån docsens ålder. De kräver imports, URL-callers,
registry/filesystem-laddning, Next.js-konventioner, git-historik, tester och vid
extern route-risk även telemetri/deprecation.

## Definition av klart per fas

| Fas | Bevis                                                                               |
| --- | ----------------------------------------------------------------------------------- |
| 0   | Rapporten är formaterad, länkgranskad och stämmer med aktuell SHA                   |
| 1   | Nya utvecklare hittar huvudloop, owners och verifieringskommandon utan historikbrus |
| 2   | `docs:generate` är deterministisk och `docs:check` blir röd på manipulerad output   |
| 3   | Inga aktiva docs länkar till raderad path eller använder arkiv som runtime-guide    |
| 4   | Removal-test + typecheck/lint/test/build visar oförändrat beteende                  |
| 5   | Route-/featuretest och telemetri visar att extern eller intern konsument inte bryts |
| 6   | Adaptrar delegerar; nya tester hindrar en andra owner eller ny v0-chatlogik         |

## Completion-matris 2026-07-16

Matrisen är en daterad arbetsstatus, inte runtime source of truth. Senast
avstämd mot `master` efter #540 (`886045b5b86b34b05c57c7aca11efaecd366c5bf`).

| Område                                   | Status      | Bevis och återstående kontrakt                                                                                                  |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Fas 0: audit och ownerinventering        | DONE        | #527 är mergad; rapporten är avgränsad till primära ytor och har faktaspecifika owners.                                         |
| Fas 1: tunn dokumentationsgrund          | DONE        | #528 är mergad med korrekt versionslivscykel, owner/validator-språk och utan phantom repair-path.                               |
| Fas 2: genererade kontraktsdocs          | DONE        | #529 levererar sju familjer och driftlås i CI; #532 låser även dolda env-, modellpolicy- och variantfält via fingerprints.      |
| Fas 3: legacy-/historikrensning          | PARTIAL     | #530 raderar bevisat stale docs, #533 låser aktiva länkar och Closure C tunnar aktiva ytor. Arkivheader-/deletion-long-tail återstår. |
| Agentregler för owner → generate → check | DONE        | Closure B låser owner → validate → generate → check i pipeline-regeln och pekar på dokumentationslivscykeln.                  |
| Terminologi/glossary-konsolidering       | DONE        | Glossaryn är ensam canonical; dictionaryn är valideringsseed och strukturell drift blockeras utan ett nytt runtime-system.    |
| Sena reviewfynd och integrationsrättelser | DONE        | #539, #540 och #541 rättar samtliga sena fynd från #535–#537; trådarna är besvarade och lösta med mergebevis.                  |
| Fas 4: lågrisk kodcleanup                | NOT STARTED | Kräver separat removal-bevis, tester och build per familj.                                                                      |
| Fas 5: featurefamiljer                   | PARTIAL     | #536/#539 testar och rättar Figma, marketplace och MCP. Audit, kostnadsfri, wizard och templates är fortsatt aktiva/KEEP; telemetri krävs före route-deletion. |
| Fas 6: compatibility/owner-konsolidering | PARTIAL     | #537/#540 levererar engine/v0-guardrail för den borttagna chat-ytan. Fas 6B+ med övrig ownerkonsolidering kräver separata semantik- och regressionstester. |

## Stoppunkter

- Ingen route-deletion utan extern-callerbevis.
- Ingen sammanslagning av owners med olika semantik.
- Ingen hård terminologigate innan dagens dictionary har migrerats till
  RenderGate/ReleaseGate/Normalize/RepairGate.
- Ingen generator som gör runtime-kod mer indirekt.
- Ingen docs-PR som samtidigt ändrar produktbeteende.
- Ingen featurefamilj i samma PR som dokumentationsgrunden.

## Kvarvarande osäkerhet

Denna revision verifierar repoanvändning och git-historik, inte produktionstrafik.
Figma, marketplace/MCP, audit, kostnadsfri och v0-tombstones kan ha externa eller
sällsynta callers. De är därför KEEP eller NEEDS TELEMETRY, aldrig DELETE, i
denna rapport.
