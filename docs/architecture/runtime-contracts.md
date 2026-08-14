# Runtime contracts

Det här dokumentet beskriver invariants. Det ska inte duplicera hela schemas eller enumlistor.

## BuildSpec

`BuildSpec` är generationens runtime-policy. Den ska läsas av nedströms kod i stället för att samma beslut härleds igen.

Ägs av: `src/lib/gen/build-spec/`.

Invariants:

- `previewPolicy` styr F2/F3.
- `verificationPolicy` styr hur tung verifieringen ska vara.
- `contextPolicy` och tokenbudget styr Dynamic Context, inte godtyckliga promptlängder.
- `routeRealization` ska göra multipage/init hanterbart utan att dölja routes.
- `capabilityFlags` ska bära capability-heaviness så downstream inte räknar om.
- `complexityHint` (Byggval, init-only) får golva `qualityTarget` uppåt och bias:a `contextPolicy` — men aldrig demota quality under vad routes/integrationer kräver.

## Promptkontrakt

System prompt består av två lager:

```txt
Core Rules + Dynamic Context
```

- Core Rules är statiska produktregler i `config/prompt-core/`.
- Dynamic Context är request-specifikt och byggs i `src/lib/gen/system-prompt/`.
- User prompt ska inte dupliceras som systemprompt-block.
- Required Dynamic Context-block ska överleva pruning.
- I F3 är en icke-tom filhärledd `Tier3BuildSpec` basauktoritet i prompten;
  endast providers som uttryckligen godkänts i aktuell runda får läggas till.
  `preGenerationContracts` är fallback när filspec saknas eller är tom.

## Dossierkontrakt

Dossier är capability-driven. Dossier selection ska vara deterministisk och spårbar.

Ägs av:

- `data/dossiers/{hard,soft}/<id>/manifest.json`
- `docs/schemas/strict/dossier.schema.json`
- `src/lib/gen/dossiers/`

Invariants:

- En capability kan välja en dossier via registry/selection.
- Init och follow-up ska mata samma named capability-detektor till
  `requestedDossierCapabilities`; bred `inferCapabilities` är ett komplement.
- `hard` och `soft` beskriver deklarerad provider-/integrationskoppling, inte
  secret-tyngd eller F2/F3 i sig. Kopplade dossiers kan vara nyckelfria.
- F3-krav härleds från dossier-kontrakt: build-enforced env var eller server file surface.
- Verbatim-filer ska skyddas både i prompt och post-merge.
- `selectedDossierIds` är exakt signal för vilka dossiers som var aktiva i generationen.
- Explicit removal är enda shrink-undantaget: `removedCapabilities` ska
  subtraheras ur inference/contracts/brief/F3-godkännanden och
  `removedDossierIds` ska nå finalize, där manifestägda filer raderas efter
  merge med shared-path-skydd och en ny importkontroll.
- Versionens filer är sanningen för dossier-NÄRVARO (version-presence): "valda
  dossiers för en chat/version" = snapshot-selektion ∪ filbevis, ägd av
  `resolveSelectedDossiersWithVersionPresence` (`version-presence.ts`).
  Panel (dossiers-routen), readiness, finalize-design, stream-F3-gaten och
  deploy-env-gaten läser ALLA samma resolver — ingen konsument gör en egen
  union, så panel och gates kan inte säga emot varandra.
- Capability-signaler som ska överleva till nästa runda måste ligga i
  `PROTECTED_CAPABILITY_SIGNAL_KEYS` (`orchestration-snapshot.ts`).
  Snapshot-sanitizern har en nyckelbudget som delas över all nästling och som
  `break`:ar tyst när den tar slut, och signalerna ligger efter de stora
  payloadsen (`buildSpec`, `briefSummary`, kontraktsarrayerna) i stream-metan.
  En ny signal som inte skyddas nås därför aldrig av budgeten på en riktig
  körning — den försvinner utan felmeddelande, vilket 2026-07-27 tappade både
  `mutedCapabilities` (Byggblock visade `planned: 0`) och tombstonen
  `removedCapabilities` (borttagen integration kunde återuppstå).

## Scaffoldkontrakt

Scaffold är runtime-startpunkt. Endast registry-listade scaffolds används i codegen.

