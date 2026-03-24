import { Sandbox } from "@vercel/sandbox";
import { buildPreviewUrl } from "@/lib/gen/preview";

export type RuntimeMode = "preview" | "sandbox";

/**
 * Credentials for @vercel/sandbox when not using VERCEL_OIDC_TOKEN.
 * The SDK does not read VERCEL_TOKEN from the environment by itself — it must be
 * passed into Sandbox.create() together with teamId and projectId. See:
 * https://vercel.com/docs/vercel-sandbox/concepts/authentication#access-tokens
 */
export type SandboxAccessCredentials = {
  token: string;
  teamId: string;
  projectId: string;
};

/**
 * Pick which env var holds the Vercel access token when both VERCEL_TOKEN and
 * VERCEL_TOKEN_FULL are set. Prefer the value that looks like a current access
 * token (e.g. vcp_…) so an old short VERCEL_TOKEN does not shadow VERCEL_TOKEN_FULL.
 */
function pickVercelAccessTokenFromEnv(): string {
  const primary = process.env.VERCEL_TOKEN?.trim() ?? "";
  const secondary = process.env.VERCEL_TOKEN_FULL?.trim() ?? "";
  const looksLikeModernAccess = (t: string) =>
    t.startsWith("vcp_") || t.startsWith("vercel_");
  if (secondary && looksLikeModernAccess(secondary) && !looksLikeModernAccess(primary)) {
    return secondary;
  }
  return primary || secondary;
}

/**
 * Resolve access-token auth for Sandbox.create(). Supports VERCEL_ORG_ID (CLI)
 * and VERCEL_TOKEN_FULL (optional alias for local .env only).
 */
export function resolveSandboxAccessCredentials(): SandboxAccessCredentials | null {
  const token = pickVercelAccessTokenFromEnv();
  const teamId =
    process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim() || "";
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() || "";
  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }
  return null;
}

export function isSandboxConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_OIDC_TOKEN?.trim() || resolveSandboxAccessCredentials(),
  );
}

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

  const access = resolveSandboxAccessCredentials();
  if (!process.env.VERCEL_OIDC_TOKEN?.trim() && !access) {
    throw new Error(
      "Sandbox requires authentication. Either set VERCEL_OIDC_TOKEN (vercel link && vercel env pull), or set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID (team id = .vercel/project.json orgId). Optional: VERCEL_ORG_ID instead of VERCEL_TEAM_ID; VERCEL_TOKEN_FULL instead of VERCEL_TOKEN.",
    );
  }

  const runtime = options.runtime ?? "node24";
  const vcpus = options.vcpus ?? 2;
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  const installCommand = options.installCommand ?? "npm install";
  const startCommand = options.startCommand ?? "npm run dev";
  const ports = options.ports ?? [3000];

  const sandbox = await Sandbox.create({
    ...(access ?? {}),
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

    const installResult = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", installCommand],
    });
    const installOut =
      `${typeof installResult.stdout === "string" ? installResult.stdout : ""}\n${typeof installResult.stderr === "string" ? installResult.stderr : ""}`.trim();
    const installExit = installResult.exitCode ?? 1;
    if (installExit !== 0) {
      const snippet = installOut.slice(0, 6000) || "No output from sandbox.";
      throw new Error(`npm install failed (exit ${installExit}). ${snippet}`);
    }

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
