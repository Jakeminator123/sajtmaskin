/**
 * Kontraktslås för kvalitetsgrinden (`POST /api/engine/chats/[chatId]/quality-gate`
 * och QG-grenen i `runVersionPostchecks`).
 *
 * Varje utfallsväg låser fyra saker:
 *   1. HTTP-status
 *   2. HTTP-body, byte för byte (fält, värden OCH fältordning som JSON)
 *   3. kedjans `VersionVerificationOutcome`
 *   4. sidoeffekternas ordning (tillståndsskrivningar, loggar, bus-händelser)
 *
 * Förväntningarna skrevs mot koden FÖRE det typade utfallet infördes och får
 * inte ändras av en refaktorering. Bara `runGate` (hur status/body/kedjeutfall
 * tas fram ur körningen) hör till implementationen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  trace: [] as string[],
  logs: [] as Array<Record<string, unknown>>,
  bus: [] as Array<Record<string, unknown>>,
  dbConfigured: true,
}));

vi.mock("@/lib/db/client", () => ({
  get dbConfigured() {
    return h.dbConfigured;
  },
  db: {},
  pool: null,
}));
vi.mock("@/lib/logging/event-bus-subscribers", () => ({}));
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({}));
vi.mock("@/lib/logging/event-bus", () => ({
  emit: (event: Record<string, unknown>) => {
    h.bus.push(event);
    h.trace.push(`bus:${String(event.t)}:${String(event.kind ?? "")}`);
  },
}));
vi.mock("@/lib/db/promote-guard", () => ({ assertPromoteAllowed: vi.fn() }));

import * as repo from "@/lib/db/chat-repository-pg";
import * as promoteGuard from "@/lib/db/promote-guard";
import * as telemetry from "@/lib/db/services/generation-telemetry";
import * as errors from "@/lib/db/services/version-errors";
import * as exported from "@/lib/gen/export/build-exportable-project";
import * as missingEnvLog from "@/lib/integrations/log-tier3-missing-env";
import * as gate from "../preview-quality-gate";
import { INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS } from "../quality-gate-checks";
import * as tier3 from "../tier3-readiness";
import * as f3 from "./f3-readiness";
import * as lease from "./lease";
import { runVersionQualityGateUnderLease } from "./verify-run";

type GateParams = Parameters<typeof runVersionQualityGateUnderLease>[0];

/** Enda implementationsberoende delen: status/body till klienten + kedjans utfall. */
async function runGate(params: GateParams) {
  const { body, status, ...verification } = await runVersionQualityGateUnderLease(params);
  return { status, body, verification };
}

const NOW = 1_800_000_000_000;
const STARTED = "2026-11-11T10:00:00.000Z";
const FINISHED = "2026-11-11T10:00:42.000Z";
const HINT = gate.QUALITY_GATE_SETUP_HINT;
const SEMANTIC_TSC = "app/page.tsx(12,9): error TS2322: Type 'string' is not assignable to type 'number'.";
const F3_LANE = `lane:${INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS.join("+")}`;
const F2_PRELUDE = ["latest?", "export", "verifying@run-1", "lane:typecheck", "latest?"];
const F3_PRELUDE = ["f3-context", "f3-readiness", "latest?", "export", "verifying@run-1", F3_LANE, "latest?"];

const PROMOTE_PASSED = "promote@run-1:Automatic verification passed.";
const PROMOTE_ADVISORY =
  "promote@run-1:Designläge: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande).";
const LOG_PASSED = "log:info:preflight:quality-gate:Automatic quality gate passed.";
const LOG_PASSED_ADVISORY = "log:warning:preflight:quality-gate:Automatic quality gate passed with advisory findings.";
const LOG_FAILED = "log:error:preflight:quality-gate:Automatic quality gate failed.";
const LOG_DESIGN_ADVISORY =
  "log:warning:preflight:quality-gate:Designläge: typecheck-varning (advisory) — previewen renderar, versionen promotas.";
const LOG_TYPECHECK_ADVISORY = "log:warning:quality-gate:typecheck-advisory:typecheck advisory (exit 2) — ej blockerande";
const LOG_LINT_ADVISORY = "log:warning:quality-gate:lint-advisory:lint advisory (exit 0) — ej blockerande";
const LOG_GUARD_UNAVAILABLE =
  "log:warning:quality-gate:promote-guard-unavailable:Build checks passed but the promotion guard could not verify the finalize signal; promotion deferred (retryable).";
const LOG_LATE_SUPERSEDED =
  "log:warning:quality-gate:superseded:Quality gate finished after a newer version was created; skipping state mutation.";

const files = [{ path: "app/page.tsx", content: "export default function Page(){return null}", language: "tsx" as const }];

function snapshot(over: Record<string, unknown> = {}) {
  return {
    files,
    filesJson: JSON.stringify(files),
    filesRevision: "rev-1",
    lifecycleStage: "design",
    parentVersionId: null,
    editKind: null,
    verificationState: "pending",
    releaseState: "draft",
    verificationSummary: null,
    ...over,
  };
}
const f3Snapshot = (over: Record<string, unknown> = {}) =>
  snapshot({ lifecycleStage: "integrations", parentVersionId: "ver-f2", ...over });

function gateParams(over: Omit<Partial<GateParams>, "snapshot"> & { snapshot?: unknown } = {}): GateParams {
  return { chatId: "chat-1", versionId: "ver-1", holderRunId: "run-1", snapshot: snapshot(), ...over } as GateParams;
}

