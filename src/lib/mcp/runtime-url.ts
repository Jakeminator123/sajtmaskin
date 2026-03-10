import { Sandbox } from "@vercel/sandbox";
import { buildPreviewUrl } from "@/lib/gen/preview";

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

export function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || filePath.includes("\0")) return false;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  if (filePath.includes("..")) return false;
  return /^[A-Za-z0-9._/-]+$/.test(filePath);
}

export function buildOwnEnginePreviewRuntime(params: {
  chatId: string;
  versionId: string | null;
  projectId?: string | null;
}) {
  const paramsForUrl = new URLSearchParams({
    chatId: params.chatId,
  });
  if (params.versionId) {
    paramsForUrl.set("versionId", params.versionId);
  }
  if (params.projectId) {
    paramsForUrl.set("projectId", params.projectId);
  }

  return {
    mode: "preview" as const,
    chatId: params.chatId,
    versionId: params.versionId,
    projectId: params.projectId ?? null,
    url: params.versionId
      ? buildPreviewUrl(params.chatId, params.versionId, params.projectId)
      : `/api/preview-render?${paramsForUrl.toString()}`,
  };
}

export async function createSandboxRuntimeFromFiles(
  files: RuntimeFile[],
  options: SandboxRuntimeOptions = {},
) {
  if (files.length > MAX_FILES) {
    throw new Error(`Too many files for sandbox (${files.length} > ${MAX_FILES})`);
  }

  let totalBytes = 0;
  for (const file of files) {
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

  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!oidcToken && (!token || !teamId || !projectId)) {
    throw new Error(
      "Sandbox requires authentication. Run `vercel link` then `vercel env pull`, or set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.",
    );
  }

  const runtime = options.runtime ?? "node24";
  const vcpus = options.vcpus ?? 2;
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  const installCommand = options.installCommand ?? "npm install";
  const startCommand = options.startCommand ?? "npm run dev";
  const ports = options.ports ?? [3000];

  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: "https://github.com/vercel/sandbox-example-next.git",
    },
    resources: { vcpus },
    timeout: timeoutMs,
    ports,
    runtime,
  });

  try {
    await sandbox.writeFiles(
      files.map((file) => ({
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
