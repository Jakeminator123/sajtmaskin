import type { EvalDumpMode } from "./artifact-dump";
import type { EvalReport, EvalSummary } from "./runner";
import { resolveEvalRunOutcome, type EvalRunOutcome } from "./outcome";
import type { FollowUpEvalResult } from "./follow-up-context";
import type { ScaffoldEvalReport } from "@/lib/gen/scaffolds/scaffold-eval";
import type { AuditLatencyReport } from "./audit-latency";

export const SMOKE_PROMPT_IDS = ["coffee-shop", "restaurant", "portfolio"] as const;

export type CanonicalEvalMode = "free" | "codegen-smoke" | "codegen-full" | "audit-latency";

export type CanonicalLaneOutcome =
  | "pass"
  | "fail"
  | "provider_error"
  | "infra_error"
  | "skipped";

export type CanonicalTopOutcome = "pass" | "fail" | "provider_error" | "infra_error";

/** Why codegen did not run. `null` means the paid lane actually executed. */
export type CodegenSkipReason = "free_mode" | "blocked_by_failed_free_lane" | "audit_latency_mode";

export interface CanonicalFollowupLane {
  name: "followup";
  outcome: Exclude<CanonicalLaneOutcome, "skipped" | "provider_error" | "infra_error">;
  passed: number;
  total: number;
}

export interface CanonicalScaffoldLane {
  name: "scaffold";
  outcome: Exclude<CanonicalLaneOutcome, "skipped" | "provider_error" | "infra_error">;
  keywordTop1Accuracy: number;
  semanticTop1Accuracy: number;
  semanticTop3Accuracy: number;
  reportPath: string;
}

export interface CanonicalCodegenLane {
  name: "codegen";
  outcome: CanonicalLaneOutcome;
  skipReason: CodegenSkipReason | null;
  forced: boolean;
  summary: EvalSummary | null;
  promptCount: number;
}

export interface CanonicalEvalResult {
  timestamp: string;
  mode: CanonicalEvalMode;
  outcome: CanonicalTopOutcome;
  lanes: {
    followup: CanonicalFollowupLane;
    scaffold: CanonicalScaffoldLane;
    codegen: CanonicalCodegenLane;
    auditLatency?: {
      name: "audit-latency";
      outcome: CanonicalLaneOutcome;
      skipReason: "blocked_by_failed_free_lane" | null;
      report: AuditLatencyReport | null;
    };
  };
}

export interface CanonicalEvalArgs {
  mode: CanonicalEvalMode;
  json: boolean;
  dumpMode: EvalDumpMode | undefined;
  force: boolean;
  promptIds: string[] | null;
  auditUrls?: string[];
}

export interface CanonicalEvalDeps {
  runFollowUp?: () => Promise<FollowUpEvalResult[]>;
  runScaffold?: () => Promise<{ report: ScaffoldEvalReport; reportPath: string }>;
  runCodegen?: (args: {
    prompts: { id: string }[];
    dumpMode?: EvalDumpMode;
  }) => Promise<EvalReport>;
  runAuditLatency?: (args: { urls: string[]; dumpMode?: EvalDumpMode; print: (line: string) => void }) => Promise<AuditLatencyReport>;
}

export function parseCanonicalEvalArgs(args: string[]): CanonicalEvalArgs {
  if (args.includes("--gate") || args.includes("--save-baseline")) {
    throw new Error(
      "--gate and --save-baseline were removed. Baseline compare is informational only. See src/lib/gen/eval/README.md",
    );
  }
  const json = args.includes("--json");
  const force = args.includes("--force");
  const wantsFull = args.includes("--full");
  const wantsCodegen = args.includes("--codegen") || args.includes("--smoke");
  const promptIds = parsePromptFilter(args);
  const dumpMode = parseDumpModeFlag(args);
  const auditFlags = args.filter((arg) => arg === "--audit-latency" || arg.startsWith("--audit-latency="));
  if (auditFlags.length) {
    if (auditFlags.length !== 1) throw new Error("Use --audit-latency once with one or two explicit URLs.");
    if (wantsFull || wantsCodegen || promptIds || force) {
      throw new Error("--audit-latency cannot be combined with --codegen, --smoke, --full, --prompts or --force.");
    }
    const flag = auditFlags[0];
    const raw = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : args[args.indexOf(flag) + 1];
    const auditUrls = (raw ?? "").split(",").map((url) => url.trim()).filter(Boolean);
    if (auditUrls.length < 1 || auditUrls.length > 2 || auditUrls.some((url) => url.startsWith("--"))) {
      throw new Error("--audit-latency requires one or two explicit URLs (maximum four paid audits).");
    }
    return { mode: "audit-latency", json, dumpMode, force, promptIds, auditUrls };
  }

  let mode: CanonicalEvalMode = "free";
  if (wantsFull) mode = "codegen-full";
  else if (wantsCodegen || promptIds) mode = "codegen-smoke";

  return { mode, json, dumpMode, force, promptIds };
}