type Check = gate.QualityGateCheckResult;
const ok = (check: string, extra: Partial<Check> = {}): Check => ({
  check,
  passed: true,
  exitCode: 0,
  output: "",
  durationMs: 5,
  ...extra,
});
const bad = (check: string, output: string, extra: Partial<Check> = {}): Check => ({
  check,
  passed: false,
  exitCode: 2,
  output,
  durationMs: 7,
  ...extra,
});
const lintWarning = () => ok("lint", { advisory: true, warningCount: 2, output: "2 warnings" });

function laneReturns(results: Check[]) {
  vi.mocked(gate.runQualityGateOnExportable).mockImplementation(async (input) => {
    h.trace.push(`lane:${(input.checks ?? []).join("+")}`);
    return {
      results,
      verifyLaneDurationMs: 42,
      firstFailureCheck: results.find((result) => !result.passed)?.check ?? null,
      jobStartedAt: STARTED,
      jobFinishedAt: FINISHED,
    };
  });
}

/** Gatens mätvärden så som de ligger först i svaret. */
function evidence(passed: boolean, checks: Check[]) {
  return {
    passed,
    checks,
    verifyLaneDurationMs: 42,
    firstFailureCheck: checks.find((check) => !check.passed)?.check ?? null,
    jobStartedAt: STARTED,
    jobFinishedAt: FINISHED,
  };
}

const stopped = (reason: string, retryable: boolean, vmGatePassed = false) => ({
  kind: "stop",
  reason,
  retryable,
  vmGatePassed,
  promoted: false,
});
const continued = (vmGatePassed: boolean, advisory: boolean) => ({
  kind: "continue",
  filesRevision: "rev-1",
  vmGatePassed,
  promoted: true,
  advisory,
});
const SUPERSEDED = { kind: "superseded", cause: "newer_version", forceBuildCheck: false, contextRetryUsed: false };

type Expected = { status: number; body: Record<string, unknown>; verification: Record<string, unknown>; trace: string[] };

function expectContract(actual: Awaited<ReturnType<typeof runGate>>, expected: Expected) {
  expect(actual.status).toBe(expected.status);
  // Samma jämförelse som klienten gör: det som faktiskt går över tråden.
  expect(JSON.parse(JSON.stringify(actual.body))).toEqual(expected.body);
  expect(JSON.stringify(actual.body)).toBe(JSON.stringify(expected.body));
  expect(actual.verification).toStrictEqual(expected.verification);
  expect(h.trace).toEqual(expected.trace);
}

function guardReturns(...decisions: unknown[]) {
  const mock = vi.mocked(promoteGuard.assertPromoteAllowed);
  for (const decision of decisions) {
    mock.mockImplementationOnce(async () => {
      h.trace.push("guard");
      return decision as never;
    });
  }
}

beforeEach(() => {
  h.trace.length = 0;
  h.logs.length = 0;
  h.bus.length = 0;
  h.dbConfigured = true;
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  for (const level of ["warn", "info", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});

  vi.spyOn(lease, "isLatestVersionForChat").mockImplementation(async () => {
    h.trace.push("latest?");
    return true;
  });
  vi.spyOn(repo, "markVersionVerifying").mockImplementation(async (_id, _summary, runId) => {
    h.trace.push(`verifying@${runId}`);
    return { id: "ver-1" } as never;
  });
  vi.spyOn(repo, "resetVersionVerificationToPending").mockImplementation(async (_id, _summary, runId) => {
    h.trace.push(`pending@${runId}`);
    return { id: "ver-1" } as never;
  });
  vi.spyOn(repo, "failVersionVerification").mockImplementation(async (_id, summary, runId) => {
    h.trace.push(`fail@${runId}:${summary}`);
    return { id: "ver-1" } as never;
  });
  vi.spyOn(repo, "promoteVersion").mockImplementation(async (_id, summary, runId) => {
    h.trace.push(`promote@${runId}:${summary}`);
    return { id: "ver-1" } as never;
  });
  vi.spyOn(repo, "markVersionSupersededByRepair").mockImplementation(async (_id, _files, runId) => {
    h.trace.push(`superseded@${runId}`);
    return { id: "ver-1" } as never;
  });
  vi.spyOn(f3, "loadServerVerifyF3ReadinessContext").mockImplementation(async () => {
    h.trace.push("f3-context");
    return { projectId: "project-1", orchestrationSnapshot: { snap: true } };
  });
  vi.spyOn(tier3, "checkTier3ReadinessForVersion").mockImplementation(async () => {
    h.trace.push("f3-readiness");
    return { ready: true, ok: true, spec: {} } as never;
  });
  vi.spyOn(gate, "isQualityGateDisabledByEnv").mockReturnValue(false);
  vi.spyOn(gate, "isQualityGateConfigured").mockReturnValue(true);
  vi.spyOn(gate, "runQualityGateOnExportable");
  laneReturns([ok("typecheck")]);
  vi.spyOn(gate, "maybeAnalyzeVisualQAForPassedExportable").mockReturnValue(undefined);
  vi.spyOn(exported, "chatUsesVerbatimRepo").mockResolvedValue(false);
  vi.spyOn(exported, "buildExportableProject").mockImplementation(async () => {
    h.trace.push("export");
    return files;
  });
  vi.spyOn(errors, "createEngineVersionErrorLogs").mockImplementation(async (rows, options) => {
    for (const row of rows) {
      h.logs.push(row as never);
      h.trace.push(
        `log:${row.level}:${row.category}:${row.message}${options?.lockTimeoutMs === 3_000 ? "" : " [no lock timeout]"}`,
      );
    }
    return [] as never;
  });
  vi.mocked(promoteGuard.assertPromoteAllowed).mockReset().mockImplementation(async () => {
    h.trace.push("guard");
    return { allowed: true };
  });
  vi.spyOn(telemetry, "recordQualityGatePassedForCurrentContent").mockImplementation(async () => {
    h.trace.push("stamp");
    return true;
  });
  vi.spyOn(missingEnvLog, "logTier3MissingEnvBlockedDetached").mockImplementation(() => {
    h.trace.push("missing-env-log");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("kvalitetsgrindens kontrakt: förutsättningar (lanen startar aldrig)", () => {
  it.each([
    ["tom holder", gateParams({ holderRunId: " " })],
    ["saknad revision", gateParams({ snapshot: snapshot({ filesRevision: "  " }) })],
  ])("snapshot_unavailable (%s) → 503, inga skrivningar", async (_name, params) => {
    expectContract(await runGate(params), {
      status: 503,
      body: { code: "snapshot_unavailable", retryable: true },
      verification: stopped("snapshot_unavailable", true),
      trace: [],
    });
  });

  it("integrationsBuild mot en F2-rad → 409 integrations_version_required", async () => {
    expectContract(await runGate(gateParams({ gate: "integrationsBuild" })), {
      status: 409,
      body: { error: "ReleaseGate requires an F3 integrations version.", code: "integrations_version_required" },
      verification: stopped("integrations_version_required", false),
      trace: [],
    });
  });

  it("F3: chattkontexten går inte att läsa → 503 readiness_unavailable före readiness", async () => {
    vi.mocked(f3.loadServerVerifyF3ReadinessContext).mockImplementation(async () => {
      h.trace.push("f3-context");
      return { error: "readiness_unavailable" };
    });
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot() })), {
      status: 503,
      body: { code: "readiness_unavailable", retryable: true },
      verification: stopped("readiness_unavailable", true),
      trace: ["f3-context"],
    });
  });

  it("förbrukat fönster före lanen → 503 time_budget_exceeded utan återställning", async () => {
    expectContract(await runGate(gateParams({ verifyDeadlineEpochMs: NOW })), {
      status: 503,
      body: { code: "time_budget_exceeded", retryable: true, passed: false, promoted: false },
      verification: stopped("time_budget_exceeded", true),
      trace: [],
    });
  });

  it("filer saknas → 404 med felmeddelandet som stoppskäl", async () => {
    expectContract(await runGate(gateParams({ snapshot: snapshot({ files: [] }) })), {
      status: 404,
      body: { error: "No files found for version" },
      verification: stopped("No files found for version", false),
      trace: ["latest?"],
    });
  });

  it("verify-lanen är inte konfigurerad → 501 quality_gate_disabled utan tillståndsskrivning", async () => {
    vi.mocked(gate.isQualityGateConfigured).mockReturnValue(false);
    expectContract(await runGate(gateParams()), {
      status: 501,
      body: {
        error: "Quality gate not configured (missing preview-host verify lane).",
        code: "quality_gate_disabled",
        hint: HINT,
      },
      verification: stopped("quality_gate_disabled", false),
      trace: ["latest?"],
    });
  });
});

