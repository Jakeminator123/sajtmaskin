import type { EvalDumpMode } from "./artifact-dump";
import type { EvalReport, EvalRunOutcome, EvalSummary } from "./runner";
import type { FollowUpEvalResult } from "./follow-up-context";
import type { ScaffoldEvalReport } from "@/lib/gen/scaffolds/scaffold-eval";

export const SMOKE_PROMPT_IDS = ["coffee-shop", "restaurant", "portfolio"] as const;

export type CanonicalEvalMode = "free" | "codegen-smoke" | "codegen-full";

export type CanonicalLaneOutcome =
  | "pass"
  | "fail"
  | "provider_error"
  | "infra_error"
  | "skipped";

export type CanonicalTopOutcome = "pass" | "fail" | "provider_error" | "infra_error";

/** Why codegen did not run. `null` means the paid lane actually executed. */
export type CodegenSkipReason = "free_mode" | "blocked_by_failed_free_lane";

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
  };
}

export interface CanonicalEvalArgs {
  mode: CanonicalEvalMode;
  json: boolean;
  dumpMode: EvalDumpMode | undefined;
  gate: boolean;
  saveBaseline: boolean;
  force: boolean;
  promptIds: string[] | null;
}

export interface CanonicalEvalDeps {
  runFollowUp?: () => Promise<FollowUpEvalResult[]>;
  runScaffold?: () => Promise<{ report: ScaffoldEvalReport; reportPath: string }>;
  runCodegen?: (args: {
    prompts: { id: string }[];
    dumpMode?: EvalDumpMode;
  }) => Promise<EvalReport>;
}

export function parseCanonicalEvalArgs(args: string[]): CanonicalEvalArgs {
  const json = args.includes("--json");
  const gate = args.includes("--gate");
  const saveBaseline = args.includes("--save-baseline");
  const force = args.includes("--force");
  const wantsFull = args.includes("--full");
  const wantsCodegen = args.includes("--codegen") || args.includes("--smoke");
  const promptIds = parsePromptFilter(args);
  const dumpMode = parseDumpModeFlag(args);

  let mode: CanonicalEvalMode = "free";
  // --gate / --save-baseline are the old full-suite flags the baseline
  // workflow still calls without --full. They must not silently become free.
  if (wantsFull || gate || saveBaseline) mode = "codegen-full";
  else if (wantsCodegen || promptIds) mode = "codegen-smoke";

  return { mode, json, dumpMode, gate, saveBaseline, force, promptIds };
}

function parsePromptFilter(args: string[]): string[] | null {
  const idx = args.findIndex((a) => a === "--prompts" || a.startsWith("--prompts="));
  if (idx === -1) return null;
  const flag = args[idx];
  const rawValue = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : args[idx + 1];
  if (!rawValue) return null;
  const ids = rawValue
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
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
}): CanonicalTopOutcome {
  if (lanes.codegen === "provider_error") return "provider_error";
  if (lanes.codegen === "infra_error") return "infra_error";
  if (lanes.followup === "fail" || lanes.scaffold === "fail" || lanes.codegen === "fail") {
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
  if (options.freeLaneFailed && !options.force) {
    return { run: false, skipReason: "blocked_by_failed_free_lane" };
  }
  return { run: true, forced: options.freeLaneFailed && options.force };
}

/** Do not persist a codegen baseline from a run that already failed elsewhere. */
export function shouldSaveBaseline(options: {
  saveBaseline: boolean;
  gateFailed: boolean;
  codegenBlocked: boolean;
  followup: CanonicalLaneOutcome;
  scaffold: CanonicalLaneOutcome;
}): boolean {
  if (!options.saveBaseline || options.codegenBlocked || options.gateFailed) return false;
  return options.followup !== "fail" && options.scaffold !== "fail";
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
    },
  };
}

export async function runCanonicalEval(options: {
  mode: CanonicalEvalMode;
  dumpMode?: EvalDumpMode;
  gate?: boolean;
  saveBaseline?: boolean;
  force?: boolean;
  promptIds?: string[] | null;
  print?: (line: string) => void;
  deps?: CanonicalEvalDeps;
}): Promise<{ result: CanonicalEvalResult; codegenReport: EvalReport | null }> {
  const print = options.print ?? ((line: string) => console.info(line));
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
    // Same precedence as resolveEvalRunOutcome, inlined so tests do not load runner.ts.
    const codegenOutcome =
      summary.providerErrors > 0 || summary.suiteAborted
        ? "provider_error"
        : summary.infraErrors > 0
          ? "infra_error"
          : summary.evaluated > 0 && summary.passed < summary.evaluated
            ? "quality_fail"
            : "pass";
    codegen = codegenLaneFromRun(codegenOutcome, summary, promptIds.length, {
      forced: plan.forced,
    });
  } else {
    const { runEval, resolveEvalRunOutcome } = await import("./runner");
    const { formatEvalReport } = await import("./report");
    const { EVAL_PROMPTS } = await import("./prompts");
    const { loadBaseline, saveBaseline, compareWithBaseline } = await import("./baseline");

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
    codegenReport = await runEval({ prompts, dumpMode: options.dumpMode });
    print(formatEvalReport(codegenReport));

      const { summary } = codegenReport;
      const runBlocked = summary.providerErrors > 0 || summary.infraErrors > 0;
      let gateFailed = false;

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
            `Baseline comparison (informational): overall delta ${(comparison.overallDelta * 100).toFixed(1)}%, gate ${comparison.gateResult}`,
          );
          gateFailed = comparison.gateResult === "fail";
          if (options.gate && gateFailed) {
            print("Gate failed: regression detected.");
          }
        } else if (options.gate) {
          print("No baseline found. Run with --save-baseline to create one.");
        }
        if (
          shouldSaveBaseline({
            saveBaseline: Boolean(options.saveBaseline),
            gateFailed: Boolean(options.gate && gateFailed),
            codegenBlocked: runBlocked,
            followup: followup.outcome,
            scaffold: scaffold.outcome,
          })
        ) {
          await saveBaseline(codegenReport);
          print("Baseline saved to src/lib/gen/eval/eval-baseline.json");
        }
      }

    const codegenOutcome = resolveEvalRunOutcome({
      summary,
      gateFailed: Boolean(options.gate && gateFailed),
    });
    codegen = codegenLaneFromRun(codegenOutcome, summary, prompts.length, {
      forced: plan.forced,
    });
  }

  const outcome = resolveCanonicalOutcome({
    followup: followup.outcome,
    scaffold: scaffold.outcome,
    codegen: codegen.outcome,
  });

  return {
    result: {
      timestamp: new Date().toISOString(),
      mode: options.mode,
      outcome,
      lanes: { followup, scaffold, codegen },
    },
    codegenReport,
  };
}
