> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [BUG-SWARM-BACKLOG § Väntar på ägarbeslut](../../../../BUG-SWARM-BACKLOG.md)

# OpenClaw Builder — parkerat ägarbeslut

Disposition: **PARKERAT — starta separat experiment eller skrota?** Jakob äger frågan
i [backloggen](../../../../BUG-SWARM-BACKLOG.md). Detta är inte en aktiv plan,
ett ratificerat leveransbeslut eller aktuell runtimearkitektur.

Ursprungsplan: 2026-08-24, master `22673963a88cca84264929abcdfb3fa8a4afe611`.
Konsolideringsgranskning: 2026-11-05, `e651bb73f0f7660dad25f873791c5df476c06636`.
Alla tidigare 28 filer och diagram finns i Git vid det sistnämnda SHA:t under
denna katalog. Historisk experimentkod finns lokalt vid `archive/sand-oc` /
`archive/2026-10-05-sand-oc`, båda `dd8651a5fc37adddf8042792d62ef6e606e9fdf4`.
Ingen branch-/taggstädning ingår och ingen sådan prototyp är här godkänd för
dagens produkt.

## Dagens Sajtagent uppfyller inte automatiskt detta spår

[Sajtagenten idag](../../../concepts/sajtagenten.md) har manifest, bounded
`read_files` (4 filer/runda, 3 rundor/fråga), persisterad agentkonversation,
byggkommandon via vanlig pipeline och godkända quick-edit/repair-vägar. Gatewayn
är fortsatt minimal. Detta är inte separat serverjobbad shadow-planning,
revisionsbundet Builder-minne, candidate sandbox eller kandidatpreview.

Nuvarande owners: `src/lib/openclaw/`, `src/app/api/openclaw/chat/route.ts`,
`src/lib/builder/composer-route.ts`, `infra/openclaw/generate-config.mjs`.
Äldre nulägespåståenden om ingen filnavigation eller helt flyktig agenthistorik
är delvis överspelade och ska inte styra ny implementation.

En kvarvarande semantikfråga i fas P0 är `fullFileLimit`: idag begränsar den
manifestet, medan fulltext sammanfogar alla filer som ryms under teckentaket
(`server-context.ts:183,215`; `resolve-file-context.ts:42–50`). Besluta och
dokumentera rätt semantik vid återstart; hävda inte att ett filtalsstak redan
begränsar fulltextläsningen.

## Om spåret startas: följ P0 → P5

| Fas | Återstående kontrakt och acceptans |
|---|---|
| P0 Kontrakt/baseline | Reproducerbart benchmark, central budgetpolicy, schema/JobSpec, lane-/jobstatus, package-hash/receipt, lease/idempotency och audit/redaction. Alla nya flaggor av lämnar produktutfallet oförändrat. |
| P1 Read-only | Separat intern builderidentitet och broker, job.get, project.snapshot/list_files/read_file/search/diff, orchestration.explain, preview.status/logs/screenshot. Pagination, safe paths, byte-/träffbudget, pinnad version/revision; revisionsbyte invalidaterar minnet. Ingen skrivroute eller fri nätåtkomst. |
| P2 Shadow planner | Fruset GenerationInputPackage → strukturerad plan med mål/filer/kontrakt/risk/checkplan och receipt/package-hash/modellane. Jämför predicted files/routes/contracts med classic och blindbedöm per kategori. Planen påverkar inte kod, UX eller canonical orchestration. |
| P3 Kandidatsandbox | Exakt base i efemär tenant/job-isolerad overlay; apply_patch/replace_files/run_checks, komplett snapshot+manifest+hash. Offline, idempotent submit till artifactyta först, ingen användarversion eller officiell preview. Cleanup lämnar inga nästa-jobb-läsbara rester. |
| P4 Preview/repair | Egen kandidatpreview och revisionspinnad logg/screenshot. Högst två evidensstyrda preview-/repairvarv även över retry. CAS → befintlig finalize/merge/preflight → draft; vanliga RenderGate/ReleaseGate/lifecycle avgör promote. |
| P5 Opt-in/rollout | classic/openclaw_shadow/openclaw_candidate bakom explicit flagg. Intern shadow → offline → intern draft → opt-in F2 → liten F2-cohort → follow-up → tyngre/flerroute → imported/F3 sist. Övad kill switch, tokenrevocation/leasedränering/TTL och permanent classic recovery; ingen dold dubbeldebitering. |

Höj trafik eller bredda cohort först efter separat säkerhets- och
kvalitetsreview. Fasordningen och ordinarie runtimegrindar ersätter inte
denna review före utrullningsökning.

## Skyddsräcken som aldrig får falla bort vid återstart

- `engine_versions.files_json` och innehållsbunden `filesRevision` är sanning.
  Befintliga ägare bygger Brief, GenerationInputPackage, BuildSpec,
  scaffold/variant/dossiers/source receipt; inga parallella register eller
  agentminnen som kodkälla. Integrationssömmen ska omverifieras efter fruset
  paket före generator i både init och follow-up.
