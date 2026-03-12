import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import { assertV0Key } from "@/lib/v0";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import { createEngineVersionErrorLogs, createVersionErrorLogs } from "@/lib/db/services";
import { db, dbConfigured } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  failVersionVerification,
  getVersionById,
  markVersionVerifying,
  promoteVersion,
} from "@/lib/db/chat-repository-pg";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";

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

const CHECK_COMMANDS: Record<string, string> = {
  typecheck: "npx tsc --noEmit 2>&1",
  build: "npx next build 2>&1",
  lint: "npx eslint . --max-warnings=0 2>&1",
};

function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes("\0")) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("..")) return false;
  return /^[A-Za-z0-9._/@-]+$/.test(path);
}

async function resolveInternalVersionId(chatId: string, versionId: string) {
  if (!dbConfigured) return null;
  const byInternal = await db
    .select()
    .from(versions)
    .where(and(eq(versions.chatId, chatId), eq(versions.id, versionId)))
    .limit(1);
  if (byInternal.length > 0) return byInternal[0];
  const byV0 = await db
    .select()
    .from(versions)
    .where(and(eq(versions.chatId, chatId), eq(versions.v0VersionId, versionId)))
    .limit(1);
  return byV0[0] ?? null;
}

async function runSandboxChecks(
  sandboxFiles: Array<{ name: string; content: string }>,
  checks: string[],
): Promise<{ results: CheckResult[]; sandboxDurationMs: number }> {
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!oidcToken && (!token || !teamId || !projectId)) {
    throw new SandboxNotConfiguredError();
  }

  const startMs = Date.now();
  const sandbox = await Sandbox.create({
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

function isSandboxConfigured(): boolean {
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  return Boolean(oidcToken || (token && teamId && projectId));
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

    // ---------------------------------------------------------------
    // Non-fallback: fetch files from Postgres engine store
    // ---------------------------------------------------------------
    if (!shouldUseV0Fallback()) {
      const versionObj = await getVersionById(versionId);
      if (versionObj && versionObj.chat_id !== chatId) {
        return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
      }

      const codeFiles = await getVersionFiles(versionId);
      if (versionObj && codeFiles && codeFiles.length > 0) {
        if (!isSandboxConfigured()) {
          return NextResponse.json(
            { error: "Sandbox not configured (missing VERCEL_OIDC_TOKEN or VERCEL_TOKEN+TEAM_ID+PROJECT_ID)" },
            { status: 501 },
          );
        }

        const completeProjectFiles = repairGeneratedFiles(buildCompleteProject(codeFiles)).files;
        const sandboxFiles = completeProjectFiles
          .filter((f) => f.content != null)
          .map((f) => ({ name: f.path, content: f.content }));

        await markVersionVerifying(versionId).catch((err) => {
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
              versionId,
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
                versionId,
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
            await promoteVersion(versionId, verificationSummary).catch((err) => {
              console.warn("[quality-gate] Failed to promote version:", err);
            });
          } else {
            await failVersionVerification(versionId, verificationSummary).catch((err) => {
              console.warn("[quality-gate] Failed to mark version failed:", err);
            });
          }

          return NextResponse.json(gateResult);
        } catch (err) {
          await failVersionVerification(versionId, "Automatic verification could not complete.").catch(
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
    }

    // ---------------------------------------------------------------
    // V0 fallback: existing flow
    // ---------------------------------------------------------------
    assertV0Key();

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const resolved = await resolveVersionFiles({
      chatId,
      versionId,
      options: { maxAttempts: 12, delayMs: 1500, minFiles: 1, includeDefaultFiles: true },
    });
    const files = resolved.files.filter((f) => f.content != null);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files found for version" }, { status: 404 });
    }

    const sandboxFiles = files.map((f) => ({
      name: f.name,
      content: String(f.content ?? ""),
    }));

    try {
      const { results, sandboxDurationMs } = await runSandboxChecks(sandboxFiles, checks);

      const gateResult: GateResult = {
        passed: results.every((r) => r.passed),
        checks: results,
        sandboxDurationMs,
      };

      const version = await resolveInternalVersionId(dbChat.id, versionId);
      if (version) {
        const logs = [
          {
            chatId: dbChat.id,
            versionId: version.id,
            v0VersionId: version.v0VersionId,
            ...buildQualityGateSummaryLog({
              checkResults: results,
              sandboxDurationMs,
            }),
          },
          ...results
          .filter((r) => !r.passed)
          .map((r) => ({
            chatId: dbChat.id,
            versionId: version.id,
            v0VersionId: version.v0VersionId,
            level: "error" as const,
            category: `quality-gate:${r.check}`,
            message: `${r.check} failed (exit ${r.exitCode})`,
            meta: { output: r.output.slice(0, 4000), exitCode: r.exitCode },
          })),
        ];
        if (logs.length > 0) {
          await createVersionErrorLogs(logs).catch((err) => {
            console.warn("[quality-gate] Failed to persist error logs:", err);
          });
        }
      }

      return NextResponse.json(gateResult);
    } catch (err) {
      if (err instanceof SandboxNotConfiguredError) {
        return NextResponse.json({ error: (err as Error).message }, { status: 501 });
      }
      throw err;
    }
  } catch (err) {
    console.error("[quality-gate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quality gate failed" },
      { status: 500 },
    );
  }
}
