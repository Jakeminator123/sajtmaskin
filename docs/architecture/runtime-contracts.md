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
- `hard` och `soft` beskriver extern secret-tyngd, inte F2/F3 i sig.
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
- ReleaseGate (kod: `integrationsBuild`) är F3-gaten: typecheck, build, lint
  och env-krav är strikta.
- F3 ska alltid gatea integration/build hårdare än F2.
- Advisory-safe F2 typecheck får inte bli false-green; status ska visa
  Advisory/degradation.
- Render-risk-koder, build/lint-fel och promote-guard-fel är Blocker.
- F2 har två Blocker-källor: RenderGates render-risk-TS-koder och
  finalize-verifierns build-breaking-fynd (`isBuildBreakingFinding` —
  import-/namnupplösningsklassen). Övriga verifier-fynd är Advisory i F2.
- Build-originated repair ska inte återgå till en för lätt gate.

## RepairGate

All LLM-repair går genom EN port. Detalj: `docs/schemas/quality-gate.md` § "En repair-port".

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

## Versionstatus och event-bus

Event-bus är runtime-livscykel. FaultEvent är historik-/RAG-läsmodell och ska inte blandas ihop med EngineEvent.

Ägs av:

- `src/lib/logging/event-bus-types.ts`
- `src/lib/logging/event-bus-projection.ts`
- `src/lib/gen/verify/stale-verification.ts`

Invariants:

- EngineEvent är append-only.
- VersionStatus är en projektion av events plus terminal DB-reconciliation där det behövs.
- Degradations är förstaklassignal (Advisory), inte loggbrus.
- Dead verify/repair-rundor ska settle:as av lease/stale-watchdog och aldrig fastna permanent i “verifying”.

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

Ägs av: `src/lib/live-site-url.ts`, `src/lib/vercelDeploy.ts`,
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

## Env-kontrakt

Ägs av: `src/lib/env.ts`, `config/env-policy.json`, preview-env helpers och dossier manifests.

Invariants:

- Appens env och generated-site preview-env är olika lager.
- F2 får rendera mock/placeholder-safe UI.
- F3 ska kräva riktiga värden där dossierns env enforcement säger `build`.
- Env-listor ska inte kopieras in i architecture-docs; läs schema/policy/kod.
