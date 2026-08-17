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
  promptIds: string[] | null;
}

export function parseCanonicalEvalArgs(args: string[]): CanonicalEvalArgs {
  const json = args.includes("--json");
  const gate = args.includes("--gate");
  const saveBaseline = args.includes("--save-baseline");
  const wantsFull = args.includes("--full");
  const wantsCodegen = args.includes("--codegen") || args.includes("--smoke");
  const promptIds = parsePromptFilter(args);
  const dumpMode = parseDumpModeFlag(args);

  let mode: CanonicalEvalMode = "free";
  // --gate / --save-baseline are the old full-suite flags the baseline
  // workflow still calls without --full. They must not silently become free.
  if (wantsFull || gate || saveBaseline) mode = "codegen-full";
  else if (wantsCodegen || promptIds) mode = "codegen-smoke";

  return { mode, json, dumpMode, gate, saveBaseline, promptIds };
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

export function scaffoldLaneFromReport(
  report: ScaffoldEvalReport,
  reportPath: string,
): CanonicalScaffoldLane {
  return {
    name: "scaffold",
    outcome: "pass",
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
): CanonicalCodegenLane {
  if (outcome === "skipped") {
    return { name: "codegen", outcome: "skipped", summary: null, promptCount: 0 };
  }
  const laneOutcome: CanonicalLaneOutcome =
    outcome === "quality_fail" ? "fail" : outcome === "pass" ? "pass" : outcome;
  return { name: "codegen", outcome: laneOutcome, summary, promptCount };
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
  promptIds?: string[] | null;
  print?: (line: string) => void;
}): Promise<{ result: CanonicalEvalResult; codegenReport: EvalReport | null }> {
  const print = options.print ?? ((line: string) => console.info(line));
  const { runFollowUpContextEval, formatFollowUpContextEvalReport } = await import(
    "./follow-up-context"
  );
  const {
    loadScaffoldEvalCasesFromFile,
    resolveDefaultScaffoldEvalPath,
    runScaffoldSelectionEval,
    writeScaffoldSelectionReport,
  } = await import("@/lib/gen/scaffolds/scaffold-eval");

  print("Lane followup (free)...");
  const followupResults = await runFollowUpContextEval();
  print(formatFollowUpContextEvalReport(followupResults));
  const followup = followupLaneFromResults(followupResults);

  print("Lane scaffold (free)...");
  const evalCases = await loadScaffoldEvalCasesFromFile(
    resolveDefaultScaffoldEvalPath(process.cwd()),
  );
  const scaffoldReport = await runScaffoldSelectionEval(evalCases);
  const written = await writeScaffoldSelectionReport(scaffoldReport);
  print(
    `[scaffold] cases=${scaffoldReport.summary.total} keyword_top1=${scaffoldReport.summary.keywordTop1Accuracy}% semantic_top1=${scaffoldReport.summary.semanticTop1Accuracy}% wrote ${written.latestPath}`,
  );
  const scaffold = scaffoldLaneFromReport(scaffoldReport, written.latestPath);

  let codegen = codegenLaneFromRun("skipped", null, 0);
  let codegenReport: EvalReport | null = null;

  if (options.mode !== "free") {
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
    codegen = codegenLaneFromRun(codegenOutcome, summary, prompts.length);
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
