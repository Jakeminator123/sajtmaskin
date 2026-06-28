/**
 * OpenClaw debug-mode bug-hunt engine (Mode B — unsupervised autopilot).
 *
 * Drives the REAL generation/repair pipeline through the engine API (the same
 * `/stream` + `/repair` endpoints the builder UI uses), forces a real build /
 * preview check (closing the F2 gap where the quality gate only typechecks),
 * reads the resulting pipeline findings, and writes structured `oc_debug_findings`.
 *
 * Design: the orchestration, budget/loop control, kill-switch and the
 * engine-log → debug-finding mapping are PURE and dependency-injected so they
 * are unit-testable without a live server or DB. The runner (scripts/openclaw/
 * bug-hunt.mjs) wires the real HTTP engine client + DB findings sink.
 *
 * Hard safety: a bounded budget (prompts, repairs/version, wall-clock, findings)
 * plus an injectable kill-switch (`shouldStop`) so an autonomous run can never
 * loop forever or run away on cost. Mode B should run under a dedicated debug
 * tenant so real user projects are never polluted.
 */

import type {
  DebugFindingPayload,
  DebugFindingSeverity,
} from "@/lib/db/services/debug-findings";

// ===========================================================================
// Budget + caps
// ===========================================================================

export interface BugHuntBudget {
  /** Max prompts (init + follow-ups) across the whole run. */
  maxPrompts: number;
  /** Max repair passes the harness will trigger per version. */
  maxRepairsPerVersion: number;
  /** Wall-clock ceiling for the whole run (ms). */
  maxTotalMs: number;
  /** Stop writing once this many findings have been recorded. */
  maxFindings: number;
}

export const DEFAULT_BUG_HUNT_BUDGET: BugHuntBudget = {
  maxPrompts: 12,
  maxRepairsPerVersion: 2,
  maxTotalMs: 30 * 60_000,
  maxFindings: 500,
};

/**
 * Server-owned hard ceilings. Even an authorized caller cannot exceed these via
 * a request-body budget override — they cap autonomous cost/runaway loops.
 */
