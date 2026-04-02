/**
 * Shared Vercel Sandbox quality gate (install → typecheck / build / lint).
 * Used by POST /quality-gate, server-verify/repair loops, and manual /repair re-verify.
 */
import type { CodeFile } from "@/lib/gen/parser";
import {
  getSandboxCommandTextOutput,
  isSafeRelativePath,
  isSandboxConfigured,
  resolveSandboxAccessCredentials,
  resolveSandboxTemplateGitUrl,
} from "@/lib/mcp/runtime-url";

export type SandboxQualityGateCheckResult = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
};

export class SandboxNotConfiguredError extends Error {
  constructor() {
    super("Sandbox not configured (missing VERCEL_OIDC_TOKEN or VERCEL_TOKEN+TEAM_ID+PROJECT_ID)");
    this.name = "SandboxNotConfiguredError";
  }
}

/** Base shell commands (no `2>&1`); stderr is merged via log file in runSandboxChecks. */
export const SANDBOX_QUALITY_GATE_COMMANDS: Record<string, string> = {
  typecheck: "npx tsc --noEmit",
  build: "npx next build",
  lint: "npx eslint . --max-warnings=0",
};

const OUTPUT_CAP_BY_STAGE: Record<string, number> = {
  install: 16_000,
  typecheck: 12_000,
  build: 14_000,
  lint: 12_000,
  default: 12_000,
};

function clipStageOutput(stage: string, rawOutput: string): string {
  const normalized = rawOutput.trim();
  if (!normalized) return "";
  const cap = OUTPUT_CAP_BY_STAGE[stage] ?? OUTPUT_CAP_BY_STAGE.default;
  if (normalized.length <= cap) return normalized;
  const head = Math.floor(cap * 0.35);
  const tail = Math.max(0, cap - head - 64);
  const omitted = Math.max(0, normalized.length - head - tail);
  return [
    normalized.slice(0, head).trimEnd(),
    `...[${stage} output truncated: ${omitted} chars omitted]...`,
    normalized.slice(-tail).trimStart(),
  ]
    .filter(Boolean)
    .join("\n");
}

type SandboxFileLike = {
  name: string;
  content: string;
};