- Serverägt JobSpec binder jobId, tenantId, projectId, chatId, baseVersionId,
  baseFilesRevision, lineageHash, generationInputPackageHash, mode,
  allowedTools, budgets, leaseExpiresAt och idempotencyKey. Varje broker-call
  verifierar token/audience/scope, tenant/base/revision, path/storlek/budget
  och att jobbet inte är cancelled/superseded/expired. Klientgrants kan bara
  smalna av, aldrig skapa makt.
- Durable lease med heartbeat, absolut maxlivslängd och en lock-owner.
  Submit binds till job/key/base/revision/lineage/workspaceRevision,
  kandidathash och check receipts. CAS precis före persist, terminal
  stale_base, inga dubbelversioner. Ingen tyst rebase eller classic-körning
  mot ny base utan ett nytt användarsynligt försök.
- Rootless, hemlighetsfri executor skild från credentialbärande controller;
  read-only systemlager, isolerade tenants/jobs, syntetisk env, CPU/minne/
  disk/tid, default-deny egress, registry/dependency/scriptpolicy. Inga
  projektrester i återanvänd cache/workspace. Dependency scripts är opålitlig
  kod, inte ett tillstånd att köra i gatewayn.
- Kandidatpreview flyttar aldrig live preview_url/sessionpointer och delar
  aldrig muterbar liveworkspace. Agenten får inte direkt DB/Fly-shell,
  Render/Vercel-admin, plattforms-GitHub-write, fri fetch_any_url,
  promote_version/deploy_live/set_release_gate eller egna releasegrindar.
- Hårda tak för modell-/tool-/previewvarv, wall time, filer/bytes/diff,
  tokens/kostnad/parallellism och tenant/user-rate. Historiskt JobSpec-exempel
  var 3 modellvarv, 2 previewvarv, 900000 ms, 80 ändrade filer och 2000000 bytes;
  det är inte aktuella runtimevärden. Budgetpolicy ska ratificeras vid start.
- Audit per verktyg: jobb, tenantHash, chat/base/revision, tool/requestHash,
  policybeslut, tid/latens/resultat/workspaceRevision, token-/kostnadsdelta och
  artifactreferenser. Eventflödet har sekvens/tid/revision: created/frozen/
  plan/tool/candidate/check/preview/repair/submit/finalize/gate/terminalt.
  Scrubba prompt, filer, env, loggar, screenshots/OCR och dependency-output;
  inga råa hemligheter/fullfiler i normal driftlogg eller rå chain-of-thought
  i UX. Visa ärligt scope, läsläge, avkortning och faser.
- Före PoC verifieras credentialrotation och miljö-/serviceidentiteter,
  audit-retention, revocation, kill switch, path traversal, SSRF, injection,
  tenantförfalskning, token replay/expiry, workercrash, OOM, timeout, nätverks-
  deny och cleanup. Historiska exponeringsnoter är inte en aktuell incidentdom.
- Benchmark fryser prompt/base/package-hash/modellane/seed om tillgänglig och
  plattforms-SHA. Täck F2/content/flerroute/preservation/redesign/soft-mock/
  F3/import/media-3D/fel. Jämför samma modellklass/budget och blind kvalitet;
  redovisa krav/gates/preservation, p50/p95, kostnad/accepterad version,
  repair/OOM/timeout per kategori. Noll tenant-/secret-/stale-/dubbelpersist-
  incidenter; inga genomsnitt får dölja preservation- eller F3-regression.

## Öppna tekniska spikes

1. Sandboxprodukt: cold start och isolation på Render eller annan worker.
2. Kandidatpreview via preview-host utan att flytta live sessionpointer.
3. Stabil serialisering/versionering av hela GenerationInputPackage över deployer.
4. Separata fil-/block-/config-hashar mot konfigurationsdrift.
5. Durable lease/idempotency utan en konkurrerande generationslock-owner.
6. Redaction och retention för loggar, screenshots/OCR och revisionspinnad evidens.
7. Tillåtna package-skript/checks/dependencies och deras isolerade exekvering.

## Ägarval som återstår

Starta eller skrota; standard/opt-in/dyrare byggprofil; tillåten extra latens;
synliga verktygsfaser; fler än två repairvarv mot extra credits; när modellen
ska fråga; framtida eget GitHub read-only; canvas inbyggd/separat/ingen.
Modell per fas, sandboxhosting, DB/kö, prissättning, GitHub-write och autonom
live-deploy är inte beslutade av detta underlag.

Eget GitHub är en separat capability: project-scoped App, installation/consent,
read-only först, fast commit-SHA och egen write-grant till ny branch/PR;
Sajtmaskins plattformstoken får aldrig återanvändas.

Canvas är valfri operatorprojektion av serverevents, inte kodlager, job queue,
kontraktsägare eller credentialyta. Historisk prototyp:
https://ai-workflow-canvas.v0.build/builder?prompt=grgre&mode=analyserad
(login krävdes 2026-08-24; ingen aktuell webbaudit). Lägg ingen kod eller
hemlighet i queryparams. Utvärdera först efter P1.

Arbete återupptas enligt aktuell canonical Git-/workflowpolicy och ett nytt
ägarmandat, inte gamla instruktioner för `builder-branch`. Ingen parallell
trunk, ingen implicit merge/deploy eller ändring av branchskydd. Bevarade
historikrefar ska inte tas bort som en bieffekt av dokumentstädningen.