export const BUG_HUNT_BUDGET_CEILING: BugHuntBudget = {
  maxPrompts: 30,
  maxRepairsPerVersion: 5,
  maxTotalMs: 2 * 60 * 60_000,
  maxFindings: 2_000,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Merge a (possibly client-supplied) partial budget onto the defaults and clamp
 * every field to [1, ceiling]. Pure + total so it is unit-testable.
 */
export function clampBugHuntBudget(partial?: Partial<BugHuntBudget>): BugHuntBudget {
  return {
    maxPrompts: clampInt(partial?.maxPrompts, DEFAULT_BUG_HUNT_BUDGET.maxPrompts, 1, BUG_HUNT_BUDGET_CEILING.maxPrompts),
    maxRepairsPerVersion: clampInt(
      partial?.maxRepairsPerVersion,
      DEFAULT_BUG_HUNT_BUDGET.maxRepairsPerVersion,
      0,
      BUG_HUNT_BUDGET_CEILING.maxRepairsPerVersion,
    ),
    maxTotalMs: clampInt(partial?.maxTotalMs, DEFAULT_BUG_HUNT_BUDGET.maxTotalMs, 1_000, BUG_HUNT_BUDGET_CEILING.maxTotalMs),
    maxFindings: clampInt(partial?.maxFindings, DEFAULT_BUG_HUNT_BUDGET.maxFindings, 1, BUG_HUNT_BUDGET_CEILING.maxFindings),
  };
}

export type BugHuntStopReason =
  | "completed"
  | "kill_switch"
  | "budget_prompts"
  | "budget_time"
  | "budget_findings";

export interface BugHuntBudgetState {
  promptsUsed: number;
  findingsWritten: number;
  startedAtMs: number;
  repairsByVersion: Record<string, number>;
}

export interface BugHuntBudgetTracker {
  state: BugHuntBudgetState;
  canSendPrompt(): boolean;
  canRepair(versionId: string): boolean;
  isExpired(nowMs: number): boolean;
  isFindingsExhausted(): boolean;
  recordPrompt(): void;
  recordRepair(versionId: string): void;
  recordFindings(count: number): void;
}

/** Create a pure, mutable budget tracker. */
export function createBudgetTracker(
  budget: BugHuntBudget,
  startedAtMs: number,
): BugHuntBudgetTracker {
  const state: BugHuntBudgetState = {
    promptsUsed: 0,
    findingsWritten: 0,
    startedAtMs,
    repairsByVersion: {},
  };
  return {
    state,
    canSendPrompt() {
      return state.promptsUsed < budget.maxPrompts;
    },
    canRepair(versionId: string) {
      return (state.repairsByVersion[versionId] ?? 0) < budget.maxRepairsPerVersion;
    },
    isExpired(nowMs: number) {
      return nowMs - state.startedAtMs >= budget.maxTotalMs;
    },
    isFindingsExhausted() {
      return state.findingsWritten >= budget.maxFindings;
    },
    recordPrompt() {
      state.promptsUsed += 1;
    },
    recordRepair(versionId: string) {
      state.repairsByVersion[versionId] = (state.repairsByVersion[versionId] ?? 0) + 1;
    },
    recordFindings(count: number) {
      state.findingsWritten += Math.max(0, count);
    },
  };
}

// ===========================================================================
// Engine client contract (injected; HTTP impl lives in the runner)
// ===========================================================================

export interface EngineVersionRef {
  chatId: string;
  versionId: string;
}

/** True when both ids resolved — required before polling/building a version. */
function isResolvedRef(ref: EngineVersionRef): boolean {
  return Boolean(ref.chatId && ref.versionId);
}

/** A failed quality-gate check, in the shape the repair endpoint expects. */
export interface EngineRepairGateFailure {
  check: "typecheck" | "build" | "lint";
  exitCode: number;
  output: string;
  durationMs?: number | null;
}

export interface EngineBuildResult {
  result: "passed" | "failed" | "unknown";
  /** Optional error manifest (array of { file, diagnostics }) when build failed. */
  manifest?: unknown;
  detail?: string;
  /** Failed checks from the forced gate — carried into repair as actionable context. */
  qualityGate?: EngineRepairGateFailure[];
  firstFailureCheck?: string | null;
}

/** Actionable context passed into a repair so the repair loop has something to fix. */
export interface EngineRepairContext {
  qualityGate?: EngineRepairGateFailure[];
  qualityGateMeta?: { firstFailureCheck?: string | null };
}

export interface EngineRepairResult {
  outcome: string;
  versionId: string;
}

export interface EngineErrorLogRow {
  level: string;
  category: string | null;
  message: string;
  meta: unknown | null;
  createdAt?: string;
}

export interface BugHuntEngineClient {
  createChat(input: { prompt: string }): Promise<EngineVersionRef>;
  sendFollowUp(input: {
    chatId: string;
    prompt: string;
    baseVersionId?: string;
  }): Promise<EngineVersionRef>;
  /**
   * Block until the version leaves a transient phase. `settled` is false when the
   * poll budget was exhausted while still transient, so the caller can avoid
   * gating a still-generating version.
   */
  waitForVersionSettled(ref: EngineVersionRef): Promise<{ state: string; settled: boolean }>;
  /** Force a real build / preview check and return whether it passed. */
  forceBuild(ref: EngineVersionRef): Promise<EngineBuildResult>;
  repair(ref: EngineVersionRef, context?: EngineRepairContext): Promise<EngineRepairResult>;
  getErrorLogs(versionId: string): Promise<EngineErrorLogRow[]>;
}

// ===========================================================================
// Scenarios
// ===========================================================================

export interface BugHuntScenario {
  id: string;
  /** Human label, e.g. "Jakobs Biljard – 2-page forum site". */
  label?: string;
  /** Initial prompt that creates the chat. */
  prompt: string;
  /** Optional follow-up prompts run in order after the init version settles. */
  followUps?: string[];
}

// ===========================================================================
// Finding mapping (pure)
// ===========================================================================

function normalizeSeverity(level: string): DebugFindingSeverity | null {
  if (level === "warning" || level === "warn") return "warning";
  if (level === "error" || level === "fatal") return "error";
  if (level === "info") return "info";
  return null;
}

interface ManifestDiagnostic {
  file: string | null;
  line: number | null;
  message: string | null;
}

function extractFirstManifestDiagnostic(meta: unknown): ManifestDiagnostic | null {
  if (!meta || typeof meta !== "object") return null;
  const manifest = (meta as Record<string, unknown>).errorManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) return null;
  for (const entry of manifest) {
    if (!entry || typeof entry !== "object") continue;
    const file = (entry as Record<string, unknown>).file;
    const diagnostics = (entry as Record<string, unknown>).diagnostics;
    if (Array.isArray(diagnostics) && diagnostics.length > 0) {
      const d = diagnostics[0] as Record<string, unknown>;
      return {
        file: typeof file === "string" ? file : null,
        line: typeof d.line === "number" ? d.line : null,
        message: typeof d.message === "string" ? d.message : null,
      };
    }
    if (typeof file === "string") {
      return { file, line: null, message: null };
    }
  }
  return null;
}

export interface MapFindingsContext {
  runId: string;
  scenario: string;
  chatId: string;
  versionId: string;
  buildResult: string;
  repairOutcome?: string | null;
}

const FINDING_MESSAGE_MAX = 500;

/**
 * Map raw engine error-log rows to debug-finding payloads. Keeps only bug-level
 * rows (warning/error), carries category/file/line, and tags every finding with
 * the run/scenario/build context. Pure + total.
 */
