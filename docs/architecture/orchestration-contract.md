# Orchestration contract — unified status event bus

Post-OMTAG-06 architecture doc for the **single-writer event bus** that
replaces the four racing status writers (`preflight.summary` devLog
entries, `engine_version_error_logs` DB rows, `server-verify.policy`
devLog entries, and the client-derived `versionStatus` computed from
DB row flags).

If this doc and the code disagree: the code wins.

## Files

| File | Role |
|---|---|
| `src/lib/logging/event-bus-types.ts` | Canonical event union + `VersionStatus` projection type |
| `src/lib/logging/event-bus.ts` | `emit()` / `subscribe()` / `readAll()` + per-version `.runs.json` index |
| `src/lib/logging/event-bus-projection.ts` | Pure `selectVersionStatus(events)` used by both server and UI |
| `src/lib/logging/event-bus-subscribers.ts` | devLog-mirror subscriber (legacy compat) |
| `src/lib/logging/event-bus-error-log-sink.ts` | DB sink subscriber + `emitVersionErrorLogs()` wrapper |

## Filesystem layout

```
data/
  runs/
    <versionId>/
      .runs.json                 # per-version index of runIds (root, repair-1, …)
      root/events.ndjson         # initial pass
      repair-1/events.ndjson     # first repair pass
      repair-2/events.ndjson     # second repair pass
      …
```

`.runs.json` is an array of:

```ts
interface RunIndexEntry {
  runId: string;        // "root" | "repair-1" | …
  versionId: string;
  startedAt: string;    // ISO timestamp (first event in this run)
  reason: string | null;
}
```