describe("kvalitetsgrindens kontrakt: avstängd via env (bara F2)", () => {
  beforeEach(() => {
    vi.mocked(gate.isQualityGateDisabledByEnv).mockReturnValue(true);
  });
  const body = {
    passed: false,
    skipped: true,
    disabled: true,
    promoted: false,
    checks: [],
    reason:
      "Quality gate avstängd via SAJTMASKIN_DISABLE_QUALITY_GATE — versionen lämnas overifierad (ingen verify-körning, ingen promotion).",
  };

  it("hoppar över lanen, rör inte versionen och lämnar en varningsrad", async () => {
    expectContract(await runGate(gateParams()), {
      status: 200,
      body,
      verification: stopped("quality_gate_disabled", false),
      trace: [
        "log:warning:quality-gate:disabled-skip:Quality gate avstängd (SAJTMASKIN_DISABLE_QUALITY_GATE) — verify-lane hoppades över; versionen lämnas overifierad.",
      ],
    });
    expect(h.logs[0]?.meta).toEqual({ reason: "quality_gate_disabled_by_env", serverOwned: false });
  });

  it("utan databas: samma svar, ingen loggrad", async () => {
    h.dbConfigured = false;
    expectContract(await runGate(gateParams()), {
      status: 200,
      body,
      verification: stopped("quality_gate_disabled", false),
      trace: [],
    });
  });

  it("fillös version → 404, aldrig ett hoppat-över-svar", async () => {
    expectContract(await runGate(gateParams({ snapshot: snapshot({ files: [] }) })), {
      status: 404,
      body: { error: "No files found for version" },
      verification: stopped("No files found for version", false),
      trace: [],
    });
  });

  it("stänger aldrig av F3-grinden", async () => {
    laneReturns([ok("typecheck"), ok("build")]);
    const result = await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" }));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ passed: true, promoted: true });
    expect(h.trace).toEqual([...F3_PRELUDE, "guard", PROMOTE_PASSED, LOG_PASSED]);
  });
});

