import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildScorecard,
  formatEvalReport,
  formatScorecardReport,
  runEval,
  type CheckResult,
  type EvalReport,
} from "../src/lib/gen/eval";

const OUTPUT_DIR = path.join(process.cwd(), "EGEN_MOTOR_V2");
const TARGET_SCORE = 0.7;

const REPO_FILES = {
  createRoute: "src/app/api/v0/chats/stream/route.ts",
  followupRoute: "src/app/api/v0/chats/[chatId]/stream/route.ts",
  streamHandlers: "src/lib/hooks/chat/stream-handlers.ts",
  agentTools: "src/lib/gen/agent-tools.ts",
  detectIntegrations: "src/lib/gen/detect-integrations.ts",
  planPrompt: "src/lib/gen/plan-prompt.ts",
  planExecution: "src/lib/gen/plan-execution.ts",
  validateAndFix: "src/lib/gen/autofix/validate-and-fix.ts",
  orchestrate: "src/lib/gen/orchestrate.ts",
  generateSite: "src/lib/mcp/generate-site.ts",
  fallback: "src/lib/gen/fallback.ts",
  packageJson: "package.json",
} as const;

type RepoFileKey = keyof typeof REPO_FILES;

interface RepoNeedle {
  file: RepoFileKey;
  needle: string;
  label: string;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildOutputPath(prefix: string): string {
  return path.join(OUTPUT_DIR, `${prefix}-${new Date().toISOString().slice(0, 10)}.md`);
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

function loadRepoTexts(): Record<RepoFileKey, string> {
  return Object.fromEntries(
    Object.entries(REPO_FILES).map(([key, relativePath]) => [key, readRepoFile(relativePath)]),
  ) as Record<RepoFileKey, string>;
}

function aggregateEvalChecks(report: EvalReport): CheckResult[] {
  const grouped = new Map<string, CheckResult[]>();

  for (const result of report.results) {
    for (const check of result.checks) {
      const bucket = grouped.get(check.name) ?? [];
      bucket.push(check);
      grouped.set(check.name, bucket);
    }
  }

  return Array.from(grouped.entries()).map(([name, checks]) => {
    const score = average(checks.map((check) => check.score));
    const passedRatio =
      checks.length > 0
        ? checks.filter((check) => check.passed).length / checks.length
        : 0;

    return {
      name,
      passed: score >= TARGET_SCORE && passedRatio >= TARGET_SCORE,
      message:
        checks.length === 1
          ? checks[0].message
          : `Average ${(score * 100).toFixed(0)}% across ${checks.length} eval runs`,
      score,
    };
  });
}

function buildRepoCheck(
  repoTexts: Record<RepoFileKey, string>,
  name: string,
  successMessage: string,
  needles: RepoNeedle[],
): CheckResult {
  const missing = needles.filter(({ file, needle }) => !repoTexts[file].includes(needle));
  const score = (needles.length - missing.length) / needles.length;

  return {
    name,
    passed: score >= TARGET_SCORE,
    message:
      missing.length === 0
        ? successMessage
        : `Missing: ${missing.map((item) => item.label).join(", ")}`,
    score,
  };
}

function buildRepoCapabilityChecks(repoTexts: Record<RepoFileKey, string>): CheckResult[] {
  return [
    buildRepoCheck(repoTexts, "integration-detection", "Integration registry and signaling are wired", [
      { file: "detectIntegrations", needle: "const KNOWN_INTEGRATIONS", label: "integration registry" },
      { file: "detectIntegrations", needle: "export function detectIntegrations", label: "integration detector" },
      { file: "agentTools", needle: "suggestIntegration", label: "integration tool" },
    ]),
    buildRepoCheck(repoTexts, "env-var-coverage", "Env var prompts are covered in the engine flow", [
      { file: "detectIntegrations", needle: "envVars:", label: "env var mapping" },
      { file: "agentTools", needle: "requestEnvVar", label: "env var request tool" },
      { file: "streamHandlers", needle: "awaitingInput: true", label: "awaiting-input rendering" },
    ]),
    buildRepoCheck(repoTexts, "provider-guide", "Detected integrations include setup guides", [
      { file: "detectIntegrations", needle: "setupGuide", label: "setup guide metadata" },
      { file: "detectIntegrations", needle: "Skapa ett projekt på supabase.com", label: "provider-specific guide content" },
      { file: "detectIntegrations", needle: "results.push({", label: "detection result emission" },
    ]),
    buildRepoCheck(repoTexts, "plan-structure", "Plan prompt and emitted artifacts are implemented", [
      { file: "planPrompt", needle: "PLAN_SYSTEM_PROMPT", label: "planner system prompt" },
      { file: "agentTools", needle: "emitPlanArtifact", label: "plan artifact tool" },
      { file: "planExecution", needle: "createPlanRun", label: "plan state creation" },
    ]),
    buildRepoCheck(repoTexts, "plan-blockers", "Blocking questions flow from tools to client UI", [
      { file: "agentTools", needle: "askClarifyingQuestion", label: "clarifying-question tool" },
      { file: "streamHandlers", needle: "planBlockers", label: "plan blocker extraction" },
      { file: "streamHandlers", needle: "Awaiting input", label: "awaiting-input UI copy" },
    ]),
    buildRepoCheck(repoTexts, "plan-steps", "Plan execution helpers support phased work", [
      { file: "planExecution", needle: "createPlanRun", label: "plan run state" },
      { file: "planExecution", needle: "canAdvance", label: "phase advancement gate" },
      { file: "planExecution", needle: "buildPhasePrompt", label: "phase prompt builder" },
    ]),
    buildRepoCheck(repoTexts, "autofix-improvement", "Autofix records before/after validation metrics", [
      { file: "validateAndFix", needle: "fixerImproved", label: "fixer improvement flag" },
      { file: "validateAndFix", needle: "errorsBefore", label: "pre-fix error count" },
      { file: "validateAndFix", needle: "errorsAfter", label: "post-fix error count" },
    ]),
    buildRepoCheck(repoTexts, "multi-pass", "Validation runs across multiple fix passes", [
      { file: "validateAndFix", needle: "MAX_FIX_PASSES", label: "max pass constant" },
      { file: "validateAndFix", needle: "for (let pass = 1; pass <= MAX_FIX_PASSES; pass++)", label: "multi-pass loop" },
      { file: "validateAndFix", needle: "bestErrorCount", label: "best-pass tracking" },
    ]),
    buildRepoCheck(repoTexts, "validation-passes", "Validation exposes granular progress phases", [
      { file: "validateAndFix", needle: 'phase: "validating"', label: "validating phase" },
      { file: "validateAndFix", needle: 'phase: "fixing"', label: "fixing phase" },
      { file: "validateAndFix", needle: 'phase: "retrying"', label: "retrying phase" },
    ]),
    buildRepoCheck(repoTexts, "streaming-events", "Streaming emits progress and tool events end-to-end", [
      { file: "createRoute", needle: 'formatSSEEvent("progress"', label: "create-route progress event" },
      { file: "followupRoute", needle: 'formatSSEEvent("progress"', label: "follow-up progress event" },
      { file: "streamHandlers", needle: 'case "tool-call"', label: "tool-call client handler" },
    ]),
    buildRepoCheck(repoTexts, "progress-visibility", "Progress is rendered visibly in the chat UI", [
      { file: "createRoute", needle: "onProgress: (event, data) =>", label: "create-route progress callback" },
      { file: "followupRoute", needle: "onProgress: emitFinalizeProgress", label: "follow-up progress callback" },
      { file: "streamHandlers", needle: "tool:engine-${step}", label: "engine progress card rendering" },
    ]),
    buildRepoCheck(repoTexts, "tool-call-rendering", "Tool calls render as plans and awaiting-input cards", [
      { file: "streamHandlers", needle: 'case "tool-call"', label: "tool-call switch branch" },
      { file: "streamHandlers", needle: "awaitingInput: true", label: "awaiting-input state" },
      { file: "streamHandlers", needle: 'toolName: planBlockers ? "Plan: svar krävs" : "Awaiting input"', label: "tool-call UI label" },
    ]),
  ];
}

function buildBuildStackChecks(repoTexts: Record<RepoFileKey, string>): CheckResult[] {
  return [
    buildRepoCheck(repoTexts, "embeddings-ready", "Embeddings hooks are available for docs and scaffold matching", [
      { file: "packageJson", needle: '"docs:embeddings"', label: "docs embeddings script" },
      { file: "packageJson", needle: '"templates:embeddings"', label: "template embeddings script" },
      { file: "orchestrate", needle: "matchScaffoldWithEmbeddings(prompt, buildIntent)", label: "embedding-backed scaffold match" },
    ]),
    buildRepoCheck(repoTexts, "scaffold-routing", "Scaffold selection is centralized for own-engine flows", [
      { file: "orchestrate", needle: 'scaffoldMode === "manual"', label: "manual scaffold path" },
      { file: "orchestrate", needle: "persistedScaffoldId", label: "persisted scaffold reuse" },
      { file: "generateSite", needle: 'scaffoldMode === "auto"', label: "MCP scaffold auto mode" },
    ]),
    buildRepoCheck(repoTexts, "own-build-default", "Own-engine builds remain the primary path unless fallback is enabled", [
      { file: "fallback", needle: "export function shouldUseV0Fallback()", label: "fallback flag gate" },
      { file: "generateSite", needle: "supports the own engine only", label: "MCP own-engine guard" },
      { file: "createRoute", needle: "const usingV0Fallback = shouldUseV0Fallback();", label: "route fallback branching" },
    ]),
  ];
}

function formatCheckList(title: string, checks: CheckResult[]): string {
  const lines = [`## ${title}`, ""];

  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    lines.push(`- ${status} ${check.name}: ${check.message} (${(check.score * 10).toFixed(1)}/10)`);
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  console.info("[eval] Starting eval run...");

  const report = await runEval();
  const evalReportMarkdown = formatEvalReport(report);
  const repoTexts = loadRepoTexts();
  const aggregatedEvalChecks = aggregateEvalChecks(report);
  const repoChecks = buildRepoCapabilityChecks(repoTexts);
  const buildStackChecks = buildBuildStackChecks(repoTexts);
  const scorecard = buildScorecard([...aggregatedEvalChecks, ...repoChecks]);
  const scorecardMarkdown =
    `${formatScorecardReport(scorecard)}\n\n${formatCheckList("Build Stack Integration", buildStackChecks)}`.trim();

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const evalReportPath = buildOutputPath("eval-report");
  const scorecardPath = buildOutputPath("scorecard");
  writeFileSync(evalReportPath, evalReportMarkdown, "utf-8");
  writeFileSync(scorecardPath, scorecardMarkdown, "utf-8");

  console.info(`[eval] Eval report written to ${evalReportPath}`);
  console.info(`[eval] Scorecard written to ${scorecardPath}`);
  console.info("");
  console.info(evalReportMarkdown);
  console.info("");
  console.info(scorecardMarkdown);

  process.exitCode = scorecard.allTargetsMet ? 0 : 1;
}

main().catch((error) => {
  console.error("[eval] Fatal error:", error);
  process.exitCode = 1;
});
