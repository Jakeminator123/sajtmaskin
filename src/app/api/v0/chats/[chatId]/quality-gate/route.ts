import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import { assertV0Key } from "@/lib/v0";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import { createVersionErrorLogs } from "@/lib/db/services";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

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

const CHECK_COMMANDS: Record<string, string> = {
  typecheck: "npx tsc --noEmit 2>&1 || true",
  build: "npx next build 2>&1 || true",
  lint: "npx eslint . --max-warnings=0 2>&1 || true",
};

function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes("\0")) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("..")) return false;
  return /^[A-Za-z0-9._/@-]+$/.test(path);
}

function makeSafeHeredoc(content: string): { delimiter: string; body: string } {
  let delimiter = `GATE_EOF_${Math.random().toString(36).slice(2)}`;
  while (content.includes(delimiter)) {
    delimiter = `GATE_EOF_${Math.random().toString(36).slice(2)}`;
  }
  return { delimiter, body: content };
}

async function resolveInternalVersionId(chatId: string, versionId: string) {
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

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await ctx.params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, checks } = validation.data;

    const resolved = await resolveVersionFiles({
      chatId,
      versionId,
      options: { maxAttempts: 12, delayMs: 1500, minFiles: 1, includeDefaultFiles: true },
    });
    const files = resolved.files.filter((f) => f.content != null);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files found for version" }, { status: 404 });
    }

    const oidcToken = process.env.VERCEL_OIDC_TOKEN;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;

    if (!oidcToken && (!token || !teamId || !projectId)) {
      return NextResponse.json(
        { error: "Sandbox not configured (missing VERCEL_OIDC_TOKEN or VERCEL_TOKEN+TEAM_ID+PROJECT_ID)" },
        { status: 501 },
      );
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
      for (const file of files) {
        if (!isSafeRelativePath(file.name)) continue;
        const { delimiter, body: fileBody } = makeSafeHeredoc(String(file.content ?? ""));
        await sandbox.runCommand({
          cmd: "bash",
          args: [
            "-c",
            [
              `set -e`,
              `mkdir -p "$(dirname "${file.name}")"`,
              `cat > "${file.name}" <<'${delimiter}'`,
              fileBody,
              `${delimiter}`,
            ].join("\n"),
          ],
        });
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

      const gateResult: GateResult = {
        passed: results.every((r) => r.passed),
        checks: results,
        sandboxDurationMs: Date.now() - startMs,
      };

      const version = await resolveInternalVersionId(dbChat.id, versionId);
      if (version) {
        const logs = results
          .filter((r) => !r.passed)
          .map((r) => ({
            chatId: dbChat.id,
            versionId: version.id,
            v0VersionId: version.v0VersionId,
            level: "error" as const,
            category: `quality-gate:${r.check}`,
            message: `${r.check} failed (exit ${r.exitCode})`,
            meta: { output: r.output.slice(0, 4000), exitCode: r.exitCode },
          }));
        if (logs.length > 0) {
          await createVersionErrorLogs(logs).catch((err) => {
            console.warn("[quality-gate] Failed to persist error logs:", err);
          });
        }
      }

      return NextResponse.json(gateResult);
    } finally {
      await sandbox.stop().catch(() => {});
    }
  } catch (err) {
    console.error("[quality-gate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quality gate failed" },
      { status: 500 },
    );
  }
}