describe("kvalitetsgrindens kontrakt: F3-readiness håller före lanen", () => {
  const readinessReturns = (result: Record<string, unknown>) =>
    vi.mocked(tier3.checkTier3ReadinessForVersion).mockImplementation(async () => {
      h.trace.push("f3-readiness");
      return { ready: false, ok: false, ...result } as never;
    });
  const f3Gate = (over: Record<string, unknown> = {}) =>
    gateParams({ snapshot: f3Snapshot(over), gate: "integrationsBuild" });

  it("saknad env → 412 tier3_env_not_ready med projekt och saknade nycklar", async () => {
    const missingByIntegration = [{ integration: "stripe", missing: ["STRIPE_SECRET_KEY"] }];
    readinessReturns({ reason: "missing_env", retryable: false, spec: {}, readiness: { missingByIntegration } });
    expectContract(await runGate(f3Gate()), {
      status: 412,
      body: {
        error: "tier3_env_not_ready",
        ready: false,
        parentVersionId: "ver-f2",
        projectId: "project-1",
        missingByIntegration,
      },
      verification: stopped("tier3_env_not_ready", false),
      trace: ["f3-context", "f3-readiness", "missing-env-log"],
    });
    expect(tier3.checkTier3ReadinessForVersion).toHaveBeenCalledWith(
      tier3.serverOwnedF3ReadinessParams({
        versionId: "ver-1",
        chatId: "chat-1",
        parentVersionId: "ver-f2",
        filesRevision: "rev-1",
        preloadedFiles: files,
        orchestrationSnapshot: { snap: true },
        projectId: "project-1",
      }),
    );
    expect(missingEnvLog.logTier3MissingEnvBlockedDetached).toHaveBeenCalledWith({
      chatId: "chat-1",
      versionId: "ver-f2",
      projectId: "project-1",
      missingByIntegration,
      source: "quality-gate",
      f3VersionId: "ver-1",
      lockTimeoutMs: 3_000,
    });
  });

  it.each([
    ["product_postcheck_pending", "pending", true],
    ["product_postcheck_blocked", "blocked", false],
    ["product_postcheck_indeterminate", "indeterminate", true],
    ["product_postcheck_superseded", "superseded", true],
  ] as const)("%s → 409 med verdikt och retryable", async (reason, verdict, retryable) => {
    readinessReturns({ reason, verdict, retryable });
    expectContract(await runGate(f3Gate()), {
      status: 409,
      body: { error: reason, ready: false, parentVersionId: "ver-f2", verdict, retryable },
      verification: stopped(reason, retryable),
      trace: ["f3-context", "f3-readiness"],
    });
  });

  it("saknad designförälder → 409 f3_parent_version_missing", async () => {
    readinessReturns({ reason: "f3_parent_version_missing", retryable: false });
    expectContract(await runGate(f3Gate({ parentVersionId: null })), {
      status: 409,
      body: {
        error: "Integrationsversionen saknar sin designversion.",
        code: "f3_parent_version_missing",
        ready: false,
        parentVersionId: null,
        retryable: false,
      },
      verification: stopped("f3_parent_version_missing", false),
      trace: ["f3-context", "f3-readiness"],
    });
  });

  it("readiness går inte att läsa → 503 readiness_unavailable", async () => {
    readinessReturns({ reason: "readiness_unavailable", retryable: true });
    expectContract(await runGate(f3Gate()), {
      status: 503,
      body: {
        error: "F3 readiness unavailable (database error). Try again shortly.",
        code: "readiness_unavailable",
        ready: false,
        parentVersionId: "ver-f2",
        retryable: true,
      },
      verification: stopped("readiness_unavailable", true),
      trace: ["f3-context", "f3-readiness"],
    });
  });

  it.each([
    ["preview_not_ready", true],
    ["version_files_unavailable", true],
    ["integration_migration_required", false],
  ] as const)("övrigt hinder %s → 409 med skälet som error", async (reason, retryable) => {
    readinessReturns({ reason, retryable });
    expectContract(await runGate(f3Gate()), {
      status: 409,
      body: { error: reason, ready: false, parentVersionId: "ver-f2", retryable },
      verification: stopped(reason, retryable),
      trace: ["f3-context", "f3-readiness"],
    });
  });

  it("readiness kastar → retrybar 503 utan tillståndsskrivning", async () => {
    vi.mocked(tier3.checkTier3ReadinessForVersion).mockImplementation(async () => {
      h.trace.push("f3-readiness");
      throw new Error("readiness exploded");
    });
    expectContract(await runGate(f3Gate()), {
      status: 503,
      body: {
        error: "Quality gate pre-checks failed before verification started. Try again shortly.",
        code: "quality_gate_unavailable",
        retryable: true,
      },
      verification: stopped("quality_gate_unavailable", true),
      trace: ["f3-context", "f3-readiness"],
    });
  });
});

describe("kvalitetsgrindens kontrakt: nyare version finns", () => {
  it("tidigt: raden sätts superseded innan lanen körs", async () => {
    vi.mocked(lease.isLatestVersionForChat).mockImplementation(async () => {
      h.trace.push("latest?");
      return false;
    });
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { passed: false, superseded: true, promoted: false, checks: [] },
      verification: SUPERSEDED,
      trace: [
        "latest?",
        "superseded@run-1",
        "log:warning:quality-gate:superseded:Quality gate skipped: a newer version already exists; version settled as superseded before the verify lane ran.",
      ],
    });
    expect(h.logs[0]?.meta).toEqual({ serverOwned: false, early: true });
  });

  it.each(["null", "kast"])("tidig skrivning tog inte (%s): lanen körs och det sena skyddet avgör", async (mode) => {
    vi.mocked(lease.isLatestVersionForChat).mockImplementation(async () => {
      h.trace.push("latest?");
      return false;
    });
    vi.mocked(repo.markVersionSupersededByRepair).mockImplementation(async (_id, _files, runId) => {
      h.trace.push(`superseded@${runId}`);
      if (mode === "kast") throw new Error("write failed");
      return null as never;
    });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(false, checks), superseded: true, promoted: false },
      verification: SUPERSEDED,
      trace: [
        "latest?",
        "superseded@run-1",
        "export",
        "verifying@run-1",
        "lane:typecheck",
        "latest?",
        "superseded@run-1",
        LOG_LATE_SUPERSEDED,
      ],
    });
  });

  it("sent: en godkänd gate räknas aldrig som godkänd för en ersatt version", async () => {
    let call = 0;
    vi.mocked(lease.isLatestVersionForChat).mockImplementation(async () => {
      h.trace.push("latest?");
      call += 1;
      return call === 1;
    });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(false, checks), superseded: true, promoted: false },
      verification: SUPERSEDED,
      trace: [...F2_PRELUDE, "superseded@run-1", LOG_LATE_SUPERSEDED],
    });
    expect(h.logs[0]?.meta).toEqual({ verificationSummary: "Automatic verification passed.", serverOwned: false });
  });
});

