import { Sandbox } from "@vercel/sandbox";
import {
  resolveEngineDemoUrlDetails,
  type EngineDemoUrlVersionLike,
} from "@/lib/gen/demo-url";
import { prepareSandboxProjectFiles, type SandboxFile } from "@/lib/gen/sandbox-project-files";
import type { CodeFile } from "@/lib/gen/parser";
import { getSandboxCredentials, isSandboxConfigured } from "@/lib/sandbox-auth";

export type RuntimeMode = "preview" | "sandbox";

export type RuntimeFile = {
  name: string;
  content: string;
};

export type SandboxRuntimeOptions = {
  runtime?: "node24" | "node22" | "python3.13";
  vcpus?: number;
  timeoutMs?: number;
  installCommand?: string;
  startCommand?: string;
  ports?: number[];
};

const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 2_500_000;
const DEFAULT_SANDBOX_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_SANDBOX_BOOT_WAIT_MS = 90_000;

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

export function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || filePath.includes("\0")) return false;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  const segments = filePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return false;
  }
  return /^[A-Za-z0-9._/@()[\]-]+$/.test(filePath);
}

export function buildOwnEnginePreviewRuntime(params: {
  chatId: string;
  versionId: string | null;
  projectId?: string | null;
  sandboxUrl?: string | null;
  version?: EngineDemoUrlVersionLike | null;
}) {
  const version =
    params.version ??
    (params.versionId
      ? {
          id: params.versionId,
          sandboxUrl: params.sandboxUrl ?? null,
          verificationState: "pending",
        }
      : null);
  const resolved = version
    ? resolveEngineDemoUrlDetails(
        params.chatId,
        version,
        params.projectId,
      )
    : { demoUrl: null, legacyPreviewUrl: null, mode: "none" as const };

  return {
    mode: resolved.mode === "runtime" ? ("sandbox" as const) : ("preview" as const),
    chatId: params.chatId,
    versionId: version?.id ?? params.versionId,
    projectId: params.projectId ?? null,
    url: resolved.demoUrl ?? undefined,
  };
}

export async function createSandboxRuntimeFromFiles(
  files: RuntimeFile[],
  options: SandboxRuntimeOptions = {},
) {
  const codeFiles: CodeFile[] = files.map((f) => ({
    path: f.name,
    content: f.content,
    language: f.name.endsWith(".tsx") ? "tsx" : f.name.endsWith(".ts") ? "ts" : f.name.endsWith(".css") ? "css" : f.name.endsWith(".json") ? "json" : "text",
  }));
  const sandboxFiles: SandboxFile[] = prepareSandboxProjectFiles(codeFiles);

  if (sandboxFiles.length > MAX_FILES) {
    throw new Error(`Too many files for sandbox (${sandboxFiles.length} > ${MAX_FILES})`);
  }

  let totalBytes = 0;
  for (const file of sandboxFiles) {
    if (!isSafeRelativePath(file.name)) {
      throw new Error(`Unsafe file path: ${file.name}`);
    }
    totalBytes += Buffer.byteLength(file.content ?? "", "utf-8");
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Sandbox files too large (${totalBytes} bytes > ${MAX_TOTAL_BYTES})`,
      );
    }
  }

  if (!isSandboxConfigured()) {
    throw new Error(
      "Sandbox requires authentication. Set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID in .env.local.",
    );
  }

  const runtime = options.runtime ?? "node24";
  const vcpus = options.vcpus ?? 2;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS;
  const installCommand = options.installCommand ?? "npm install";
  const startCommand = options.startCommand ?? "npm run dev";
  const ports = options.ports && options.ports.length > 0 ? options.ports : [3000];

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

  try {
    await sandbox.writeFiles(
      sandboxFiles.map((file) => ({
        path: file.name,
        content: Buffer.from(file.content, "utf-8"),
      })),
    );

    await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", installCommand],
    });

    await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", startCommand],
      detached: true,
    });

    const runtimeProbe = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", `node -e ${JSON.stringify(buildWaitForPortReadyScript(ports[0], DEFAULT_SANDBOX_BOOT_WAIT_MS))}`],
    });
    if (runtimeProbe.exitCode !== 0) {
      throw new Error("Sandbox runtime did not become ready in time.");
    }

    const urls: Record<number, string> = {};
    for (const port of ports) {
      urls[port] = sandbox.domain(port);
    }

    return {
      mode: "sandbox" as const,
      sandboxId: sandbox.sandboxId,
      urls,
      primaryUrl: urls[ports[0]] || null,
      runtime,
      ports,
    };
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}