export function mapEngineFindingsToDebugFindings(
  rows: EngineErrorLogRow[],
  ctx: MapFindingsContext,
): DebugFindingPayload[] {
  const out: DebugFindingPayload[] = [];
  for (const row of rows) {
    const severity = normalizeSeverity(row.level);
    if (!severity || severity === "info") continue;
    const diag = extractFirstManifestDiagnostic(row.meta);
    out.push({
      runId: ctx.runId,
      chatId: ctx.chatId,
      versionId: ctx.versionId,
      scenario: ctx.scenario,
      severity,
      category: row.category ?? null,
      file: diag?.file ?? null,
      line: diag?.line ?? null,
      message:
        typeof row.message === "string"
          ? row.message.slice(0, FINDING_MESSAGE_MAX)
          : "",
      buildResult: ctx.buildResult,
      repairOutcome: ctx.repairOutcome ?? null,
      meta: (row.meta as Record<string, unknown> | null) ?? null,
    });
  }
  return out;
}

/**
 * Synthetic finding summarizing the build outcome the harness forced. Only an
 * explicit `passed` is green (info); `failed` is an error; anything else
 * (`unknown` — gate unavailable/timeout/HTTP error) is a warning, never a
 * false-green pass.
 */
export function buildOutcomeFinding(
  ctx: MapFindingsContext,
): DebugFindingPayload {
  const passed = ctx.buildResult === "passed";
  const failed = ctx.buildResult === "failed";
  const severity: DebugFindingSeverity = passed ? "info" : failed ? "error" : "warning";
  const message = passed
    ? `Forced build passed for scenario "${ctx.scenario}"`
    : failed
      ? `Forced build FAILED for scenario "${ctx.scenario}"`
      : `Forced build could NOT be verified (result: ${ctx.buildResult}) for scenario "${ctx.scenario}"`;
  return {
    runId: ctx.runId,
    chatId: ctx.chatId,
    versionId: ctx.versionId,
    scenario: ctx.scenario,
    severity,
    category: "oc-debug:build",
    message,
    buildResult: ctx.buildResult,
    repairOutcome: ctx.repairOutcome ?? null,
    meta: null,
  };
}

// ===========================================================================
// Orchestration
// ===========================================================================