describe("kvalitetsgrindens kontrakt: lanen körde och promotion lyckades", () => {
  it("ren godkänd F2 → 200 passed+promoted, kedjan fortsätter", async () => {
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(true, checks), promoted: true },
      verification: continued(true, false),
      trace: [...F2_PRELUDE, "guard", PROMOTE_PASSED, LOG_PASSED],
    });
    expect(h.logs).toEqual([
      {
        chatId: "chat-1",
        versionId: "ver-1",
        level: "info",
        category: "preflight:quality-gate",
        message: "Automatic quality gate passed.",
        meta: {
          passed: true,
          advisory: false,
          checks: [{ check: "typecheck", passed: true, exitCode: 0, durationMs: 5 }],
          durationMs: 42,
          verifyLaneDurationMs: 42,
          firstFailureCheck: null,
          jobStartedAt: STARTED,
          jobFinishedAt: FINISHED,
          serverOwned: false,
        },
      },
    ]);
    expect(h.bus).toEqual([]);
    expect(promoteGuard.assertPromoteAllowed).toHaveBeenCalledWith("ver-1", undefined, { onReadError: "indeterminate" });
  });

  it("visual QA följer med i svaret (full) och i loggen (kompakt)", async () => {
    const visualQA = {
      overallScore: 72,
      passed: true,
      screenshotCaptured: false,
      checks: [{ check: "hero", passed: true, score: 80, detail: "ok" }],
    };
    vi.mocked(gate.maybeAnalyzeVisualQAForPassedExportable).mockReturnValue(visualQA);
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(true, checks), visualQA, promoted: true },
      verification: continued(true, false),
      trace: [...F2_PRELUDE, "guard", PROMOTE_PASSED, LOG_PASSED],
    });
    expect((h.logs[0]?.meta as Record<string, unknown>).visualQA).toEqual({
      overallScore: 72,
      passed: true,
      screenshotCaptured: false,
      checks: [{ check: "hero", passed: true, score: 80 }],
    });
  });

  it("utan databas: samma svar och promotion, inga loggrader", async () => {
    h.dbConfigured = false;
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(true, checks), promoted: true },
      verification: continued(true, false),
      trace: [...F2_PRELUDE, "guard", PROMOTE_PASSED],
    });
  });

  it("F3 med lint-varningar → godkänd med qualityGateAdvisory och degraderad status", async () => {
    const checks = [ok("typecheck"), ok("build"), lintWarning()];
    laneReturns(checks);
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" })), {
      status: 200,
      body: { ...evidence(true, checks), promoted: true, qualityGateAdvisory: true, advisoryChecks: ["lint"] },
      verification: continued(true, true),
      trace: [
        ...F3_PRELUDE,
        "guard",
        "promote@run-1:ReleaseGate passed with advisory findings: lint.",
        LOG_PASSED_ADVISORY,
        LOG_LINT_ADVISORY,
        "bus:version.degraded:lint_advisory",
      ],
    });
    expect(h.bus).toEqual([
      {
        t: "version.degraded",
        versionId: "ver-1",
        chatId: "chat-1",
        kind: "lint_advisory",
        message: "ReleaseGate godkändes med ESLint-varningar (advisory).",
        meta: { advisoryChecks: ["lint"], warningCount: 2 },
      },
    ]);
    expect(h.logs[1]).toEqual({
      chatId: "chat-1",
      versionId: "ver-1",
      level: "warning",
      category: "quality-gate:lint-advisory",
      message: "lint advisory (exit 0) — ej blockerande",
      meta: {
        stage: "lint",
        command: gate.QUALITY_GATE_COMMANDS.lint,
        output: "2 warnings",
        outputLength: 10,
        exitCode: 0,
        durationMs: 5,
        advisory: true,
        serverOwned: false,
      },
    });
  });

  it("F2 render-first: bara typecheck faller → promotas som advisory, aldrig solid grön", async () => {
    const checks = [bad("typecheck", SEMANTIC_TSC)];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: {
        ...evidence(true, [{ ...checks[0], advisory: true }]),
        firstFailureCheck: "typecheck",
        vmGatePassed: false,
        designAdvisory: true,
        advisoryChecks: ["typecheck"],
        promoted: true,
      },
      verification: continued(false, true),
      trace: [
        ...F2_PRELUDE,
        "guard",
        PROMOTE_ADVISORY,
        LOG_DESIGN_ADVISORY,
        LOG_TYPECHECK_ADVISORY,
        "bus:version.degraded:typecheck_advisory",
      ],
    });
    expect(h.bus).toEqual([
      {
        t: "version.degraded",
        versionId: "ver-1",
        chatId: "chat-1",
        kind: "typecheck_advisory",
        message: "Designläge: versionen promotades med typecheck-varningar (advisory).",
        meta: { advisoryChecks: ["typecheck"] },
      },
    ]);
    expect(h.logs[0]).toMatchObject({
      level: "warning",
      category: "preflight:quality-gate",
      meta: { passed: false, advisory: true, advisoryChecks: ["typecheck"], serverOwned: false },
    });
  });

  it("F2 advisory plus värdens egna lint-varningar: värdens lista skriver över advisoryChecks", async () => {
    const checks = [bad("typecheck", SEMANTIC_TSC), lintWarning()];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: {
        ...evidence(true, [{ ...checks[0], advisory: true }, checks[1]]),
        firstFailureCheck: "typecheck",
        vmGatePassed: false,
        designAdvisory: true,
        advisoryChecks: ["lint"],
        promoted: true,
        qualityGateAdvisory: true,
      },
      verification: continued(false, true),
      trace: [
        ...F2_PRELUDE,
        "guard",
        PROMOTE_ADVISORY,
        LOG_DESIGN_ADVISORY,
        LOG_TYPECHECK_ADVISORY,
        LOG_LINT_ADVISORY,
        "bus:version.degraded:lint_advisory",
        "bus:version.degraded:typecheck_advisory",
      ],
    });
  });

  it("inaktuellt men icke-blockerande verdikt: stämpla aktuellt innehåll, läs om en gång, promota", async () => {
    guardReturns(
      { allowed: false, indeterminate: true, staleRevision: true, staleSignal: "preflight_passed", reason: "stale" },
      { allowed: true },
    );
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(true, checks), promoted: true },
      verification: continued(true, false),
      trace: [...F2_PRELUDE, "guard", "stamp", "guard", PROMOTE_PASSED, LOG_PASSED],
    });
    expect(telemetry.recordQualityGatePassedForCurrentContent).toHaveBeenCalledWith("ver-1");
  });
});