Ägs av: `src/lib/gen/scaffolds/registry.ts` och `src/lib/gen/scaffolds/*`.

Invariants:

- Scaffold-owned paths ska inte skrivas över av LLM-output om de är skyddade.
- Scaffold variant är design-axis, inte full regelmotor.
- Follow-up ska normalt behålla scaffold och variant.
- Scaffold-inventarie ska genereras från kod, inte hållas manuellt i architecture-docs.

## RenderGate / ReleaseGate

RenderGate och ReleaseGate ska vara binära för Blocker-fel och explicit
degraderade för "works but not solid green".

Ägs av: `src/lib/gen/verify/quality-gate-checks.ts`.

Invariants:

- RenderGate (kod: `designPreview`) är F2-gaten: preview ska boota/rendera.
- ReleaseGate (kod: `integrationsBuild`) är F3-gaten: en lease-skyddad
  filesnapshot verifieras i VM med typecheck → build (lint borttagen ur den
  blockerande lanen 2026-07-22; kan återaktiveras via manifestet). Env-krav
  täcks av placeholders (alltid tillåtna — demoläge tills riktiga nycklar
  fylls i via Byggblock); en build-nyckel utan placeholder-täckning är
  fortfarande Blocker.
- F3 ska alltid gatea integration/build hårdare än F2.
- En vald hard- eller soft-Byggblock behåller sin F2 visuella fallback.
  `buildBlockingKeys` är bara en säkerhetsgate per nyckel, inte ett register över
  vilka capabilities som finns. När alla F3-kravs
  `requiredRealEnvKeys` är tomma skapas en ny `integrations`-version vars
  `files_json` är byte-för-byte samma som den valda F2-förälderns. ReleaseGate
  (`integrationsBuild`) körs strikt på F3-forken utan F3-LLM-runda; F2-raden
  lämnas orörd. `feature-runtime` och `warn-only` fortsätter vara Advisory och
  kan aktiveras senare via `projectEnvVars`.
- Advisory-safe F2 typecheck får inte bli false-green; status ska visa
  Advisory/degradation.
- Render-risk-koder, build/lint-fel och promote-guard-fel är Blocker.
- Saknad projektlokal ESLint/config är ett icke-repairbart verktygsfel, aldrig
  en grön lint-skip. Verify använder inga implicit nedladdande `npx`-kommandon.
- F2 har två Blocker-källor: RenderGates render-risk-TS-koder och
  finalize-verifierns build-breaking-fynd (`isBuildBreakingFinding` —
  import-/namnupplösningsklassen). Övriga verifier-fynd är Advisory i F2.
- Build-originated repair ska inte återgå till en för lätt gate.

## RepairGate

All LLM-repair går genom EN port. Flöde:
[`quality-gate-flow.md`](quality-gate-flow.md). Fält:
[`../schemas/quality-gate.md`](../schemas/quality-gate.md) § "En repair-port".

Ägs av: `src/lib/gen/autofix/llm-repair-gate.ts` (porten + `RepairLedger`),
`src/lib/gen/verify/repair-loop.ts` (loopen), `resolveSameSignalGateChecks` i
`quality-gate-checks.ts` (samma-signal-mappningen), `resolveServerRepairOutcome`
i `server-verify-log-meta.ts` (outcome-strängar).

Invariants:

- `runLlmFixer` har exakt en produktions-callsite: inuti `runLlmRepairGate`.
  Vaktad av `llm-fixer-callsite-guard.test.ts` — ny RepairGate-ingång routas via
  gaten, aldrig direkt.
- En repair är bara lyckad när SAMMA signal som failade passerar igen
  (`resolveSameSignalGateChecks` unionerar ursprungets failade checks in i
  post-repair-gaten). Syntax-ren men RenderGate/ReleaseGate-röd ⇒ `syntax_clean_gate_failed`,
  aldrig success.
- `RepairLedger`-dedupe gäller över lanes inom samma körning (finalize →
  server-verify via `FinalizeResult.repairLedger`/`repairScopeId`). Nyckeln
  innehåller `contentHash`: nytt innehåll blockeras aldrig.
- Superseded version (nyare version / `files_json` avancerade) ⇒ tidig abort
  med outcome `superseded_by_newer_version`, inte jobba-klart-och-kastas.
  Lease släpps alltid.