export interface BugHuntDeps {
  client: BugHuntEngineClient;
  /** Persist findings (defaults to the DB service in the runner). */
  writeFindings: (findings: DebugFindingPayload[]) => Promise<unknown>;
  /** Injectable kill-switch checked before every prompt + repair. */
  shouldStop?: () => boolean | Promise<boolean>;
  /** Clock (ms). Injected for deterministic budget tests. */
  now?: () => number;
  /** Structured progress log (best-effort). */
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

export interface BugHuntOptions {
  runId: string;
  scenarios: BugHuntScenario[];
  budget?: BugHuntBudget;
}

export interface BugHuntRunResult {
  runId: string;
  scenariosRun: number;
  promptsUsed: number;
  findingsWritten: number;
  stopReason: BugHuntStopReason;
}

async function persistFindings(
  deps: BugHuntDeps,
  tracker: BugHuntBudgetTracker,
  findings: DebugFindingPayload[],
): Promise<void> {
  if (findings.length === 0) return;
  await deps.writeFindings(findings);
  tracker.recordFindings(findings.length);
}

/**
 * Process one settled version: force a real build, optionally repair on failure
 * (bounded), and persist the findings. Returns the final build result.
 */
async function processVersion(
  deps: BugHuntDeps,
  tracker: BugHuntBudgetTracker,
  runId: string,
  scenario: BugHuntScenario,
  ref: EngineVersionRef,
): Promise<void> {
  const settle = await deps.client.waitForVersionSettled(ref);
  if (!settle.settled) {
    // The version never left a transient phase within the settle budget. Do NOT
    // force a gate (it would record a misleading pass/fail for a still-
    // generating version, Bugbot); record an explicit unverified warning.
    const unsettledCtx: MapFindingsContext = {
      runId,
      scenario: scenario.id,
      chatId: ref.chatId,
      versionId: ref.versionId,
      buildResult: "unknown",
      repairOutcome: null,
    };
    await persistFindings(deps, tracker, [buildOutcomeFinding(unsettledCtx)]);
    deps.log?.("bug_hunt_version_unsettled", {
      versionId: ref.versionId,
      state: settle.state,
    });
    return;
  }
  let build = await deps.client.forceBuild(ref);
  let repairOutcome: string | null = null;

  if (build.result === "failed" && tracker.canRepair(ref.versionId)) {
    deps.log?.("bug_hunt_repair", { versionId: ref.versionId });
    tracker.recordRepair(ref.versionId);
    // Carry the failed quality-gate checks into the repair so the repair loop has
    // actionable context (otherwise it can no-op on non-syntax build/lint fails).
    const repair = await deps.client.repair(ref, {
      qualityGate: build.qualityGate,
      qualityGateMeta: { firstFailureCheck: build.firstFailureCheck ?? null },
    });
    repairOutcome = repair.outcome;
    const repairedRef: EngineVersionRef = {
      chatId: ref.chatId,
      versionId: repair.versionId || ref.versionId,
    };
    await deps.client.waitForVersionSettled(repairedRef);
    build = await deps.client.forceBuild(repairedRef);
    ref = repairedRef;
  }

  const rows = await deps.client.getErrorLogs(ref.versionId);
  const ctx: MapFindingsContext = {
    runId,
    scenario: scenario.id,
    chatId: ref.chatId,
    versionId: ref.versionId,
    buildResult: build.result,
    repairOutcome,
  };
  const findings = [
    buildOutcomeFinding(ctx),
    ...mapEngineFindingsToDebugFindings(rows, ctx),
  ];
  await persistFindings(deps, tracker, findings);
  deps.log?.("bug_hunt_version_done", {
    versionId: ref.versionId,
    build: build.result,
    findings: findings.length,
  });
}

/** Run a single scenario (init + bounded follow-ups). */
export async function runBugHuntScenario(
  deps: BugHuntDeps,
  tracker: BugHuntBudgetTracker,
  runId: string,
  scenario: BugHuntScenario,
): Promise<BugHuntStopReason | null> {
  const now = deps.now ?? Date.now;

  if (await Promise.resolve(deps.shouldStop?.() ?? false)) return "kill_switch";
  if (tracker.isExpired(now())) return "budget_time";
  if (tracker.isFindingsExhausted()) return "budget_findings";
  if (!tracker.canSendPrompt()) return "budget_prompts";

  tracker.recordPrompt();
  deps.log?.("bug_hunt_scenario_init", { scenario: scenario.id });
  const initRef = await deps.client.createChat({ prompt: scenario.prompt });
  // Fail fast on an unresolved ref (Bugbot): if SSE id extraction AND the
  // versions-list fallback both failed, an empty chatId/versionId would make
  // processVersion poll/build/write findings against an empty id — misleading
  // results instead of a clean stop.
  if (!isResolvedRef(initRef)) {
    deps.log?.("bug_hunt_unresolved_ref", {
      scenario: scenario.id,
      stage: "init",
      chatId: initRef.chatId,
      versionId: initRef.versionId,
    });
    return null;
  }
  await processVersion(deps, tracker, runId, scenario, initRef);

  let currentRef = initRef;
  for (const followUp of scenario.followUps ?? []) {
    if (await Promise.resolve(deps.shouldStop?.() ?? false)) return "kill_switch";
    if (tracker.isExpired(now())) return "budget_time";
    if (tracker.isFindingsExhausted()) return "budget_findings";
    if (!tracker.canSendPrompt()) return "budget_prompts";

    tracker.recordPrompt();
    deps.log?.("bug_hunt_followup", { scenario: scenario.id });
    const ref = await deps.client.sendFollowUp({
      chatId: currentRef.chatId,
      prompt: followUp,
      baseVersionId: currentRef.versionId,
    });
    // A follow-up that can't resolve its version can't be chained — stop the
    // chain instead of processing an empty ref.
    if (!isResolvedRef(ref)) {
      deps.log?.("bug_hunt_unresolved_ref", {
        scenario: scenario.id,
        stage: "followup",
        chatId: ref.chatId,
        versionId: ref.versionId,
      });
      break;
    }
    await processVersion(deps, tracker, runId, scenario, ref);
    currentRef = ref;
  }

  return null;
}

/** Run the full bug-hunt across all scenarios under one bounded budget. */
export async function runBugHunt(
  deps: BugHuntDeps,
  options: BugHuntOptions,
): Promise<BugHuntRunResult> {
  const budget = options.budget ?? DEFAULT_BUG_HUNT_BUDGET;
  const now = deps.now ?? Date.now;
  const tracker = createBudgetTracker(budget, now());

  let stopReason: BugHuntStopReason = "completed";
  let scenariosRun = 0;

  for (const scenario of options.scenarios) {
    const reason = await runBugHuntScenario(deps, tracker, options.runId, scenario);
    scenariosRun += 1;
    if (reason) {
      stopReason = reason;
      break;
    }
  }

  deps.log?.("bug_hunt_done", {
    runId: options.runId,
    stopReason,
    promptsUsed: tracker.state.promptsUsed,
    findingsWritten: tracker.state.findingsWritten,
  });

  return {
    runId: options.runId,
    scenariosRun,
    promptsUsed: tracker.state.promptsUsed,
    findingsWritten: tracker.state.findingsWritten,
    stopReason,
  };
}
