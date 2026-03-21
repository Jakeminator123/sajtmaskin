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
  updateVersionSandboxUrl,
} from "@/lib/db/chat-repository-pg";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { isSafeRelativePath } from "@/lib/mcp/runtime-url";
import { getSandboxCredentials, isSandboxConfigured } from "@/lib/sandbox-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  versionId: z.string().min(1),
  checks: z
    .array(z.enum(["typecheck", "build", "lint"]))
    .optional()
    .default(["typecheck", "build"]),
  bootRuntime: z.boolean().optional().default(false),
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
  runtimeUrl?: string | null;
  sandboxId?: string | null;
  ports?: number[];
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

const CHECK_COMMANDS: Record<string, string> = {
  typecheck: "npx tsc --noEmit 2>&1",
  build: "npx next build 2>&1",
  lint: "npx eslint . --max-warnings=0 2>&1",
};

const RUNTIME_PORTS = [3000];
const RUNTIME_START_COMMAND = "npm run dev";
const WAIT_FOR_RUNTIME_SCRIPT = `
const http = require("node:http");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestStatus() {
  return new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:3000", (res) => {
      const status = res.statusCode || 0;
      res.resume();
      resolve(status);
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("timeout")));
  });
}

(async () => {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const status = await requestStatus();
      if (status > 0 && status < 500) {
        console.log("runtime-ready:" + status);
        process.exit(0);
      }
    } catch (error) {
      if (attempt === 44) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
    await wait(2000);
  }
  console.error("Timed out waiting for sandbox runtime on port 3000.");
  process.exit(1);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`.trim();

async function runSandboxChecks(
  sandboxFiles: Array<{ name: string; content: string }>,
  checks: string[],
  bootRuntime: boolean,
): Promise<{
  results: CheckResult[];
  sandboxDurationMs: number;
  runtimeUrl: string | null;
  sandboxId: string | null;
  ports: number[];
}> {
  if (!isSandboxConfigured()) {
    throw new SandboxNotConfiguredError();
  }

  const startMs = Date.now();
  let keepSandboxAlive = false;
  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: "https://github.com/vercel/sandbox-example-next.git",
    },
    resources: { vcpus: 2 },
    timeout: 90_000,
    ports: RUNTIME_PORTS,
    runtime: "node24",
    ...getSandboxCredentials(),
  });

  try {
    const invalidFile = sandboxFiles.find((file) => !isSafeRelativePath(file.name));
    if (invalidFile) {
      throw new Error(`Unsafe file path: ${invalidFile.name}`);
    }
    const writePayload = sandboxFiles.map((file) => ({
      path: file.name,
      content: Buffer.from(file.content, "utf-8"),
    }));
    if (writePayload.length > 0) {
      await sandbox.writeFiles(writePayload);
    }

    await sandbox.runCommand({ cmd: "bash", args: ["-c", "npm install --prefer-offline 2>&1 || true"] });

    const results: CheckResult[] = [];
    for (const check of checks) {
      const cmd = CHECK_COMMANDS[check];
      if (!cmd) continue;
      const result = await sandbox.runCommand({ cmd: "bash", args: ["-c", cmd] });
      const stdout = typeof result.stdout === "string" ? result.stdout : "";
      const stderr = typeof result.stderr === "string" ? result.stderr : "";
      const output = (stdout + "\n" + stderr).trim().slice(0, 8000);
      results.push({
        check,
        passed: result.exitCode === 0,
        exitCode: result.exitCode ?? 1,
        output,
      });
    }

    let runtimeUrl: string | null = null;
    if (bootRuntime && results.every((result) => result.passed)) {
      await sandbox.runCommand({
        cmd: "bash",
        args: ["-c", RUNTIME_START_COMMAND],
        detached: true,
      });

      const runtimeProbe = await sandbox.runCommand({
        cmd: "node",
        args: ["-e", WAIT_FOR_RUNTIME_SCRIPT],
      });
      const runtimeStdout = typeof runtimeProbe.stdout === "string" ? runtimeProbe.stdout : "";
      const runtimeStderr = typeof runtimeProbe.stderr === "string" ? runtimeProbe.stderr : "";
      const runtimeOutput = ([runtimeStdout, runtimeStderr] as string[])
        .filter((part) => part.trim().length > 0)
        .join("\n")
        .trim()
        .slice(0, 8000);

      results.push({
        check: "runtime",
        passed: runtimeProbe.exitCode === 0,
        exitCode: runtimeProbe.exitCode ?? 1,
        output: runtimeOutput || "No runtime probe output captured.",
      });

      if (runtimeProbe.exitCode === 0) {
        runtimeUrl = sandbox.domain(RUNTIME_PORTS[0]) || null;
        keepSandboxAlive = Boolean(runtimeUrl);
      }
    }

    return {
      results,
      sandboxDurationMs: Date.now() - startMs,
      runtimeUrl,
      sandboxId: keepSandboxAlive ? sandbox.sandboxId : null,
      ports: keepSandboxAlive ? RUNTIME_PORTS : [],
    };
  } finally {
    if (!keepSandboxAlive) {
      await sandbox.stop().catch(() => {});
    }
  }
}

class SandboxNotConfiguredError extends Error {
  constructor() {
    super("Sandbox not configured (missing VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID)");
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

    const { versionId, checks, bootRuntime } = validation.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
        return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const internalVersionId = scopedVersion.version.id;
    const codeFiles = await getVersionFiles(internalVersionId);
    if (codeFiles && codeFiles.length > 0) {
      if (!isSandboxConfigured()) {
        return NextResponse.json(
          { error: "Sandbox not configured (missing VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID)" },
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
        const { results, sandboxDurationMs, runtimeUrl, sandboxId, ports } = await runSandboxChecks(
          sandboxFiles,
          checks,
          bootRuntime,
        );

        const gateResult: GateResult = {
          passed: results.every((r) => r.passed),
          checks: results,
          sandboxDurationMs,
          runtimeUrl,
          sandboxId,
          ports,
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
          if (bootRuntime) {
            await updateVersionSandboxUrl(internalVersionId, runtimeUrl ?? null).catch((err) => {
              console.warn("[quality-gate] Failed to persist sandbox runtime URL:", err);
            });
          }
          await promoteVersion(internalVersionId, verificationSummary).catch((err) => {
            console.warn("[quality-gate] Failed to promote version:", err);
          });
        } else {
          if (bootRuntime) {
            await updateVersionSandboxUrl(internalVersionId, null).catch((err) => {
              console.warn("[quality-gate] Failed to clear sandbox runtime URL:", err);
            });
          }
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