function projectOwnsLintSetup(sandboxFiles: SandboxFileLike[]): boolean {
  const names = new Set(sandboxFiles.map((file) => file.name.replace(/\\/g, "/").toLowerCase()));
  if (
    names.has("eslint.config.mjs") ||
    names.has("eslint.config.js") ||
    names.has("eslint.config.cjs") ||
    names.has(".eslintrc") ||
    names.has(".eslintrc.js") ||
    names.has(".eslintrc.cjs") ||
    names.has(".eslintrc.json")
  ) {
    return true;
  }

  const packageJson = sandboxFiles.find((file) => file.name === "package.json");
  if (!packageJson) return false;

  try {
    const parsed = JSON.parse(packageJson.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = {
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
    };
    const depNames = Object.keys(deps);
    if (depNames.some((name) => name === "eslint" || name.startsWith("eslint-") || name.startsWith("@eslint/"))) {
      return true;
    }
    return typeof parsed.scripts?.lint === "string" && parsed.scripts.lint.trim().length > 0;
  } catch {
    return false;
  }
}

function buildCheckShellScript(baseCmd: string, logFile: string): string {
  return [
    "set +e",
    `${baseCmd} > "${logFile}" 2>&1`,
    "ec=$?",
    `cat "${logFile}" 2>/dev/null || true`,
    `rm -f "${logFile}" 2>/dev/null || true`,
    "exit $ec",
  ].join("\n");
}

export function exportableToSandboxFiles(files: CodeFile[]): SandboxFileLike[] {
  return files
    .filter((f) => f.content != null && isSafeRelativePath(f.path))
    .map((f) => ({ name: f.path, content: f.content as string }));
}

/**
 * Run install + checks in sandbox. Throws SandboxNotConfiguredError if auth is missing.
 */
export async function runSandboxQualityGateChecks(
  sandboxFiles: SandboxFileLike[],
  checks: Array<"typecheck" | "build" | "lint">,
): Promise<{ results: SandboxQualityGateCheckResult[]; sandboxDurationMs: number }> {
  if (!isSandboxConfigured()) {
    throw new SandboxNotConfiguredError();
  }
  const { Sandbox } = await import("@vercel/sandbox");
  const access = resolveSandboxAccessCredentials();

  const startMs = Date.now();
  const sandbox = await Sandbox.create({
    ...(access ?? {}),
    source: {
      type: "git",
      url: resolveSandboxTemplateGitUrl(),
    },
    resources: { vcpus: 2 },
    timeout: 90_000,
    ports: [3000],
    runtime: "node24",
  });

  try {
    const writePayload = sandboxFiles
      .filter((file) => isSafeRelativePath(file.name))
      .map((file) => ({
        path: file.name,
        content: Buffer.from(file.content, "utf-8"),
      }));
    if (writePayload.length > 0) {
      await sandbox.writeFiles(writePayload);
    }

    const results: SandboxQualityGateCheckResult[] = [];
    const ownsLintSetup = projectOwnsLintSetup(sandboxFiles);
    const logSuffix = `${startMs}-${Math.random().toString(36).slice(2, 9)}`;
    const installLogFile = `/tmp/sajtmaskin-qg-install-${logSuffix}.log`;
    const installScript = buildCheckShellScript("npm install --prefer-offline", installLogFile);
    const installResult = await sandbox.runCommand({ cmd: "bash", args: ["-c", installScript] });
    const installExitCode = installResult.exitCode ?? 1;
    let installOutput = clipStageOutput(
      "install",
      await getSandboxCommandTextOutput(installResult),
    );
    if (!installOutput) {
      installOutput = [
        `(No log output captured from sandbox; exit ${installExitCode}.)`,
        "Command: npm install --prefer-offline",
        "If this persists, the sandbox runner may not be streaming stdout; check Vercel Sandbox logs.",
      ].join("\n");
    }
    results.push({
      check: "install",
      passed: installExitCode === 0,
      exitCode: installExitCode,
      output:
        installExitCode === 0
          ? "npm install --prefer-offline passed."
          : installOutput,
    });
    if (installExitCode !== 0) {
      return { results, sandboxDurationMs: Date.now() - startMs };
    }

    for (const check of checks) {
      if (check === "lint" && !ownsLintSetup) {
        results.push({
          check,
          passed: true,
          exitCode: 0,
          output:
            "Skipped lint: exported project does not include its own ESLint config or dependency set. This avoids false failures from the sandbox template's inherited eslint.config.mjs.",
        });
        continue;
      }
      const baseCmd = SANDBOX_QUALITY_GATE_COMMANDS[check];
      if (!baseCmd) continue;
      const logFile = `/tmp/sajtmaskin-qg-${check}-${logSuffix}.log`;
      const script = buildCheckShellScript(baseCmd, logFile);
      const result = await sandbox.runCommand({ cmd: "bash", args: ["-c", script] });
      let output = clipStageOutput(check, await getSandboxCommandTextOutput(result));
      const exitCode = result.exitCode ?? 1;
      const passed = exitCode === 0;
      if (!passed && !output) {
        output = [
          `(No log output captured from sandbox; exit ${exitCode}.)`,
          `Command: ${baseCmd}`,
          "If this persists, the sandbox runner may not be streaming stdout; check Vercel Sandbox logs.",
        ].join("\n");
      }
      results.push({
        check,
        passed,
        exitCode,
        output,
      });
    }

    return { results, sandboxDurationMs: Date.now() - startMs };
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

export function sandboxQualityGateAllPassed(results: SandboxQualityGateCheckResult[]): boolean {
  return results.length > 0 && results.every((r) => r.passed);
}

/**
 * Run gate on exportable project files. Returns null if sandbox is not configured.
 */
export async function runSandboxQualityGateOnExportable(
  exportable: CodeFile[],
  checks: Array<"typecheck" | "build" | "lint"> = ["typecheck", "build"],
): Promise<{ results: SandboxQualityGateCheckResult[]; sandboxDurationMs: number } | null> {
  if (!isSandboxConfigured()) return null;
  const sandboxFiles = exportableToSandboxFiles(exportable);
  return runSandboxQualityGateChecks(sandboxFiles, checks);
}

export type PostRepairGateDecision =
  | { promote: true; results: SandboxQualityGateCheckResult[]; sandboxDurationMs: number }
  | { promote: false; results: SandboxQualityGateCheckResult[] | null; sandboxDurationMs: number };

/**
 * After a repair: promote only if sandbox gate passes when sandbox is configured.
 * If sandbox is unavailable and the repair was triggered by quality-gate failures, do not promote.
 * If sandbox is unavailable and there was no gate context, allow promote (legacy / local dev).
 */
export async function shouldPromoteAfterRepair(
  exportable: CodeFile[],
  hadQualityGateFailures: boolean,
): Promise<PostRepairGateDecision> {
  const gate = await runSandboxQualityGateOnExportable(exportable, ["typecheck", "build"]);
  if (!gate) {
    if (hadQualityGateFailures) {
      return { promote: false, results: null, sandboxDurationMs: 0 };
    }
    return { promote: true, results: [], sandboxDurationMs: 0 };
  }
  if (!sandboxQualityGateAllPassed(gate.results)) {
    return { promote: false, results: gate.results, sandboxDurationMs: gate.sandboxDurationMs };
  }
  return { promote: true, results: gate.results, sandboxDurationMs: gate.sandboxDurationMs };
}
