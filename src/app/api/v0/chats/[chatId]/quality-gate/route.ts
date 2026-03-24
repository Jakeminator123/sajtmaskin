import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  failVersionVerification,
  markVersionVerifying,
  promoteVersion,
} from "@/lib/db/chat-repository-pg";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import {
  isSandboxConfigured as isSandboxAuthConfigured,
  resolveSandboxAccessCredentials,
} from "@/lib/mcp/runtime-url";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  versionId: z.string().min(1),
  checks: z
    .array(z.enum(["typecheck", "build", "lint"]))
    .optional()
    .default(["typecheck", "build"]),
});

type CheckResult = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
};

type GateResult = {
  passed: boolean;
  checks: CheckResult[];
  sandboxDurationMs: number;
};

function buildQualityGateSummaryLog(params: {
  checkResults: CheckResult[];
  sandboxDurationMs: number;
}) {
  const { checkResults, sandboxDurationMs } = params;
  return {
    level: checkResults.every((result) => result.passed) ? "info" as const : "error" as const,
    category: "preflight:quality-gate",
    message: checkResults.every((result) => result.passed)
      ? "Automatic quality gate passed."
      : "Automatic quality gate failed.",
    meta: {
      passed: checkResults.every((result) => result.passed),
      checks: checkResults.map((result) => ({
        check: result.check,
        passed: result.passed,
        exitCode: result.exitCode,
      })),
      sandboxDurationMs,
    },
  };
}

function buildVerificationSummary(checkResults: CheckResult[]): string {
  const failedChecks = checkResults.filter((result) => !result.passed).map((result) => result.check);
  if (failedChecks.length === 0) {
    return "Automatic verification passed.";
  }
  return `Automatic verification failed: ${failedChecks.join(", ")}.`;
}

/** Base shell commands (no `2>&1`); stderr is merged via log file in runSandboxChecks. */
const CHECK_COMMANDS: Record<string, string> = {
  typecheck: "npx tsc --noEmit",
  build: "npx next build",
  lint: "npx eslint . --max-warnings=0",
};

const OUTPUT_CAP = 12_000;

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

function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes("\0")) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("..")) return false;
  return /^[A-Za-z0-9._/@-]+$/.test(path);
}

async function runSandboxChecks(
  sandboxFiles: Array<{ name: string; content: string }>,
  checks: string[],
): Promise<{ results: CheckResult[]; sandboxDurationMs: number }> {
  const access = resolveSandboxAccessCredentials();
  if (!process.env.VERCEL_OIDC_TOKEN?.trim() && !access) {
    throw new SandboxNotConfiguredError();
  }

  const startMs = Date.now();
  const sandbox = await Sandbox.create({
    ...(access ?? {}),
    source: {
      type: "git",
      url: "https://github.com/vercel/sandbox-example-next.git",
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

    await sandbox.runCommand({ cmd: "bash", args: ["-c", "npm install --prefer-offline 2>&1 || true"] });

    const results: CheckResult[] = [];
    const logSuffix = `${startMs}-${Math.random().toString(36).slice(2, 9)}`;
    for (const check of checks) {
      const baseCmd = CHECK_COMMANDS[check];
      if (!baseCmd) continue;
      const logFile = `/tmp/sajtmaskin-qg-${check}-${logSuffix}.log`;
      const script = buildCheckShellScript(baseCmd, logFile);
      const result = await sandbox.runCommand({ cmd: "bash", args: ["-c", script] });
      const stdout = typeof result.stdout === "string" ? result.stdout : "";
      const stderr = typeof result.stderr === "string" ? result.stderr : "";
      let output = (stdout + "\n" + stderr).trim().slice(0, OUTPUT_CAP);
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

class SandboxNotConfiguredError extends Error {
  constructor() {
    super("Sandbox not configured (missing VERCEL_OIDC_TOKEN or VERCEL_TOKEN+TEAM_ID+PROJECT_ID)");
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, checks } = validation.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
        return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const internalVersionId = scopedVersion.version.id;
    const codeFiles = await getVersionFiles(internalVersionId);
    if (codeFiles && codeFiles.length > 0) {
      if (!isSandboxAuthConfigured()) {
        return NextResponse.json(
          { error: "Sandbox not configured (missing VERCEL_OIDC_TOKEN or VERCEL_TOKEN+TEAM_ID+PROJECT_ID)" },
          { status: 501 },
        );
      }

      const completeProjectFiles = repairGeneratedFiles(buildCompleteProject(codeFiles)).files;
      const sandboxFiles = completeProjectFiles
        .filter((f) => f.content != null)
        .map((f) => ({ name: f.path, content: f.content }));

      await markVersionVerifying(internalVersionId).catch((err) => {
          console.warn("[quality-gate] Failed to mark version verifying:", err);
      });

      try {
        const { results, sandboxDurationMs } = await runSandboxChecks(sandboxFiles, checks);

        const gateResult: GateResult = {
          passed: results.every((r) => r.passed),
          checks: results,
          sandboxDurationMs,
        };

        const logs = [
            {
              chatId,
              versionId: internalVersionId,
              ...buildQualityGateSummaryLog({
                checkResults: results,
                sandboxDurationMs,
              }),
            },
            ...results
            .filter((r) => !r.passed)
            .map((r) => {
              return {
                chatId,
                versionId: internalVersionId,
                level: "error" as const,
                category: `quality-gate:${r.check}`,
                message: `${r.check} failed (exit ${r.exitCode})`,
                meta: { output: r.output.slice(0, 4000), exitCode: r.exitCode },
              };
          }),
        ];
        if (logs.length > 0 && dbConfigured) {
          await createEngineVersionErrorLogs(logs).catch((err) => {
            console.warn("[quality-gate] Failed to persist error logs:", err);
          });
        }

        const verificationSummary = buildVerificationSummary(results);
        if (gateResult.passed) {
          await promoteVersion(internalVersionId, verificationSummary).catch((err) => {
            console.warn("[quality-gate] Failed to promote version:", err);
          });
        } else {
          await failVersionVerification(internalVersionId, verificationSummary).catch((err) => {
            console.warn("[quality-gate] Failed to mark version failed:", err);
          });
        }

        return NextResponse.json(gateResult);
      } catch (err) {
        await failVersionVerification(
          internalVersionId,
          "Automatic verification could not complete.",
        ).catch(
          (updateErr) => {
            console.warn("[quality-gate] Failed to mark version failed after error:", updateErr);
          },
        );
        if (err instanceof SandboxNotConfiguredError) {
          return NextResponse.json({ error: err.message }, { status: 501 });
        }
        throw err;
      }
    }

    return NextResponse.json({ error: "No files found for version" }, { status: 404 });
  } catch (err) {
    console.error("[quality-gate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quality gate failed" },
      { status: 500 },
    );
  }
}
