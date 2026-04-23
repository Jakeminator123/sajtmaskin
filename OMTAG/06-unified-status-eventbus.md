---
id: omtag-06-unified-status-eventbus
title: Unified status event bus — single-writer istället för 4 parallella status-writers
phase: 2
priority: P2
parallell_med: []
blockerad_av: [03-wave-split-heatspots, 05-scaffold-default-removal]
estimat: "1 dag"
owner_files:
  - src/lib/gen/stream/** (status-emit-delar)
  - src/lib/logging/generation-log-writer.ts
  - src/lib/logging/event-bus.ts (ny)
  - src/components/builder/preview-panel/** (UI-läsare)
  - src/lib/gen/stream/finalize-version/step-telemetry.ts (om 03 skapat den)
---

# 06 — Unified status event bus

## Mål

Ersätt de 4 parallella status-skrivarna (`preflight.summary`, `engine_version_error_logs`, `server_verify_result`, klient-derived `versionStatus`) med **en single-writer event bus**. UI läser en projection av bussens event-ström — inte fyra olika tabeller.

Lägg också till en per-version **run-index** som listar alla run-mappar för samma `versionId` (repair-pass skapar ny run-mapp i dagsläget → UI tappar aggregering).

## Varför det här

Fatigue-agentens P2-A (unified resolver) är korrekt problembeskrivning men fel fix: en fjärde aggregerande resolver ovanpå tre racing writers = ännu ett lager. Rätt fix: **ett event-spår**, flera views.

Görs **sist** för att den kräver att 03 redan splittat telemetry ur `finalize-version.ts` och att 05 redan satt en tydlig "LLM-emit vs scaffold-hint"-gräns (annars skriver bussen dubbelt).

## Scope

| In | Ut |
|---|---|
| Ny `src/lib/logging/event-bus.ts` — append-only writer med `emit(event)` + typade events | Ta bort dev-log-skrivaren (den behålls som subscriber) |
| Migrera 4 nuvarande writers → subscribers av bussen | Lägga till persistering i ny DB-tabell |
| Per-version run-index-fil `.runs.json` | Ändra SSE-protokollet mot klienten |
| UI läser projection (`selectVersionStatus(events)`) | Refaktorera hela builder-UI:n |

## Event-typer (minimalt set)

```ts
type Event =
  | { t: "version.started"; versionId; chatId; ts }
  | { t: "version.stream.tokenProgress"; versionId; phase; ts }
  | { t: "version.autofix.result"; versionId; fixes; warnings; ts }
  | { t: "version.syntax.pass"; versionId; pass; errors; ts }
  | { t: "version.preflight"; versionId; summary; ts }
  | { t: "version.verifier.done"; versionId; blocked; findings; ts }
  | { t: "version.repair.started"; versionId; runId; reason; ts }
  | { t: "version.repair.passIndex"; versionId; runId; passIndex; ts }
  | { t: "version.saved"; versionId; previewBlocked; verificationBlocked; ts }
  | { t: "version.build.error"; versionId; error; ts }
  | { t: "version.done"; versionId; durationMs; ts };
```

## Inputs

1. `src/lib/gen/stream/finalize-version/step-telemetry.ts` (från 03, sannolikt)
2. `src/lib/gen/stream/finalize-preflight.ts`
3. `src/lib/gen/verify/verifier-pass.ts`
4. Befintlig dev-log-writer `src/lib/logging/generation-log-writer.ts`
5. UI-läsare: `src/components/builder/preview-panel/**`
6. `.cursor/rules/signal-ownership.mdc` — säkerställ att event-typer matchar signal-ägarskap

## Exekveringssteg

1. **Ny modul** `src/lib/logging/event-bus.ts`:
   - Append-only in-memory + speglad till `data/runs/<versionId>/<runId>/events.ndjson`
   - `emit(event)`, `subscribe(fn)`, `readAll(versionId)`-helpers
2. **Per-version run-index**: `data/runs/<versionId>/.runs.json` som listas av varje `emit` när en ny `runId` startar. UI kan läsa denna för att aggregera över repair-pass-mappar.
3. **Migrera writers** en i taget till subscribers:
   - (a) `preflight.summary` → `version.preflight`
   - (b) `engine_version_error_logs` → `version.build.error`
   - (c) `server_verify_result` → `version.verifier.done`
   - (d) klient-derived → ersätt med projection-funktion `selectVersionStatus(events): VersionStatus`
4. **Projection-test**: `src/lib/logging/event-bus.projection.test.ts` — givet event-stream X, förvänta status Y. Samma logik återanvänds på server och klient.
5. **Flush-fix**: den gamla timeline-writer-flushbuggen ("2 events i repair vs 30 i original") fixas automatiskt när allt skrivs genom bussen — men verifiera med ett ad-hoc-test.
6. **Ta bort** den gamla aggregerande-resolvern om en sådan införts som workaround.

## Får INTE göras

- Ingen DB-migration (skrivs till fil-system under `data/runs/` som idag).
- Inga nya env-flaggor för att toggla mellan gammalt och nytt — cut over.
- Röra inte autofix-statistiken — den är redan sin egen struct och passerar bussen oförändrad.
- Rör inte `serialize.ts`/`finalize-merge.ts` (05 äger dem).

## Acceptance criteria

- [ ] `src/lib/logging/event-bus.ts` finns med ≥ 10 event-typer.
- [ ] Inga `preflight.summary`, `engine_version_error_logs`, `server_verify_result` skrivs *utanför* bussen (grep verifierar).
- [ ] Per-version `.runs.json` skapas när repair-pass startar en ny runId.
- [ ] `selectVersionStatus`-projection har ≥ 8 test-scenarios.
- [ ] UI (`preview-panel`) renderar identiskt efter migrering (manuell verifiering + snapshot-tester där de finns).
- [ ] Eval-baseline (02) — inga regressions.
- [ ] `docs/architecture/orchestration-contract.md` (eller motsvarande) uppdaterad med event-schema.
- [ ] `npm run typecheck` + `npm run lint` + `npx vitest run` grönt.

## Branch

`omtag/06-unified-status-eventbus`