- `resolveServerRepairOutcome` är enda ägaren av repair-outcome-strängar.
- Starta aldrig en repair som en annan policy förbjuder att lyckas. Konkret:
  F2 strippar tier-3-SDK-importer med flit (`tier3-sdk-guard-fixer`) och
  `deterministic-import-repair` vägrar lägga tillbaka dem i F2 — därför
  suppimeras verifier-fynd om saknad tier-3-import i F2
  (`suppressTier3StrippedImportFindings`). Utan den blev det en loop: guarden
  tog bort, verifier larmade som om det vore en bugg, RepairGate brände ett
  LLM-anrop och rapporterade `still-failing`. Prod 2026-07-22→29 visar samma
  fynd på `app/api/contact/route.ts` vecka efter vecka. I F3 är SDK:n
  installerad, så där är samma fynd ett äkta fel och suppimeras inte.

## Mätning av kontroll-lagren

Frågan "vilket reparationslager ingriper faktiskt, och bär det sin vikt?"
besvaras **bara** ur databasen. Prometheus-räknarna i
`src/lib/observability/metrics.ts` är in-memory per serverless-instans och
nollställs när instansen återvinns — de duger för spot-koll, aldrig för
"hur ofta över tid". Samma sak för event-bus och devLog: ephemera i prod.

Ägs av: `persist-telemetry.ts` (skriver `generation_telemetry`),
`failure-log.ts` + `persist-side-effects.ts` (skriver
`engine_version_error_logs`), `error-log-rag.ts` (skriver `error_log_events`).

| Lager | Durabel signal |
|---|---|
| Normalize + post_merge, per fixer | `generation_telemetry.meta->'autofix'->'fixers'` — `{fixer, category, lane, count, files}` per version (post_merge-lanen inkluderad sedan 2026-08-01; tidigare bara devLog) |
| Normalize, aggregat | `generation_telemetry.autofix_applied`, `meta.autofix.fixCount`, `safeFixCount`/`riskyFixCount`/`riskyFixerIds` (Normalize-lanen enbart) |
| RepairGate (syntax) | `generation_telemetry.syntax_fixer_used` |
| RepairGate (verifier / repair-loop) | `error_log_events.fixer` + `.result` (`fixed` / `still-failing` / `noop`) |
| Verifier-fynd | `engine_version_error_logs` category `quality-gate:verifier-blocking` |
| Preflight | `preflight_error_count` / `preflight_warning_count` + `meta.issues` |
| RenderGate/ReleaseGate | `engine_version_error_logs` category `preflight:quality-gate` (`meta.checks`, `firstFailureCheck`) |

Invariants:

- Lägg aldrig ett fixer-/gate-utfall enbart på en Prometheus-räknare, event-buss
  eller devLog. Ska utfallet gå att svara på i efterhand måste det nå en av
  tabellerna ovan.
- Namnge ingen räknare i `FIXER_REGISTRY.telemetryCounter` som inget skriver.
  En fantomräknare läses som "det här mäts" och skickar nästa läsare att leta
  efter data som aldrig skrevs.
- `scripts/db/control-stats.mjs` är den samlade läsvyn (`fixersByName`,
  `autofixRisk`, `qualityGateChecks`, `errorsByCategory`). Nya signaler
  exponeras där, inte i en ny egen rapport.
- `generation_telemetry.quality_gate_result` bär trots namnet **finalize**-utfallet
  (`preflight_passed` / `preflight_failed` / `verifier_failed`) — aldrig
  VM-gatens verdikt. Det ligger i `engine_version_error_logs`.

## Versionstatus och event-bus

Event-bus är runtime-livscykel. FaultEvent är historik-/RAG-läsmodell och ska inte blandas ihop med EngineEvent.

Ägs av:

- `src/lib/logging/event-bus.ts`
- `src/lib/logging/event-bus-types.ts`
- `src/lib/logging/event-bus-projection.ts`
- `src/lib/gen/verify/stale-verification.ts`

Invariants:

