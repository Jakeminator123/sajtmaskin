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

## Dossierkontrakt

Dossier är capability-driven. Dossier selection ska vara deterministisk och spårbar.

Ägs av:

- `data/dossiers/{hard,soft}/<id>/manifest.json`
- `docs/schemas/strict/dossier.schema.json`
- `src/lib/gen/dossiers/`

Invariants:

- En capability kan välja en dossier via registry/selection.
- `hard` och `soft` beskriver extern secret-tyngd, inte F2/F3 i sig.
- F3-krav härleds från dossier-kontrakt: build-enforced env var eller server file surface.
- Verbatim-filer ska skyddas både i prompt och post-merge.
- `selectedDossierIds` är exakt signal för vilka dossiers som var aktiva i generationen.

## Scaffoldkontrakt

Scaffold är runtime-startpunkt. Endast registry-listade scaffolds används i codegen.

Ägs av: `src/lib/gen/scaffolds/registry.ts` och `src/lib/gen/scaffolds/*`.

Invariants:

- Scaffold-owned paths ska inte skrivas över av LLM-output om de är skyddade.
- Scaffold variant är design-axis, inte full regelmotor.
- Follow-up ska normalt behålla scaffold och variant.
- Scaffold-inventarie ska genereras från kod, inte hållas manuellt i architecture-docs.

## Quality gate

Quality gate ska vara binär för blockerande fel och explicit degraderad för “works but not solid green”.

Ägs av: `src/lib/gen/verify/quality-gate-checks.ts`.

Invariants:

- F2/designPreview är lättare än F3/integrationsBuild.
- F3 ska alltid gatea integration/build hårdare än F2.
- Advisory-safe F2 typecheck får inte bli false-green; status ska visa varning/degradation.
- Build-originated repair ska inte återgå till en för lätt gate.

## Versionstatus och event-bus

Event-bus är runtime-livscykel. FaultEvent är historik-/RAG-läsmodell och ska inte blandas ihop med EngineEvent.

Ägs av:

- `src/lib/logging/event-bus-types.ts`
- `src/lib/logging/event-bus-projection.ts`
- `src/lib/gen/verify/stale-verification.ts`

Invariants:

- EngineEvent är append-only.
- VersionStatus är en projektion av events plus terminal DB-reconciliation där det behövs.
- Degradations är förstaklassignal, inte loggbrus.
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
