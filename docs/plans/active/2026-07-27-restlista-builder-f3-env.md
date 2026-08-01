---
status: active
owner: unassigned
created: 2026-07-27
topic: Restlista — små, oberoende svansar från konsoliderade planer. Sex rader kvar 2026-08-01: env-scope i export (R5, blockerad), dossier-aktiverings-E2E (R8-resten), redeploy-paus i pollningen (R12), pool-ratten (R13, prod-observation) samt innehållsrevisionens svansar — flagg-släppet (R14, ägarbeslut) och /versions-revisionstrådningen (R15). Levererade rader är indexerade i ../avklarat/README.md
source: Kodverifiering 2026-07-27 mot master `3b419115` av fyra read-only-agenter. Ersätter svansarna i de raderade planerna 2026-07-13-builder-status-ui-declutter.md, 2026-07-13-anvandarsajt-env-konsolidering.md och 2026-07-13-stabilisering-verify-f3-doman-plan.md (§ 6, § 7, PR 4) — kärnan i de tre är levererad och indexerad i ../avklarat/README.md
---

# Restlista: builder-UI, F3-scope och env-klarhet

Varje rad här är **liten och oberoende**. Ta en eller flera i samma PR — de delar
inte kod och behöver ingen inbördes ordning.

Levererade rader (R1–R4, R6, R7, R9, R10, R11 samt R8:s monteringsdel) står i
[`../avklarat/README.md`](../avklarat/README.md) med PR-referenser; git bär
diffarna. De låg tidigare kvar här som ~120 rader färdigt arbete, vilket gjorde
att man fick läsa fyra skärmar levererat innan man hittade nästa uppgift.

## Restrader