`readAll(versionId)` folds every run's NDJSON back into one logical
stream in `ts` order, which is how the projection aggregates events
across repair passes (fixes the old "2 events in repair vs 30 in
original" flush bug by construction).

## Event schema

```ts
type EngineEvent =
  | { t: "version.started";
      id; ts; versionId; chatId?; runId;
      generationKind?: "create" | "followup" | "plan";
      model?: string;
      scaffoldId?: string; }
  | { t: "version.stream.tokenProgress";
      id; ts; versionId; chatId?; runId;
      phase: "reasoning" | "output" | "ending";
      chars?: number; }
  | { t: "version.autofix.result";
      id; ts; versionId; chatId?; runId;
      fixes: number; warnings: number; dependencies?: number; heavyLoad?: boolean; }
  | { t: "version.syntax.pass";
      id; ts; versionId; chatId?; runId;
      pass: number; errors: number;
      phase?: "validating" | "fixed" | "invalid" | "gave_up" | "ok"; }
  | { t: "version.preflight";
      id; ts; versionId; chatId?; runId;
      filesChecked: number; issueCount: number;
      errorCount: number; warningCount: number;
      previewBlocked: boolean; verificationBlocked: boolean;
      previewBlockingReason?: string | null; }
  | { t: "version.verifier.done";
      id; ts; versionId; chatId?; runId;
      outcome: "passed" | "failed" | "skipped";
      blocked: boolean;
      findings?: Array<{ id: string; detail: string }>;
      reason?: string | null; }
  | { t: "version.repair.started";
      id; ts; versionId; chatId?; runId;
      reason: string;
      trigger: "server-verify" | "build-error" | "manual" | "accept-repair"; }
  | { t: "version.repair.passIndex";
      id; ts; versionId; chatId?; runId;
      passIndex: number; }
  | { t: "version.saved";
      id; ts; versionId; chatId?; runId;
      previewBlocked: boolean; verificationBlocked: boolean;
      messageId?: string; }
  | { t: "version.build.error";
      id; ts; versionId; chatId?; runId;
      error: { stage: string; message: string; failureCode?: string | null };
      category?: string; level?: "info" | "warning" | "error";
      meta?: Record<string, unknown> | null; }
  | { t: "version.done";
      id; ts; versionId; chatId?; runId;
      durationMs: number; previewUrl?: string | null; };
```

### Discriminator

All events use `t` as the discriminator. Base fields (`id`, `ts`,
`versionId`, `runId`, `chatId?`) are supplied by `emit()` when
callers omit them.

### Ownership — writers per event

| Event | Primary emit site | Notes |
|---|---|---|
| `version.started` | `finalize-version/runner.ts` | First pass only (`repairPassIndex === 0`) |
| `version.stream.tokenProgress` | *reserved* | Phase-1 streaming adapter will emit this |
| `version.autofix.result` | *reserved* | Autofix-statistiken is its own struct and will emit through the bus unchanged |
| `version.syntax.pass` | *reserved* | Syntax validator will emit this |
| `version.preflight` | `finalize-version/runner.ts` | Replaces legacy `preflight.summary` devLog entry |
| `version.verifier.done` | `generation-stream-post-finalize.ts` (`"skipped"`), `gen/verify/server-verify.ts` (`"passed"`/`"failed"`) | |
| `version.repair.started` | `finalize-version/runner.ts` (`repairPassIndex > 0`) | Stamps new `repair-N` runId |
| `version.repair.passIndex` | `finalize-version/runner.ts` | |
| `version.saved` | *reserved* | Wire-up after cut-over stabilises |
| `version.build.error` | `gen/verify/server-verify.ts` (`triggerBuildErrorRepair`), `emitVersionErrorLogs()` wrapper | |
| `version.done` | *reserved* (current: legacy `site.done`) | Cut-over lands with the next OMTAG wave |

## Projection — `selectVersionStatus(events)`

```ts
interface VersionStatus {
  runId: string | null;
  phase:
    | "idle"
    | "streaming"
    | "autofixing"
    | "validating"
    | "preflighting"
    | "verifying"
    | "repairing"
    | "blocked"
    | "done"
    | "failed";
  previewBlocked: boolean;
  verificationBlocked: boolean;
  repairPassIndex: number;
  lastBuildError: { stage; message; failureCode } | null;
  eventCount: number;
  done: boolean;
  verifierOutcome: "passed" | "failed" | "skipped" | null;
}
```

Evaluation order inside `selectVersionStatus`:

1. Empty stream → `phase: "idle"`.
2. `version.done` seen → `phase: "done"` (blocker flags still reported).
3. Last signal is a `version.build.error` → `phase: "failed"`,
   `lastBuildError` populated.
4. Last signal is a repair event and no terminator → `phase: "repairing"`.
5. Verifier outcome is `"failed"` and verification is blocked →
   `phase: "failed"`.
6. Preflight/verifier blockers set → `phase: "blocked"`.
7. Otherwise fall through to the most recent lifecycle signal.

A clean `version.saved` (both blocker flags false) resets
`lastBuildError` and `verifierOutcome` so stale repair-pass state
doesn't leak forward — this is the flush-fix for the old repair-
continuation bug.

## Subscribers (legacy compat)

| Subscriber | File | Behaviour |
|---|---|---|
| devLog mirror | `event-bus-subscribers.ts` | Re-emits legacy `preflight.summary` / `server-verify.policy` / `preview-preflight.error` devLog rows so `generation-log-writer.ts` keeps producing `timeline.ndjson` + `summary.md` |
| DB error-log sink | `event-bus-error-log-sink.ts` | Persists `version.build.error` events as `engine_version_error_logs` rows via the existing `createEngineVersionErrorLogs` service |

Both subscribers auto-install on module import and are idempotent.
Tests can opt out via `__resetSubscribersForTests()` /
`__resetErrorLogSinkForTests()`.

## Call-site migration status

| Writer | Status |
|---|---|
| `preflight.summary` devLog entry | **migrated** — `runner.ts` emits `version.preflight`; devLog-mirror subscriber reproduces the legacy entry for backoffice |
| `server-verify.policy` devLog entry | partial — policy emits `version.verifier.done` with `outcome: "skipped"` when the verifier won't run; the legacy devLog entry is retained side-by-side because the backoffice filters on this exact type |
| `server-verify.ts` quality-gate result log | **migrated** — emits `version.verifier.done` with `passed`/`failed` + findings |
| `triggerBuildErrorRepair` (preview-VM build error) | **migrated** — emits `version.build.error` before repair loop starts |
| Client-derived `versionStatus` (legacy `resolveEngineVersionDisplayStatus`) | projection is available as `selectVersionStatus(events)`; the current builder UI still reads DB-row flags. A follow-up wave will flip the UI over without a schema change |

## Contract invariants

- **Append-only.** `emit()` is the only writer. Events are immutable
  once appended; no update/delete operations exist. The bus is safe to
  consume from multiple readers without locking.
- **Single writer.** Callers must not write `preflight.summary`,
  `server_verify_result`-equivalents, or `engine_version_error_logs`
  rows outside of the bus path. The grep acceptance in
  `OMTAG/06-unified-status-eventbus.md` enforces this.
- **No DB migration.** Persistence is filesystem-only under
  `data/runs/`. Existing DB tables remain owned by their existing
  code paths but are reached via bus subscribers.
- **No env toggles.** The migration is a cut-over — there is no
  shadow mode and no fallback path. See OMTAG-06 "Får INTE göras".
- **Autofix stats pass through unchanged.** Autofix statistics are
  their own struct and traverse the bus (via
  `version.autofix.result`) without restructuring.

## References

- `OMTAG/06-unified-status-eventbus.md` — the parent plan doc
- `docs/schemas/orchestration-signal-contract.md` — upstream signal
  layers (prompt assist, scaffold match, route plan, BuildSpec, …)
- `docs/architecture/llm-signal-flow.md` — narrative of the full
  LLM pipeline
