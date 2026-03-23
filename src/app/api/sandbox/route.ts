import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import ms, { StringValue } from "ms";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareSandboxProjectFiles } from "@/lib/gen/sandbox-project-files";
import type { CodeFile } from "@/lib/gen/parser";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { isSafeRelativePath } from "@/lib/mcp/runtime-url";
import { getSandboxCredentials, isSandboxConfigured } from "@/lib/sandbox-auth";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";

const createSandboxSchema = z.object({
  source: z.object({
    type: z.literal("version"),
    chatId: z.string().min(1),
    versionId: z.string().min(1),
  }),
  timeout: z.string().optional().default("10m"),
  ports: z.array(z.number()).min(1).optional().default([3000]),
  runtime: z.enum(["node24", "node22", "python3.13"]).optional().default("node24"),
  vcpus: z.number().min(1).max(8).optional().default(2),
});

const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 2_500_000;
const INSTALL_COMMAND = "npm install";
const START_COMMAND = "npm run dev";
const RUNTIME_BOOT_WAIT_MS = 90_000;

function buildWaitForPortReadyScript(port: number, timeoutMs: number): string {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 2_000));
  return `
const http = require("node:http");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestStatus() {
  return new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:${port}", (res) => {
      const status = res.statusCode || 0;
      res.resume();
      resolve(status);
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("timeout")));
  });
}

(async () => {
  for (let attempt = 0; attempt < ${attempts}; attempt += 1) {
    try {
      const status = await requestStatus();
      if (status > 0 && status < 500) {
        console.log("runtime-ready:" + status);
        process.exit(0);
      }
    } catch (error) {
      if (attempt === ${attempts - 1}) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
    await wait(2000);
  }
  console.error("Timed out waiting for sandbox runtime on port ${port}.");
  process.exit(1);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
  `.trim();
}

function inferLanguage(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "ts";
  if (normalized.endsWith(".jsx")) return "jsx";
  if (normalized.endsWith(".js")) return "js";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "md";
  return "text";
}

function buildSandboxProjectFiles(codeFiles: CodeFile[]): Array<[string, string]> {
  const completedFiles = prepareSandboxProjectFiles(codeFiles);
  return completedFiles.map((file) => [file.name, file.content]);
}

function withSessionCookie(
  response: NextResponse,
  setCookie: string | null,
): NextResponse {
  if (setCookie) {
    response.headers.append("Set-Cookie", setCookie);
  }
  return response;
}

export async function POST(req: Request) {
  return withRateLimit(req, "sandbox:create", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      if (!isSandboxConfigured()) {
        return NextResponse.json(
          {
            error: "Sandbox requires authentication",
            setup:
              "Set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID in .env.local",
          },
          { status: 401 },
        );
      }

      const session = ensureSessionIdFromRequest(req);
      const body = await req.json();
      const validationResult = createSandboxSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const { source, timeout, ports, runtime, vcpus } = validationResult.data;

      const timeoutMs = ms(timeout as StringValue);
      const scopedVersion = await getEngineVersionForChatByIdForRequest(
        req,
        source.chatId,
        source.versionId,
        { sessionId: session.sessionId },
      );
      if (!scopedVersion) {
        return withSessionCookie(
          NextResponse.json({ error: "Version not found for chat" }, { status: 404 }),
          session.setCookie,
        );
      }
      const versionFiles = await getVersionFiles(scopedVersion.version.id);
      if (!versionFiles || versionFiles.length === 0) {
        return withSessionCookie(
          NextResponse.json({ error: "No files found for this version" }, { status: 404 }),
          session.setCookie,
        );
      }
      const normalizedFiles: CodeFile[] = versionFiles.map((file) => ({
        path: file.path,
        content: String(file.content ?? ""),
        language: file.language || inferLanguage(file.path),
      }));
      const fileEntries = buildSandboxProjectFiles(normalizedFiles);
      if (fileEntries.length > MAX_FILES) {
        return withSessionCookie(
          NextResponse.json(
            { error: `Too many files for sandbox (${fileEntries.length} > ${MAX_FILES})` },
            { status: 413 },
          ),
          session.setCookie,
        );
      }

      let totalBytes = 0;
      for (const [filePath, content] of fileEntries) {
        if (!isSafeRelativePath(filePath)) {
          return withSessionCookie(
            NextResponse.json({ error: `Unsafe file path: ${filePath}` }, { status: 400 }),
            session.setCookie,
          );
        }
        totalBytes += Buffer.byteLength(content ?? "", "utf8");
        if (totalBytes > MAX_TOTAL_BYTES) {
          return withSessionCookie(
            NextResponse.json(
              { error: `Sandbox files too large (${totalBytes} bytes > ${MAX_TOTAL_BYTES})` },
              { status: 413 },
            ),
            session.setCookie,
          );
        }
      }

      const sandbox = await Sandbox.create({
        source: {
          type: "git",
          url: "https://github.com/vercel/sandbox-example-next.git",
        },
        resources: { vcpus },
        timeout: timeoutMs,
        ports,
        runtime,
        ...getSandboxCredentials(),
      });

      const sandboxId = sandbox.sandboxId;

      try {
        if (fileEntries) {
          const writePayload = fileEntries.map(([filePath, content]) => ({
            path: filePath,
            content: Buffer.from(String(content ?? ""), "utf-8"),
          }));
          if (writePayload.length > 0) {
            await sandbox.writeFiles(writePayload);
          }
        }

        const installResult = await sandbox.runCommand({
          cmd: "bash",
          args: ["-c", INSTALL_COMMAND],
        });

        if (installResult.exitCode !== 0) {
          console.error("Install failed with exit code:", installResult.exitCode);
        }

        await sandbox.runCommand({
          cmd: "bash",
          args: ["-c", START_COMMAND],
          detached: true,
        });

        const runtimeProbe = await sandbox.runCommand({
          cmd: "bash",
          args: ["-c", `node -e ${JSON.stringify(buildWaitForPortReadyScript(ports[0], RUNTIME_BOOT_WAIT_MS))}`],
        });
        if (runtimeProbe.exitCode !== 0) {
          throw new Error("Sandbox runtime did not become ready in time.");
        }

        const urls: Record<number, string> = {};
        for (const port of ports) {
          urls[port] = sandbox.domain(port);
        }

        return withSessionCookie(
          NextResponse.json({
            success: true,
            sandboxId,
            urls,
            primaryUrl: urls[ports[0]] || null,
            timeout,
            runtime,
            ports,
          }),
          session.setCookie,
        );
      } catch (err) {
        try {
          await sandbox.stop();
        } catch (stopError) {
          console.error("Failed to stop sandbox after error:", stopError);
        }
        throw err;
      }
    } catch (err) {
      console.error("Error creating sandbox:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to create sandbox" },
        { status: 500 },
      );
    }
  });
}

export async function GET(req: Request) {
  void req;
  return NextResponse.json(
    { error: "Sandbox status lookup is disabled on this route." },
    { status: 405 },
  );
}

export async function DELETE(req: Request) {
  void req;
  return NextResponse.json(
    { error: "Sandbox deletion is disabled on this route." },
    { status: 405 },
  );
}