| # | Rest | Ägarfil | Åtgärd |
|---|---|---|---|
| R5 | `.env.local` faller tillbaka till hela dossier-katalogen | `project-scaffold.ts:688-689` (`selectedKeys === undefined`) | **Blockerad** — se nedan. Ta bort fallbacken först när alla vägar trådar scope |
| R8 | Ingen aktiverings-E2E per Kopplad dossier | saknas | Visa att en dossier byter från demoläge till skarpt läge när en riktig nyckel sparas. Monteringsdelen är klar (#659) — se nedan |
| R12 | Ingen redeploy-tålighet i pollningen — en prod-deploy mitt i en session ger en 500-skur medan nya instanser värms upp | saknas i `useVersionStatus.ts`, `useChatReadiness.ts`, `useVersions.ts` | Pausa/förläng klient-polling en kort stund vid detekterad ny deployment. **Kräver ett beslut först** — se nedan |
| R13 | `POSTGRES_POOL_MAX` är fortfarande 3 — mätningen finns, ratten är orörd | `src/lib/db/client.ts:147-154`; mätsidorna är `pool-stats.ts` (app) + `db:health` → `connections` (server) | **Prod-observation, ingen kodrad.** Läs `[pool=n/n idle=… waiting=… at-ceiling]` i 503-raden vid nästa pool-händelse; `at-ceiling` ⇒ höj, lite `headroom` ⇒ höj inte utan flytta långlivade vägar till non-pooling |
| R14 | `SAJTMASKIN_CONTENT_REVISION_GATE` är fortfarande av — innehållsrevisionens läsare (steg 3, #693) jämför bara med flaggan på | `docs/ENV.md` (flaggan) · räknaren `sajtmaskin_content_revision_mismatch_total` i `src/lib/observability/metrics.ts` | **Ägarbeslut med recept** — se nedan |
| R15 | `/versions`-listan trådar inte revisionen — historikbadgen kan visa "Klar" för en version vars innehåll skrivits om | `GET .../versions`-routen (kör `reconcileTerminalDbState` per version) | **En** `DISTINCT ON (version_id)`-fråga för hela chatten (indexet `idx_generation_telemetry_version_revision` finns) — inte N+1 i en pollad listväg som inte får skriva |

## Detaljer där raden inte räcker

### R5 — preconditionen är **inte** uppfylld (kodverifierat 2026-07-28)

Åtgärden säger "ta bort fallbacken när alla vägar trådar scope". Det gör de inte:
`buildExportableProject`s verbatim-gren anropar `buildPlaceholderEnvLocalBody()`
**utan** options (`build-exportable-project.ts:97`), så `selectedKeys` är
`undefined` där. Tar man bort fallbacken nu förlorar en importerad repo utan egen
`.env.local` hela placeholder-kuvertet, och preview↔verify-pariteten som Codex P2
på #594 införde bryts. Trådningen genom export/verify-vägen måste komma först.

**Läs den angränsande backlog-raden innan du börjar.**
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) har en P3-rad om att
`resolvePreviewEnvLayers` seedar **hela** placeholder-katalogen (56 nycklar) för
varje design-preview. Det är ett annat lager än R5 (som gäller
`.env.local`-scaffoldingen), men samma tema: vi seedar mer env än sajten
använder. De kan visa sig vara en leverans.

### R8 — bara aktiverings-E2E kvar (monteringsdelen klar 2026-07-30, #659)

`dossier-client-mount.test.tsx` grindar numera att varje renderbar `.tsx` i en
Kopplad dossier antingen har ett monteringsfall eller ett utskrivet skäl att
sakna det. Grinden och dess lärdomar bor i testfilens egen doc-kommentar —
duplicera dem inte hit.

Vad som återstår är en annan sak: monteringen bevisar **demoläget**, inte att en
dossier *byter* till skarpt läge när en riktig nyckel sparas. Det kräver antingen
en riktig nyckel eller en trovärdig provider-stub, och hör därför inte till samma
svit. Är svaret en stub behöver den vara trovärdig nog att aktiveringen faktiskt
bevisas — en stub som bara svarar 200 flyttar problemet.

### R12 — kräver en ny signal, alltså ett beslut före kod

Åtgärden säger "vid detekterad ny deployment", men **appens egen
deployment-identitet finns inte i koden** (kodverifierat 2026-07-30): samtliga
`deploymentId`-förekomster gäller *användarsajternas* Vercel-deployer, inte
Sajtmaskin-appens. Raden kan alltså inte tas mekaniskt — någon måste först
bestämma hur klienten ska veta att servern bytts (t.ex. ett build-id i en
svarsheader som klienten jämför mot sitt eget), och det är ett nytt kontrakt.

Klient-backoffen som redan finns (`poll-backoff.ts`, levererad som A2) täcker
själva skuren; R12 handlar om att korta den genom att pausa i förväg i stället
för att backa av på 500:or.

### R14 — släpp revisionsflaggan (ägarbeslut, receptet bevarat ur den upplösta planen)

Innehållsrevisionens kärna är levererad och indexerad i
[`../avklarat/README.md`](../avklarat/README.md) (steg 1–2 #642, grind #674,
steg 3 #693 bakom flagga, default av). Utrullningen planen föreskrev: sätt
`SAJTMASKIN_CONTENT_REVISION_GATE=true` i **preview** först, läs
`sajtmaskin_content_revision_mismatch_total` via `/api/metrics` (kräver
`SAJTMASKIN_METRICS_TOKEN`) och se hur ofta känd mismatch inträffar per yta
innan production. Sprängradien är strukturellt liten: rader utan revision kan
per definition inte blockera något (fail-open för okänd revision — bara **känd**
mismatch blockerar, och den är retrybar/`indeterminate`, aldrig terminal).

Obs: R15 nedan och backlog-P2-raden "Preview-sessionen bär ännu inte den
bootade innehållsrevisionen hela vägen" är kvarvarande läsarluckor — den
sistnämnda ska vara stängd innan flaggan slås på i prod.

### R10-canaryn lämnade publiceringsvägen oobserverad

Prod-canaryn 2026-07-29 nådde aldrig `Publicera` eller egen domän, eftersom
ReleaseGate var röd (korrekt beteende, men deploy-vägen blev därför otestad).
**Nästa canary bör köras på en prompt utan integrationer** så release blir grön
och publiceringssteget faktiskt nås. Canaryns övriga utfall står i
[`../avklarat/README.md`](../avklarat/README.md).

## Verifiering

| Rest | Minsta verifiering |
|---|---|
| R5 | `npm run typecheck` + `npm run test:followup-contract` + export/verify-svitarna |
| R8 | nya tester gröna + `npx vitest run src/lib/gen/dossiers/` |
| R12 | `npm run typecheck` + hook-tester (`useVersionStatus.test.ts`, `poll-backoff.test.ts`) |
| R13 | Prod-observation — ingen kodgrind. Notera pool-raden och `db:health`-siffran här innan ratten vrids |
| R14 | Ingen kodändring — env-flagga + `/api/metrics`-läsning; preview före prod |
| R15 | `npm run typecheck` + `npx vitest run` för versions-routens svit + `npm run test:postgres` (revisionsläsningen ska bevisas mot riktig Postgres som övriga läsare) |

## Explicit icke-mål

- Ingen ny env-yta, ingen återinförd `ProjectEnvVarsPanel`.
- Ta inte bort `/readiness`-datan eller `canDeploy`-grinden — bara UI-presentationen.
- Ingen bred verify-refaktor; innehållsrevisionens kärna är levererad och
  indexerad i [`../avklarat/README.md`](../avklarat/README.md) — dess svansar
  är R14–R15 ovan.