- EngineEvent är append-only.
- VersionStatus är en projektion av events plus terminal DB-reconciliation där det behövs.
- Degradations är förstaklassignal (Advisory), inte loggbrus.
- Dead verify/repair-rundor ska settle:as av lease/stale-watchdog och aldrig fastna permanent i “verifying”.
- Tmp-spegeln på Vercel (`os.tmpdir()/sajtmaskin/data/runs`) har ett bindande byte-tak; antalstaket är bara en snabbväg. Lokal `data/runs/` under repo-roten prunas inte.

## Previewkontrakt

Preview är VM/runtime för iteration. Den är inte samma sak som deploy.

Ägs av: `src/lib/gen/preview/` och `preview-host/`.

Invariants:

- Live preview går via preview_host/VM när tier-2 är tillgängligt.
- Preview-session ska kunna återanvändas när chat+version matchar.
- Quick-edit patch får bara patcha rätt basversion.
- Dependency/config/fel basversion ska falla tillbaka till full restart.
- F3-preview ska inte maskera saknade riktiga env-värden med F2-stubbar.
- `previewUrl` är aldrig `liveUrl` eller SEO-canonical och publika previews ska
  svara med `noindex`/`no-store`.

## Public URL-kontrakt

Publicerad URL-state ägs av användarprojektet och hosting-projektet, inte av en
enskild deployment eller en process-global SEO-env.

Ägs av: `src/lib/live-site-url.ts`, `src/lib/vercel/vercel-deploy.ts`,
`src/app/api/v0/deployments/`, `src/app/api/domains/` och
`app_projects`/`deployments` i `src/lib/db/schema.ts`.

Invariants:

- `liveUrl` resolveras i ordningen verifierad `customDomain` → verifierad
  Sajtmaskin-standardadress → `providerUrl`.
- `providerUrl` bevaras för status, felsökning och rollback, men får inte
  ersätta en högre verifierad URL-nivå i webhook/SSE/GET.
- `published_slug` och provider-projektnamn är stabila per `app_projects.id`;
  användarcopy får aldrig retargeta ett annat tenants hosting-projekt.
- Domänägarskap räcker inte: DNS-konfiguration ska också vara grön innan en
  domän får `verified_at`, blir `liveUrl` eller används som SEO-canonical.
- Feature-gaten för branded URLs är en riktig rollback: när den är av används
  inte sparade branded aliases som `liveUrl`.
- Global SEO-domän är förbjuden i multi-tenant-flödet. SEO använder resolved
  projekt-URL; en projektspecifik sparad URL får bara vara rollout-fallback.
- Migration av befintliga sajter är dry-run som default och får bara mutera
  projekt med en faktisk ready deployment mot verifierat provider-projekt.

## DB och lease-kontrakt

Ägs av: `src/lib/db/schema.ts`, `scripts/db/db-init.mjs`, `src/lib/db/migrations/`.

Invariants:

- `engine_versions.files_json` är den sparade versionens filkälla.
- `lifecycle_stage` skiljer design/F2 från integrations/F3.
- `edit_kind = quick_edit` markerar minor-versioner.
- `parent_version_id` binder F3-forkar och quick-edit-minors till basversion.
- Muterande verify/repair/quick-edit-flöden ska respektera version lease.
- `files_json`-skrivningar via den kanoniska skrivägaren `updateVersionFiles`
  (user-edit `/files` PUT/PATCH/DELETE samt normalize-/validate-/heal-vägar) tar
  samma lease atomiskt i UPDATE:ns WHERE: en främmande, ej utgången lease
  blockerar skrivningen (retrybar `409 version_busy`, eller no-op på den
  best-effort heal-vägen) så ett filset inte kan avancera till B medan
  ReleaseGate verifierade A. `holderRunId` är en escape hatch för en FRAMTIDA
  lease-hållande `files_json`-skrivare — ingen nuvarande caller använder den
  (verify/repair skriver via `saveRepairedFiles`/`promoteVersion`/`markVersion*`
  som redan är lease-bundna via `versionWriteWhere`).

## Env-kontrakt

Ägs av: `src/lib/env.ts`, `config/env-policy.json`, preview-env helpers och dossier manifests.

Invariants:

- Appens env och generated-site preview-env är olika lager.
- F2 får rendera mock/placeholder-safe UI.
- F3 ska kräva riktiga värden där dossierns env enforcement säger `build`.
- Env-listor ska inte kopieras in i architecture-docs; läs schema/policy/kod.
