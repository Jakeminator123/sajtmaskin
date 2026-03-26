import { Sandbox } from "@vercel/sandbox";
import { buildPreviewUrl } from "@/lib/gen/preview";
import {
  isUsableVercelOidcToken,
  pickVercelAccessTokenFromEnv,
} from "@/lib/vercel";

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
  return Boolean(isUsableVercelOidcToken() || resolveSandboxAccessCredentials());
}

/**
 * Returned in API responses when sandbox auth is missing so local `npm run dev` and
 * operators know how to enable tier-2 preview. See `docs/architecture/archive/pre-2026-03-consolidation/vercel-sandbox-credentials.md`.
 */
export const SANDBOX_SETUP_HINT =
  "Lokal dev: kör `vercel link` och `vercel env pull` (VERCEL_OIDC_TOKEN), eller sätt VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID i .env.local. Se docs/architecture/archive/pre-2026-03-consolidation/vercel-sandbox-credentials.md.";

export type RuntimeFile = {
  name: string;
  content: string;
};

export type SandboxBuildVerification = {
  ok: boolean;
  exitCode: number | null;
  logSnippet: string;
};

/** How the sandbox combines Next dev server and `npm run build`. See `docs/architecture/preview-deploy.md` (detalj: arkiv `preview-fidelity-tiers.md`). */
export type SandboxPreviewMode = "dev_only" | "build_only" | "dev_then_build";

const SANDBOX_PREVIEW_MODE_VALUES = new Set<SandboxPreviewMode>([
  "dev_only",
  "build_only",
  "dev_then_build",
]);

/** Server env `SAJTMASKIN_SANDBOX_PREVIEW_MODE` — default `dev_only` (tier 2: install + dev, no sandbox `npm run build`). */
export function resolveSandboxPreviewModeFromEnv(): SandboxPreviewMode {
  const raw = process.env.SAJTMASKIN_SANDBOX_PREVIEW_MODE?.trim().toLowerCase().replace(/-/g, "_");
  if (raw && SANDBOX_PREVIEW_MODE_VALUES.has(raw as SandboxPreviewMode)) {
    return raw as SandboxPreviewMode;
  }
  return "dev_only";
}

export type SandboxRuntimeOptions = {
  runtime?: "node24" | "node22" | "python3.13";
  vcpus?: number;
  timeoutMs?: number;
  installCommand?: string;
  startCommand?: string;
  ports?: number[];
  /**
   * After `startCommand` (detached), run `npm run build` in the same sandbox.
   * Ignored when `sandboxPreviewMode` is `dev_only` or `build_only`.
   */
  verifyBuild?: boolean;
  /** Wall-clock cap for the build step only (Linux `timeout` in sandbox). Default 420s. */
  buildVerifyTimeoutSec?: number;
  /**
   * `build_only`: install + `npm run build` only (no dev server; `primaryUrl` is null).
   * `dev_only`: install + detached `npm run dev` — **tier 2** preview (default when env unset).
   * `dev_then_build`: install + detached dev + `npm run build` verification (tier 2 + tier-3 signal).
   * Default from env: `resolveSandboxPreviewModeFromEnv()` → **`dev_only`** unless `SAJTMASKIN_SANDBOX_PREVIEW_MODE` is set.
   */
  sandboxPreviewMode?: SandboxPreviewMode;
};

const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 2_500_000;

/** Status values that mean the dev server is not usable — skip resume and create fresh. */
const SANDBOX_NON_RUNNING_STATUS = new Set([
  "stopped",
  "terminated",
  "exited",
  "error",
  "failed",
  "cancelled",
  "canceled",
]);

/**
 * Reattach to an existing Vercel Sandbox by id (same credentials as `Sandbox.create`).
 * Returns a preview URL when the VM still exists and is not in a known terminal state.
 */