describe("kvalitetsgrindens kontrakt: lanen körde men versionen blev inte grön", () => {
  it("hårt gatefel (F3 build) → versionen failas, 200 passed:false", async () => {
    const checks = [ok("typecheck"), bad("build", "Build failed: x")];
    laneReturns(checks);
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" })), {
      status: 200,
      body: { ...evidence(false, checks), promoted: false },
      verification: stopped("quality_gate_failed", false),
      trace: [
        ...F3_PRELUDE,
        "fail@run-1:Automatic verification failed: build. Build failed: x",
        LOG_FAILED,
        "log:error:quality-gate:build:build failed (exit 2)",
      ],
    });
    expect(promoteGuard.assertPromoteAllowed).not.toHaveBeenCalled();
    expect(h.logs[1]).toEqual({
      chatId: "chat-1",
      versionId: "ver-1",
      level: "error",
      category: "quality-gate:build",
      message: "build failed (exit 2)",
      meta: {
        stage: "build",
        command: gate.QUALITY_GATE_COMMANDS.build,
        output: "Build failed: x",
        outputLength: 15,
        exitCode: 2,
        durationMs: 7,
        advisory: false,
        serverOwned: false,
      },
    });
  });

  it("toolingfel bär repairable/failureKind oförändrat; lint-varningar följer med ett underkänt svar", async () => {
    const checks = [
      ok("typecheck"),
      bad("build", "config broken", { repairable: false, failureKind: "tooling" }),
      lintWarning(),
    ];
    laneReturns(checks);
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" })), {
      status: 200,
      body: { ...evidence(false, checks), promoted: false, qualityGateAdvisory: true, advisoryChecks: ["lint"] },
      verification: stopped("quality_gate_failed", false),
      trace: [
        ...F3_PRELUDE,
        "fail@run-1:Automatic verification failed: build. config broken",
        "log:error:preflight:quality-gate:Automatic quality gate failed.",
        "log:error:quality-gate:build:build failed (exit 2)",
        LOG_LINT_ADVISORY,
      ],
    });
  });

  it("F2: typecheck med render-risk (TS2307) är hårt, inte advisory", async () => {
    const checks = [bad("typecheck", "app/page.tsx(2,24): error TS2307: Cannot find module '@/components/hero'.")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(false, checks), promoted: false },
      verification: stopped("quality_gate_failed", false),
      trace: [
        ...F2_PRELUDE,
        "fail@run-1:Automatic verification failed: typecheck. app/page.tsx(2,24): error TS2307: Cannot find module '@/components/hero'.",
        LOG_FAILED,
        "log:error:quality-gate:typecheck:typecheck failed (exit 2)",
      ],
    });
  });

  it("verifierblock efter godkänd gate → promotionBlocked, versionen failas", async () => {
    guardReturns({ allowed: false, signal: "verifier_failed", reason: "finalize quality gate = verifier_failed" });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: {
        ...evidence(false, checks),
        vmGatePassed: true,
        promotionBlocked: true,
        promotionBlockedReason: "finalize_quality_gate_failed",
        promoted: false,
      },
      verification: stopped("promotion_blocked", false, true),
      trace: [
        ...F2_PRELUDE,
        "guard",
        "fail@run-1:Build checks passed but the finalize verifier flagged blocking findings; promotion was blocked.",
        LOG_PASSED,
      ],
    });
  });

  it("verifierblock på en advisory-version → egen sammanfattning, inga advisory-fält i svaret", async () => {
    guardReturns({ allowed: false, signal: "verifier_failed", reason: "finalize quality gate = verifier_failed" });
    const checks = [bad("typecheck", SEMANTIC_TSC)];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: {
        ...evidence(false, [{ ...checks[0], advisory: true }]),
        vmGatePassed: false,
        promotionBlocked: true,
        promotionBlockedReason: "finalize_quality_gate_failed",
        promoted: false,
      },
      verification: stopped("promotion_blocked", false),
      trace: [
        ...F2_PRELUDE,
        "guard",
        "fail@run-1:Typecheck advisory noted, but the finalize verifier flagged blocking findings; promotion was blocked.",
        LOG_DESIGN_ADVISORY,
        LOG_TYPECHECK_ADVISORY,
      ],
    });
  });

  const guardUnavailable = (checks: Check[], vmGatePassed: boolean) => ({
    ...evidence(false, checks),
    vmGatePassed,
    promoteError: true,
    promoteGuardUnavailable: true,
    promoted: false,
  });

  it("promote-guarden kan inte läsa signalen → retrybar, varken promotad eller failad", async () => {
    guardReturns({ allowed: false, indeterminate: true, reason: "db read failed: secret.internal" });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: guardUnavailable(checks, true),
      verification: stopped("promotion_deferred", true, true),
      trace: [...F2_PRELUDE, "guard", LOG_GUARD_UNAVAILABLE, LOG_PASSED],
    });
    // Rå guard-orsak får aldrig hamna i en logg som visas för chattägaren.
    expect(h.logs[0]?.meta).toEqual({ reason: "promote_guard_signal_unavailable", serverOwned: false });
    expect(JSON.stringify(h.logs)).not.toContain("secret.internal");
  });

  it("promote-guarden kastar → samma retrybara svar", async () => {
    vi.mocked(promoteGuard.assertPromoteAllowed).mockImplementation(async () => {
      h.trace.push("guard");
      throw new Error("guard exploded");
    });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: guardUnavailable(checks, true),
      verification: stopped("promotion_deferred", true, true),
      trace: [...F2_PRELUDE, "guard", LOG_GUARD_UNAVAILABLE, LOG_PASSED],
    });
  });

  it("otillgänglig guard på en advisory-version behåller designAdvisory i svaret", async () => {
    guardReturns({ allowed: false, indeterminate: true, reason: "db read failed" });
    const checks = [bad("typecheck", SEMANTIC_TSC)];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: {
        ...guardUnavailable([{ ...checks[0], advisory: true }], false),
        designAdvisory: true,
        advisoryChecks: ["typecheck"],
      },
      verification: stopped("promotion_deferred", true),
      trace: [...F2_PRELUDE, "guard", LOG_GUARD_UNAVAILABLE, LOG_DESIGN_ADVISORY, LOG_TYPECHECK_ADVISORY],
    });
  });

  it("otillgänglig guard tar inte med värdens lint-advisory (till skillnad från promoteError)", async () => {
    guardReturns({ allowed: false, indeterminate: true, reason: "db read failed" });
    const checks = [ok("typecheck"), ok("build"), lintWarning()];
    laneReturns(checks);
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" })), {
      status: 200,
      body: guardUnavailable(checks, true),
      verification: stopped("promotion_deferred", true, true),
      trace: [...F3_PRELUDE, "guard", LOG_GUARD_UNAVAILABLE, LOG_PASSED_ADVISORY, LOG_LINT_ADVISORY],
    });
  });

  it("inaktuellt verdikt som själv blockerade omprövas aldrig", async () => {
    guardReturns({
      allowed: false,
      indeterminate: true,
      staleRevision: true,
      staleSignal: "verifier_failed",
      staleSignalBlocking: true,
      reason: "stale blocking",
    });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: guardUnavailable(checks, true),
      verification: stopped("promotion_deferred", true, true),
      trace: [...F2_PRELUDE, "guard", LOG_GUARD_UNAVAILABLE, LOG_PASSED],
    });
  });

  it("stämpeln för aktuellt innehåll tog inte → ingen omläsning, retrybart", async () => {
    guardReturns({ allowed: false, indeterminate: true, staleRevision: true, reason: "stale" });
    vi.mocked(telemetry.recordQualityGatePassedForCurrentContent).mockImplementation(async () => {
      h.trace.push("stamp");
      return false;
    });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: guardUnavailable(checks, true),
      verification: stopped("promotion_deferred", true, true),
      trace: [...F2_PRELUDE, "guard", "stamp", LOG_GUARD_UNAVAILABLE, LOG_PASSED],
    });
  });

  it.each(["null", "kast"])("promotionsskrivningen tog inte (%s) → promoteError, retrybart", async (mode) => {
    vi.mocked(repo.promoteVersion).mockImplementation(async (_id, summary, runId) => {
      h.trace.push(`promote@${runId}:${summary}`);
      if (mode === "kast") throw new Error("constraint violation");
      return null as never;
    });
    const checks = [ok("typecheck")];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: { ...evidence(false, checks), vmGatePassed: true, promoteError: true, promoted: false },
      verification: stopped("promotion_deferred", true, true),
      trace: [...F2_PRELUDE, "guard", PROMOTE_PASSED, LOG_PASSED],
    });
  });

  it("promoteError på advisory-version med lint-varningar bär båda advisory-fälten", async () => {
    vi.mocked(repo.promoteVersion).mockImplementation(async (_id, summary, runId) => {
      h.trace.push(`promote@${runId}:${summary}`);
      return null as never;
    });
    const checks = [bad("typecheck", SEMANTIC_TSC), lintWarning()];
    laneReturns(checks);
    expectContract(await runGate(gateParams()), {
      status: 200,
      body: {
        ...evidence(false, [{ ...checks[0], advisory: true }, checks[1]]),
        vmGatePassed: false,
        promoteError: true,
        promoted: false,
        designAdvisory: true,
        advisoryChecks: ["lint"],
        qualityGateAdvisory: true,
      },
      verification: stopped("promotion_deferred", true),
      trace: [...F2_PRELUDE, "guard", PROMOTE_ADVISORY, LOG_DESIGN_ADVISORY, LOG_TYPECHECK_ADVISORY, LOG_LINT_ADVISORY],
    });
  });

  it("providerbyte kräver granskning → 409 integration_migration_required, inga gate-loggar", async () => {
    vi.mocked(repo.promoteVersion).mockImplementation(async (_id, summary, runId) => {
      h.trace.push(`promote@${runId}:${summary}`);
      return "integration_migration_required" as never;
    });
    const checks = [ok("typecheck"), ok("build")];
    laneReturns(checks);
    const expected = {
      status: 409,
      body: {
        error: "Versionen innehåller ett providerbyte som måste granskas innan den kan markeras klar.",
        code: "integration_migration_required",
        retryable: false,
        passed: false,
        vmGatePassed: true,
        promoted: false,
      },
      verification: stopped("integration_migration_required", false, true),
    };
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" })), {
      ...expected,
      trace: [
        ...F3_PRELUDE,
        "guard",
        PROMOTE_PASSED,
        "log:warning:quality-gate:integration-migration-required:Build checks passed, but an integration migration requires explicit review before promotion.",
      ],
    });
    expect(h.logs[0]?.meta).toEqual({ code: "integration_migration_required", retryable: false, serverOwned: false });

    h.trace.length = 0;
    h.dbConfigured = false;
    expectContract(await runGate(gateParams({ snapshot: f3Snapshot(), gate: "integrationsBuild" })), {
      ...expected,
      trace: [...F3_PRELUDE, "guard", PROMOTE_PASSED],
    });
  });
});