function parsePromptFilter(args: string[]): string[] | null {
  const idx = args.findIndex((a) => a === "--prompts" || a.startsWith("--prompts="));
  if (idx === -1) return null;
  const flag = args[idx];
  const rawValue = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : args[idx + 1];
  const ids = (rawValue ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error(
      "--prompts requires at least one prompt id. Example: --prompts=arcade-with-klarna",
    );
  }
  return ids;
}

function parseDumpModeFlag(args: string[]): EvalDumpMode | undefined {
  const flag = args.find((arg) => arg === "--dump-files" || arg.startsWith("--dump-files="));
  if (!flag) return undefined;
  if (flag === "--dump-files") return "failed";
  const value = flag.slice(flag.indexOf("=") + 1).trim().toLowerCase();
  if (value === "all") return "all";
  if (value === "failed" || value === "1" || value === "true") return "failed";
  if (value === "off" || value === "0" || value === "false") return "off";
  throw new Error(
    "Invalid --dump-files value. Use --dump-files, --dump-files=failed, or --dump-files=all.",
  );
}

/**
 * Provider/infra from codegen outrank a quality miss. A skipped codegen lane
 * cannot invent an outage. Free-lane failures stay FAIL (exit 1).
 */
export function resolveCanonicalOutcome(lanes: {
  followup: CanonicalLaneOutcome;
  scaffold: CanonicalLaneOutcome;
  codegen: CanonicalLaneOutcome;
  auditLatency?: CanonicalLaneOutcome;
}): CanonicalTopOutcome {
  if (lanes.codegen === "provider_error" || lanes.auditLatency === "provider_error") return "provider_error";
  if (lanes.codegen === "infra_error" || lanes.auditLatency === "infra_error") return "infra_error";
  if (lanes.followup === "fail" || lanes.scaffold === "fail" || lanes.codegen === "fail" || lanes.auditLatency === "fail") {
    return "fail";
  }
  return "pass";
}

export function canonicalExitCode(outcome: CanonicalTopOutcome): 0 | 1 | 2 {
  if (outcome === "provider_error" || outcome === "infra_error") return 2;
  return outcome === "fail" ? 1 : 0;
}

/**
 * Paid codegen does not run after a failed free lane unless `--force`.
 * A skipped lane here is not a pass — the free-lane fail still owns the top outcome.
 */
export function resolveCodegenPlan(options: {
  mode: CanonicalEvalMode;
  freeLaneFailed: boolean;
  force: boolean;
}): { run: true; forced: boolean } | { run: false; skipReason: CodegenSkipReason } {
  if (options.mode === "free") return { run: false, skipReason: "free_mode" };
  if (options.mode === "audit-latency") return { run: false, skipReason: "audit_latency_mode" };
  if (options.freeLaneFailed && !options.force) {
    return { run: false, skipReason: "blocked_by_failed_free_lane" };
  }
  return { run: true, forced: options.freeLaneFailed && options.force };
}

export function followupLaneFromResults(results: FollowUpEvalResult[]): CanonicalFollowupLane {
  const passed = results.filter((result) => result.passed).length;
  return {
    name: "followup",
    outcome: passed === results.length ? "pass" : "fail",
    passed,
    total: results.length,
  };
}

/**
 * Owner-adjustable policy, not a law of nature. Keyword top-1 is the matcher
 * that always runs locally. Semantic ranking is reported but never decides
 * the lane — missing embeddings degrade to keyword, which is expected.
 */
export const SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT = 90;

export function scaffoldLaneFromReport(
  report: ScaffoldEvalReport,
  reportPath: string,
): CanonicalScaffoldLane {
  return {
    name: "scaffold",
    outcome:
      report.summary.keywordTop1Accuracy >= SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT
        ? "pass"
        : "fail",
    keywordTop1Accuracy: report.summary.keywordTop1Accuracy,
    semanticTop1Accuracy: report.summary.semanticTop1Accuracy,
    semanticTop3Accuracy: report.summary.semanticTop3Accuracy,
    reportPath,
  };
}

export function codegenLaneFromRun(
  outcome: EvalRunOutcome | "skipped",
  summary: EvalSummary | null,
  promptCount: number,
  extras: { skipReason?: CodegenSkipReason | null; forced?: boolean } = {},
): CanonicalCodegenLane {
  if (outcome === "skipped") {
    if (!extras.skipReason) {
      throw new Error("A skipped codegen lane must say why (skipReason).");
    }
    return {
      name: "codegen",
      outcome: "skipped",
      skipReason: extras.skipReason,
      forced: false,
      summary: null,
      promptCount: 0,
    };
  }
  const laneOutcome: CanonicalLaneOutcome =
    outcome === "quality_fail" ? "fail" : outcome === "pass" ? "pass" : outcome;
  return {
    name: "codegen",
    outcome: laneOutcome,
    skipReason: null,
    forced: extras.forced === true,
    summary,
    promptCount,
  };
}

