/**
 * OMTAG-06 — Event bus shape + canonical event types.
 *
 * The event taxonomy maps 1:1 against `signal-ownership`-relevant
 * lifecycle moments for an `engine_versions` row:
 *
 *   version.started        → run metadata established (stream begins)
 *   version.stream.tokenProgress → LLM token flow (observability only)
 *   version.autofix.result → deterministic autofix summary
 *   version.syntax.pass    → syntax-validator pass outcome
 *   version.preflight      → preflight-phase summary
 *                            (filesChecked, errors, warnings, blocks)
 *   version.verifier.done  → server-verify / quality-gate outcome
 *   version.repair.started → a repair pass was initiated (runId changes)
 *   version.repair.passIndex → explicit repair-pass index marker
 *   version.saved          → assistant+version row persisted
 *   version.build.error    → build-error surfaced by preview-VM / gate
 *   version.done           → generation fully terminated
 *
 * Discriminator field: `t`. The union covers the minimum 10-event set
 * required by the OMTAG-06 acceptance criteria (+1: `repair.passIndex`).
 *
 * Note: autofix statistics, dossier registry and preview-session
 * telemetry remain their own structs — they traverse the bus through
 * specific events but don't dictate additional event types here.
 */

export type EngineEventType =
  | "version.started"
  | "version.stream.tokenProgress"
  | "version.autofix.result"
  | "version.syntax.pass"
  | "version.preflight"
  | "version.verifier.done"
  | "version.repair.started"
  | "version.repair.passIndex"
  | "version.saved"
  | "version.build.error"
  | "version.done";

interface EngineEventBase {
  id: string;
  ts: string;
  versionId: string;
  /**
   * Scopes each event to a run-folder on disk. `DEFAULT_RUN_ID`
   * (`"root"`) is the bootstrap run; repair passes mint new runIds so
   * their events land in sibling folders, and the per-version
   * `.runs.json` knows how to fold them back together.
   */
  runId: string;
  /** Optional chat grouping — many UIs key off `chatId`, not version. */
  chatId?: string | null;
}

export interface VersionStartedEvent extends EngineEventBase {
  t: "version.started";
  generationKind?: "create" | "followup" | "plan" | null;
  model?: string | null;
  scaffoldId?: string | null;
}

export interface VersionStreamTokenProgressEvent extends EngineEventBase {
  t: "version.stream.tokenProgress";
  phase: "reasoning" | "output" | "ending";
  chars?: number;
}

export interface VersionAutofixResultEvent extends EngineEventBase {
  t: "version.autofix.result";
  fixes: number;
  warnings: number;
  dependencies?: number;
  heavyLoad?: boolean;
}

export interface VersionSyntaxPassEvent extends EngineEventBase {
  t: "version.syntax.pass";
  pass: number;
  errors: number;
  phase?: "validating" | "fixed" | "invalid" | "gave_up" | "ok";
}

export interface VersionPreflightEvent extends EngineEventBase {
  t: "version.preflight";
  filesChecked: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  previewBlocked: boolean;
  verificationBlocked: boolean;
  previewBlockingReason?: string | null;
}

export interface VersionVerifierDoneEvent extends EngineEventBase {
  t: "version.verifier.done";
  blocked: boolean;
  findings?: Array<{ id: string; detail: string }>;
  /** `skipped` when policy elected not to run (e.g. design-only). */
  outcome: "passed" | "failed" | "skipped";
  reason?: string | null;
}

export interface VersionRepairStartedEvent extends EngineEventBase {
  t: "version.repair.started";
  reason: string;
  trigger: "server-verify" | "build-error" | "manual" | "accept-repair";
}

export interface VersionRepairPassIndexEvent extends EngineEventBase {
  t: "version.repair.passIndex";
  passIndex: number;
}

export interface VersionSavedEvent extends EngineEventBase {
  t: "version.saved";
  previewBlocked: boolean;
  verificationBlocked: boolean;
  messageId?: string;
}

export interface VersionBuildErrorEvent extends EngineEventBase {
  t: "version.build.error";
  error: {
    stage: string;
    message: string;
    failureCode?: string | null;
  };
  /** Category mapping into existing `engine_version_error_logs.category` for subscribers that persist. */
  category?: string;
  level?: "info" | "warning" | "error";
  /** Opaque payload passed through to the DB subscriber unchanged. */
  meta?: Record<string, unknown> | null;
}

export interface VersionDoneEvent extends EngineEventBase {
  t: "version.done";
  durationMs: number;
  previewUrl?: string | null;
}

export type EngineEvent =
  | VersionStartedEvent
  | VersionStreamTokenProgressEvent
  | VersionAutofixResultEvent
  | VersionSyntaxPassEvent
  | VersionPreflightEvent
  | VersionVerifierDoneEvent
  | VersionRepairStartedEvent
  | VersionRepairPassIndexEvent
  | VersionSavedEvent
  | VersionBuildErrorEvent
  | VersionDoneEvent;

/**
 * Emit-shaped variant where `id`, `ts`, and `runId` are optional because
 * the bus fills them in.
 */
export type EngineEventInput = {
  [E in EngineEvent as E["t"]]: Omit<E, "id" | "ts" | "runId"> & {
    id?: string;
    ts?: string;
    runId?: string;
  };
}[EngineEventType];

export type EventBusSubscriber = (event: EngineEvent) => void;

/** Entry written to `data/runs/<versionId>/.runs.json`. */
export interface RunIndexEntry {
  runId: string;
  versionId: string;
  startedAt: string;
  reason: string | null;
}

// ── VersionStatus projection output ───────────────────────────────────

export type VersionStatusPhase =
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

export interface VersionStatus {
  /** Last seen `runId` — `null` when the stream is empty. */
  runId: string | null;
  /** High-level UI state, projected from the event stream. */
  phase: VersionStatusPhase;
  /** Preflight has reported preview blockers. */
  previewBlocked: boolean;
  /** Preflight or verifier has reported verification blockers. */
  verificationBlocked: boolean;
  /** The most recent repair pass index seen (0 when never repaired). */
  repairPassIndex: number;
  /** Last build-error event, if any — cleared by a subsequent clean pass. */
  lastBuildError: VersionBuildErrorEvent["error"] | null;
  /** Number of events observed (for debugging / flush-bug detection). */
  eventCount: number;
  /** Final `version.done` was seen. */
  done: boolean;
  /** Verifier outcome if one has landed. */
  verifierOutcome: VersionVerifierDoneEvent["outcome"] | null;
}