export async function tryResumeSandboxById(sandboxId: string): Promise<{
  sandboxId: string;
  primaryUrl: string;
} | null> {
  const id = sandboxId.trim();
  if (!id || !isSandboxConfigured()) return null;
  try {
    const sandbox = await Sandbox.get({ sandboxId: id });
    const statusRaw = sandbox.status;
    const status =
      typeof statusRaw === "string" ? statusRaw.trim().toLowerCase() : "";
    if (status && SANDBOX_NON_RUNNING_STATUS.has(status)) {
      return null;
    }
    const primaryUrl = sandbox.domain(3000)?.trim() ?? "";
    if (!primaryUrl) return null;
    return { sandboxId: sandbox.sandboxId, primaryUrl };
  } catch {
    return null;
  }
}

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
  if (!isUsableVercelOidcToken() && !access) {
    throw new Error(
      "Sandbox requires authentication. Either set VERCEL_OIDC_TOKEN (vercel link && vercel env pull), or set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID (team id = .vercel/project.json orgId). Optional: VERCEL_ORG_ID instead of VERCEL_TEAM_ID; VERCEL_TOKEN_FULL instead of VERCEL_TOKEN.",
    );
  }

  const runtime = options.runtime ?? "node24";
  const vcpus = options.vcpus ?? 2;
  const previewMode =
    options.sandboxPreviewMode ?? resolveSandboxPreviewModeFromEnv();
  /** Only `dev_then_build` runs this step; default remains opt-in (`verifyBuild === true`) for API compatibility. */
  const verifyBuild =
    previewMode === "dev_then_build" && options.verifyBuild === true;
  const runsProdBuild =
    previewMode === "build_only" ||
    (previewMode === "dev_then_build" && verifyBuild);
  const timeoutMs =
    options.timeoutMs ?? (runsProdBuild ? 12 * 60_000 : 5 * 60_000);
  const installCommand = options.installCommand ?? "npm install";
  const startCommand = options.startCommand ?? "npm run dev";
  const ports = options.ports ?? [3000];
  const buildVerifyTimeoutSec = Math.min(
    Math.max(60, options.buildVerifyTimeoutSec ?? 420),
    900,
  );

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

    let buildVerification: SandboxBuildVerification | undefined;

    if (previewMode === "build_only") {
      const buildResult = await sandbox.runCommand({
        cmd: "bash",
        args: ["-c", `timeout ${buildVerifyTimeoutSec}s npm run build`],
      });
      const buildStdout =
        typeof buildResult.stdout === "string" ? buildResult.stdout : "";
      const buildStderr =
        typeof buildResult.stderr === "string" ? buildResult.stderr : "";
      const buildOut = `${buildStdout}\n${buildStderr}`.trim();
      const exitCode =
        typeof buildResult.exitCode === "number" ? buildResult.exitCode : null;
      buildVerification = {
        ok: exitCode === 0,
        exitCode,
        logSnippet: buildOut.slice(-6000) || "(no build output)",
      };
    } else {
      await sandbox.runCommand({
        cmd: "bash",
        args: ["-c", startCommand],
        detached: true,
      });

      if (previewMode === "dev_then_build" && verifyBuild) {
        const buildResult = await sandbox.runCommand({
          cmd: "bash",
          args: ["-c", `timeout ${buildVerifyTimeoutSec}s npm run build`],
        });
        const buildStdout =
          typeof buildResult.stdout === "string" ? buildResult.stdout : "";
        const buildStderr =
          typeof buildResult.stderr === "string" ? buildResult.stderr : "";
        const buildOut = `${buildStdout}\n${buildStderr}`.trim();
        const exitCode =
          typeof buildResult.exitCode === "number" ? buildResult.exitCode : null;
        buildVerification = {
          ok: exitCode === 0,
          exitCode,
          logSnippet: buildOut.slice(-6000) || "(no build output)",
        };
      }
    }

    const urls: Record<number, string> = {};
    for (const port of ports) {
      urls[port] = sandbox.domain(port);
    }

    const primaryUrl =
      previewMode === "build_only" ? null : urls[ports[0]] || null;

    return {
      mode: "sandbox" as const,
      sandboxId: sandbox.sandboxId,
      urls,
      primaryUrl,
      runtime,
      ports,
      buildVerification,
      sandboxPreviewMode: previewMode,
    };
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}