export function toCanonicalJson(result: CanonicalEvalResult): Record<string, unknown> {
  return {
    timestamp: result.timestamp,
    mode: result.mode,
    outcome: result.outcome.toUpperCase(),
    exitCode: canonicalExitCode(result.outcome),
    lanes: {
      followup: {
        outcome: result.lanes.followup.outcome.toUpperCase(),
        passed: result.lanes.followup.passed,
        total: result.lanes.followup.total,
      },
      scaffold: {
        outcome: result.lanes.scaffold.outcome.toUpperCase(),
        keywordTop1Accuracy: result.lanes.scaffold.keywordTop1Accuracy,
        semanticTop1Accuracy: result.lanes.scaffold.semanticTop1Accuracy,
        semanticTop3Accuracy: result.lanes.scaffold.semanticTop3Accuracy,
        reportPath: result.lanes.scaffold.reportPath,
      },
      codegen: {
        outcome: result.lanes.codegen.outcome.toUpperCase(),
        skipReason: result.lanes.codegen.skipReason,
        forced: result.lanes.codegen.forced,
        promptCount: result.lanes.codegen.promptCount,
        summary: result.lanes.codegen.summary,
      },
      ...(result.lanes.auditLatency ? { auditLatency: {
        outcome: result.lanes.auditLatency.outcome.toUpperCase(),
        skipReason: result.lanes.auditLatency.skipReason,
        report: result.lanes.auditLatency.report,
      } } : {}),
    },
  };
}