describe("kvalitetsgrindens kontrakt: verifieringen kunde inte genomföras", () => {
  it("gaten rapporterar null (ej konfigurerad) efter start → återställ till pending, 501", async () => {
    vi.mocked(gate.runQualityGateOnExportable).mockImplementation(async () => {
      h.trace.push("lane:null");
      return null;
    });
    expectContract(await runGate(gateParams()), {
      status: 501,
      body: {
        error: "Quality gate not configured (missing preview-host verify lane).",
        code: "quality_gate_disabled",
        hint: HINT,
      },
      verification: stopped("quality_gate_disabled", false),
      trace: ["latest?", "export", "verifying@run-1", "lane:null", "pending@run-1"],
    });
  });

  it("fönstret tar slut under lanen → 503 time_budget_exceeded och pending, aldrig failed", async () => {
    vi.mocked(gate.runQualityGateOnExportable).mockImplementation(async () => {
      h.trace.push("lane:typecheck");
      vi.mocked(Date.now).mockReturnValue(NOW + 100);
      return { results: [ok("typecheck")], verifyLaneDurationMs: 1, firstFailureCheck: null, jobStartedAt: null, jobFinishedAt: null };
    });
    expectContract(await runGate(gateParams({ verifyDeadlineEpochMs: NOW + 100 })), {
      status: 503,
      body: { code: "time_budget_exceeded", retryable: true, passed: false, promoted: false },
      verification: stopped("time_budget_exceeded", true),
      trace: ["latest?", "export", "verifying@run-1", "lane:typecheck", "pending@run-1"],
    });
  });

  it.each([true, false])("verify-lanen onåbar (retryable=%s) → 503 quality_gate_unavailable, pending", async (retryable) => {
    vi.mocked(gate.runQualityGateOnExportable).mockImplementation(async () => {
      h.trace.push("lane:typecheck");
      throw new gate.QualityGateUnavailableError("verify lane down", retryable);
    });
    expectContract(await runGate(gateParams()), {
      status: 503,
      body: { error: "verify lane down", code: "quality_gate_unavailable", retryable, hint: HINT },
      // Kedjan behandlar varje 503 som retrybar, även när värden sa retryable:false.
      verification: stopped("quality_gate_unavailable", true),
      trace: ["latest?", "export", "verifying@run-1", "lane:typecheck", "pending@run-1"],
    });
  });

  it("verify-lanen saknar konfiguration (kast) → 501 quality_gate_disabled, pending", async () => {
    vi.mocked(gate.runQualityGateOnExportable).mockImplementation(async () => {
      h.trace.push("lane:typecheck");
      throw new gate.QualityGateNotConfiguredError();
    });
    expectContract(await runGate(gateParams()), {
      status: 501,
      body: {
        error: "Quality gate not configured (missing SAJTMASKIN_PREVIEW_HOST_BASE_URL).",
        code: "quality_gate_disabled",
        retryable: false,
        hint: HINT,
      },
      verification: stopped("quality_gate_disabled", false),
      trace: ["latest?", "export", "verifying@run-1", "lane:typecheck", "pending@run-1"],
    });
  });

  it("kast före lanen (export) → retrybar 503, versionen orörd", async () => {
    vi.mocked(exported.buildExportableProject).mockImplementation(async () => {
      h.trace.push("export");
      throw new Error("export exploded");
    });
    expectContract(await runGate(gateParams()), {
      status: 503,
      body: {
        error: "Quality gate pre-checks failed before verification started. Try again shortly.",
        code: "quality_gate_unavailable",
        retryable: true,
      },
      verification: stopped("quality_gate_unavailable", true),
      trace: ["latest?", "export"],
    });
  });

  it("okänt kast efter att lanen startat → versionen failas och felet går vidare", async () => {
    vi.mocked(gate.runQualityGateOnExportable).mockImplementation(async () => {
      h.trace.push("lane:typecheck");
      throw new Error("boom");
    });
    await expect(runGate(gateParams())).rejects.toThrow("boom");
    expect(h.trace).toEqual([
      "latest?",
      "export",
      "verifying@run-1",
      "lane:typecheck",
      "fail@run-1:Automatic verification could not complete.",
    ]);
  });
});