export async function runCanonicalEval(options: {
  mode: CanonicalEvalMode;
  dumpMode?: EvalDumpMode;
  force?: boolean;
  promptIds?: string[] | null;
  auditUrls?: string[];
  print?: (line: string) => void;
  deps?: CanonicalEvalDeps;
}): Promise<{ result: CanonicalEvalResult; codegenReport: EvalReport | null }> {
  const print = options.print ?? ((line: string) => console.info(line));
  if (options.mode === "audit-latency") {
    if (options.force || options.promptIds) throw new Error("Audit latency cannot force failed free lanes or run codegen prompts.");
    const { normalizeAuditLatencyUrls } = await import("./audit-latency");
    normalizeAuditLatencyUrls(options.auditUrls ?? []);
  } else if (options.auditUrls?.length) {
    throw new Error("Audit URLs require the explicit audit-latency mode.");
  }
  const followupResults = options.deps?.runFollowUp
    ? await options.deps.runFollowUp()
    : await (async () => {
        const { runFollowUpContextEval, formatFollowUpContextEvalReport } = await import(
          "./follow-up-context"
        );
        print("Lane followup (free)...");
        const results = await runFollowUpContextEval();
        print(formatFollowUpContextEvalReport(results));
        return results;
      })();
  if (options.deps?.runFollowUp) {
    print("Lane followup (free)...");
  }
  const followup = followupLaneFromResults(followupResults);

  const scaffoldWritten = options.deps?.runScaffold
    ? await options.deps.runScaffold()
    : await (async () => {
        const {
          loadScaffoldEvalCasesFromFile,
          resolveDefaultScaffoldEvalPath,
          runScaffoldSelectionEval,
          writeScaffoldSelectionReport,
        } = await import("@/lib/gen/scaffolds/scaffold-eval");
        print("Lane scaffold (free)...");
        const evalCases = await loadScaffoldEvalCasesFromFile(
          resolveDefaultScaffoldEvalPath(process.cwd()),
        );
        const report = await runScaffoldSelectionEval(evalCases);
        const written = await writeScaffoldSelectionReport(report);
        print(
          `[scaffold] cases=${report.summary.total} keyword_top1=${report.summary.keywordTop1Accuracy}% semantic_top1=${report.summary.semanticTop1Accuracy}% wrote ${written.latestPath}`,
        );
        return { report, reportPath: written.latestPath };
      })();
  if (options.deps?.runScaffold) {
    print("Lane scaffold (free)...");
  }
  const scaffold = scaffoldLaneFromReport(scaffoldWritten.report, scaffoldWritten.reportPath);

  const plan = resolveCodegenPlan({
    mode: options.mode,
    freeLaneFailed: followup.outcome === "fail" || scaffold.outcome === "fail",
    force: Boolean(options.force),
  });

  let codegen: CanonicalCodegenLane;
  let codegenReport: EvalReport | null = null;

  if (!plan.run) {
    codegen = codegenLaneFromRun("skipped", null, 0, { skipReason: plan.skipReason });
    if (plan.skipReason === "blocked_by_failed_free_lane") {
      print(
        "Lane codegen skipped — a free lane failed, so the paid run would measure broken machinery. Use --force to spend anyway.",
      );
    }
  } else if (options.deps?.runCodegen) {
    if (plan.forced) {
      print("Lane codegen forced (--force) despite a failed free lane.");
    }
    const promptIds =
      options.promptIds ??
      (options.mode === "codegen-smoke" ? [...SMOKE_PROMPT_IDS] : []);
    print(
      `Lane codegen (${options.mode}, ${promptIds.length || "all"} prompt(s)) — requires OPENAI_API_KEY + POSTGRES_URL...`,
    );
    codegenReport = await options.deps.runCodegen({
      prompts: promptIds.map((id) => ({ id })),
      dumpMode: options.dumpMode,
    });
    const summary = codegenReport.summary;
    const codegenOutcome = resolveEvalRunOutcome({ summary });
    codegen = codegenLaneFromRun(codegenOutcome, summary, promptIds.length, {
      forced: plan.forced,
    });
  } else {
    const { runEval } = await import("./runner");
    const { formatEvalReport } = await import("./report");
    const { EVAL_PROMPTS } = await import("./prompts");
    const { loadBaseline, compareWithBaseline } = await import("./baseline");

    const promptIds =
      options.promptIds ??
      (options.mode === "codegen-smoke" ? [...SMOKE_PROMPT_IDS] : null);
    const prompts = promptIds
      ? EVAL_PROMPTS.filter((prompt) => promptIds.includes(prompt.id))
      : EVAL_PROMPTS;
    if (promptIds) {
      const missing = promptIds.filter((id) => !EVAL_PROMPTS.some((prompt) => prompt.id === id));
      if (missing.length > 0) {
        throw new Error(
          `Unknown prompt id(s): ${missing.join(", ")}. Available: ${EVAL_PROMPTS.map((p) => p.id).join(", ")}`,
        );
      }
    }

    if (plan.forced) {
      print("Lane codegen forced (--force) despite a failed free lane.");
    }
    print(
      `Lane codegen (${options.mode}, ${prompts.length} prompt(s)) — requires OPENAI_API_KEY + POSTGRES_URL...`,
    );
    codegenReport = await runEval({ prompts, dumpMode: options.dumpMode, print });
    print(formatEvalReport(codegenReport));

    const { summary } = codegenReport;
    const runBlocked = summary.providerErrors > 0 || summary.infraErrors > 0;

    if (runBlocked) {
      print(
        `Codegen could not measure quality — ${summary.providerErrors} provider error(s), ` +
          `${summary.infraErrors} infra error(s), ${summary.evaluated}/${summary.total} evaluated.`,
      );
    } else {
      const baseline = await loadBaseline();
      if (baseline) {
        const comparison = compareWithBaseline(codegenReport, baseline);
        print(
          `Baseline comparison (informational): overall delta ${(comparison.overallDelta * 100).toFixed(1)}%, compared ${comparison.gateResult}`,
        );
      }
    }

    const codegenOutcome = resolveEvalRunOutcome({ summary });
    codegen = codegenLaneFromRun(codegenOutcome, summary, prompts.length, {
      forced: plan.forced,
    });
  }

  let auditLatency: CanonicalEvalResult["lanes"]["auditLatency"];
  if (options.mode === "audit-latency") {
    if (followup.outcome === "fail" || scaffold.outcome === "fail") {
      auditLatency = { name: "audit-latency", outcome: "skipped", skipReason: "blocked_by_failed_free_lane", report: null };
      print("Lane audit-latency skipped — a free lane failed. No paid audits ran.");
    } else {
      print(`Lane audit-latency (PAID: ${(options.auditUrls?.length ?? 0) * 2} advanced audits) — requires OPENAI_API_KEY, no database writes...`);
      const runAuditLatency = options.deps?.runAuditLatency ?? (await import("./audit-latency")).runAuditLatencyEval;
      const report = await runAuditLatency({ urls: options.auditUrls ?? [], dumpMode: options.dumpMode, print });
      auditLatency = { name: "audit-latency", outcome: report.outcome, skipReason: null, report };
    }
  }

  const outcome = resolveCanonicalOutcome({
    followup: followup.outcome,
    scaffold: scaffold.outcome,
    codegen: codegen.outcome,
    auditLatency: auditLatency?.outcome,
  });

  return {
    result: {
      timestamp: new Date().toISOString(),
      mode: options.mode,
      outcome,
      lanes: { followup, scaffold, codegen, ...(auditLatency ? { auditLatency } : {}) },
    },
    codegenReport,
  };
}
