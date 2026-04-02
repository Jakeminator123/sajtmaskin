import { Sandbox } from "@vercel/sandbox";
import type {
  BuildSpecPreviewPolicy,
  BuildSpecVerificationPolicy,
} from "@/lib/gen/build-spec";
import { buildPreviewUrl } from "@/lib/gen/preview/build-preview-document";
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
 * operators know how to enable tier-2 preview. See docs/architecture/preview-deploy.md and docs/ENV.md.
 */
export const SANDBOX_SETUP_HINT =
  "Lokal dev: kör `vercel link` och `vercel env pull` (VERCEL_OIDC_TOKEN), eller sätt VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID i .env.local. Se docs/architecture/preview-deploy.md och docs/ENV.md.";

export type RuntimeFile = {
  name: string;
  content: string;
};

export type SandboxBuildVerification = {
  ok: boolean;
  exitCode: number | null;
  logSnippet: string;
};

/** How the sandbox combines Next dev server and `npm run build`. Se `docs/architecture/preview-deploy.md` § Begrepp. */
export type SandboxPreviewMode = "dev_only" | "build_only" | "dev_then_build";

const SANDBOX_PREVIEW_MODE_VALUES = new Set<SandboxPreviewMode>([
  "dev_only",
  "build_only",
  "dev_then_build",
]);

/**
 * Server env `SAJTMASKIN_SANDBOX_PREVIEW_MODE`.
 * Default `dev_only`: Fidelity 2 only (`npm run dev` in VM) for the Vercel Sandbox path.
 * Product-level preview default is controlled by tier-2 provider selection
 * (`preview_host` vs `vercel_sandbox`) in `tier2-config.ts`.
 * Sätt `dev_then_build` för dev + `npm run build`-verifiering (Fidelity 3-signal när bygget lyckas).
 */
export function resolveSandboxPreviewModeFromEnv(): SandboxPreviewMode {
  const raw = process.env.SAJTMASKIN_SANDBOX_PREVIEW_MODE?.trim().toLowerCase().replace(/-/g, "_");
  if (raw && SANDBOX_PREVIEW_MODE_VALUES.has(raw as SandboxPreviewMode)) {
    return raw as SandboxPreviewMode;
  }
  return "dev_only";
}

export function resolveSandboxPreviewModeFromPolicies(params: {
  previewPolicy?: BuildSpecPreviewPolicy | null;
  verificationPolicy?: BuildSpecVerificationPolicy | null;
}): SandboxPreviewMode {
  if (params.previewPolicy === "fidelity3" || params.verificationPolicy === "strict") {
    return "dev_then_build";
  }
  return "dev_only";
}

/** Git URL for the Next.js template VM (`Sandbox.create` source). Override for a pinned fork/commit. */
export function resolveSandboxTemplateGitUrl(): string {
  const fromEnv = process.env.SAJTMASKIN_SANDBOX_TEMPLATE_GIT_URL?.trim();
  if (fromEnv) return fromEnv;
  return "https://github.com/vercel/sandbox-example-next.git";
}

/**
 * Hard ceiling for sandbox VM wall-clock lifetime (`Sandbox.create({ timeout })`).
 * After this, Vercel stops the machine even if the app never calls `Sandbox.stop()`.
 */
export const SANDBOX_MAX_LIFETIME_MS = 60 * 60_000;

export type SandboxRuntimeOptions = {
  runtime?: "node24" | "node22" | "python3.13";
  vcpus?: number;
  /** Requested lifetime; always capped at {@link SANDBOX_MAX_LIFETIME_MS}. */
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
   * `dev_only`: install + detached `npm run dev` — **tier 2** preview.
   * `dev_then_build`: install + detached dev + `npm run build` verification (tier 2 + tier-3 signal).
   * Default from env: `resolveSandboxPreviewModeFromEnv()` → **`dev_only`** unless
   * `SAJTMASKIN_SANDBOX_PREVIEW_MODE` sätter annat läge.
   */
  sandboxPreviewMode?: SandboxPreviewMode;
  /**
   * After detached `npm run dev`, poll the preview URL until HTTP responds (avoids 502 in iframe).
   * Default true for modes that start the dev server. Set false only for tests.
   */
  readinessProbe?: boolean;
  /** Max wait for dev server. Default from env `SAJTMASKIN_SANDBOX_READINESS_MAX_MS` or 90s. */
  readinessProbeMaxMs?: number;
};

const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 2_500_000;

/**
 * @vercel/sandbox `runCommand` with `wait: true` resolves to a command object whose output is read via
 * `await result.output("both")` — not plain `.stdout` / `.stderr` string fields. Use {@link getSandboxCommandTextOutput}.
 *
 * When those fields exist (tests, older shapes), {@link combineSandboxCommandStreams} still coerces
 * Buffer/Uint8Array to utf8 strings.
 */
export function sandboxCommandOutputToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  if (typeof value === "object" && value !== null && "length" in value) {
    try {
      return Buffer.from(value as ArrayLike<number>).toString("utf8");
    } catch {
      /* fall through */
    }
  }
  return String(value);
}

export function combineSandboxCommandStreams(result: {
  stdout?: unknown;
  stderr?: unknown;
}): string {
  const out = `${sandboxCommandOutputToString(result.stdout)}\n${sandboxCommandOutputToString(result.stderr)}`.trim();
  return out;
}

type SandboxCommandLike = {
  output?: (stream?: "stdout" | "stderr" | "both") => Promise<string>;
  stdout?: unknown;
  stderr?: unknown;
};

/**
 * Reads full stdout+stderr from a finished sandbox command. Prefer this over {@link combineSandboxCommandStreams}
 * for real `@vercel/sandbox` results.
 */
export async function getSandboxCommandTextOutput(result: unknown): Promise<string> {
  if (result && typeof result === "object") {
    const r = result as SandboxCommandLike;
    if (typeof r.output === "function") {
      try {
        const both = await r.output("both");
        if (typeof both === "string" && both.trim()) return both.trim();
      } catch {
        /* fall through */
      }
    }
  }
  return combineSandboxCommandStreams(result as SandboxCommandLike);
}

const DEFAULT_READINESS_MAX_MS = 90_000;
const READINESS_INTERVAL_MS = 1_000;

/** Shared by `waitForSandboxDevServerReady` and `createSandboxRuntimeFromFiles` (env `SAJTMASKIN_SANDBOX_READINESS_MAX_MS`). */
export function resolveSandboxReadinessMaxMsFromEnv(): number {
  const raw = process.env.SAJTMASKIN_SANDBOX_READINESS_MAX_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    return Math.min(Math.max(5_000, parseInt(raw, 10)), 180_000);
  }
  return DEFAULT_READINESS_MAX_MS;
}

/** Thrown when the dev server never responds with a usable document within the deadline. */
export class SandboxReadinessTimeoutError extends Error {
  readonly code = "SANDBOX_READINESS_TIMEOUT" as const;
  constructor(message: string) {
    super(message);
    this.name = "SandboxReadinessTimeoutError";
  }
}

/** True when the response looks like a document the iframe can render (not 404 HTML shell from proxy, etc.). */
export function sandboxDevServerResponseLooksReady(res: Response): boolean {
  if (!res.ok) return false;
  const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!ct.trim()) return true;
  return (
    ct.includes("text/html") ||
    ct.includes("text/x-component") ||
    ct.includes("application/xhtml+xml")
  );
}

/**
 * Poll until the sandbox preview host accepts HTTP (reduces empty iframe / 502 right after `npm run dev`).
 * Requires **2xx** and a document-like `Content-Type` — not merely “not 5xx” (avoids false positives on 404/401).
 * Exported for tests and diagnostics.
 */
export async function waitForSandboxDevServerReady(
  primaryUrl: string,
  options?: { maxMs?: number; intervalMs?: number },
): Promise<{ elapsedMs: number }> {
  const maxMs = options?.maxMs ?? resolveSandboxReadinessMaxMsFromEnv();
  const intervalMs = options?.intervalMs ?? READINESS_INTERVAL_MS;
  const deadline = Date.now() + maxMs;
  const started = Date.now();
  let lastMessage = "";

  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(primaryUrl, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
      });
      clearTimeout(tid);
      if (sandboxDevServerResponseLooksReady(res)) {
        return { elapsedMs: Date.now() - started };
      }
      lastMessage = res.ok
        ? `HTTP ${res.status} (unexpected content-type: ${res.headers.get("content-type") ?? "?"})`
        : `HTTP ${res.status}`;
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new SandboxReadinessTimeoutError(
    `SANDBOX_NOT_LISTENING: dev server did not become ready within ${maxMs}ms. Last error: ${lastMessage}`,
  );
}

/** Remove stock template files from the example repo so stray routes/README do not affect the build. */
async function removeSandboxTemplateLeftovers(sandbox: InstanceType<typeof Sandbox>): Promise<void> {
  await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-c",
      "rm -f README.md LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md 2>/dev/null; true",
    ],
  });
}

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
  return /^[A-Za-z0-9._/@-]+$/.test(filePath);
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
  const requestedTimeout =
    options.timeoutMs ?? (runsProdBuild ? 60 * 60_000 : 60 * 60_000);
  const timeoutMs = Math.min(requestedTimeout, SANDBOX_MAX_LIFETIME_MS);
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
      url: resolveSandboxTemplateGitUrl(),
    },
    resources: { vcpus },
    timeout: timeoutMs,
    ports,
    runtime,
  });

  const readinessProbe = options.readinessProbe !== false;
  const readinessProbeMaxMs = options.readinessProbeMaxMs ?? resolveSandboxReadinessMaxMsFromEnv();

  try {
    await sandbox.writeFiles(
      files.map((file) => ({
        path: file.name,
        content: Buffer.from(file.content, "utf-8"),
      })),
    );

    await removeSandboxTemplateLeftovers(sandbox);

    const installResult = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", installCommand],
    });
    const installOut = await getSandboxCommandTextOutput(installResult);
    const installExit = installResult.exitCode ?? 1;
    if (installExit !== 0) {
      const snippet =
        installOut.slice(0, 6000) ||
        "(Ingen logg från sandbox — om felet kvarstår, kontrollera package.json / package-lock och nätverksproxy.)";
      throw new Error(`npm install failed (exit ${installExit}). ${snippet}`);
    }

    let buildVerification: SandboxBuildVerification | undefined;

    if (previewMode === "build_only") {
      const buildResult = await sandbox.runCommand({
        cmd: "bash",
        args: ["-c", `timeout ${buildVerifyTimeoutSec}s npm run build`],
      });
      const buildOut = await getSandboxCommandTextOutput(buildResult);
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

      const probeUrl = sandbox.domain(ports[0] ?? 3000)?.trim() ?? "";
      if (readinessProbe && probeUrl) {
        await waitForSandboxDevServerReady(probeUrl, {
          maxMs: readinessProbeMaxMs,
        });
      }

      if (previewMode === "dev_then_build" && verifyBuild) {
        const buildResult = await sandbox.runCommand({
          cmd: "bash",
          args: ["-c", `timeout ${buildVerifyTimeoutSec}s npm run build`],
        });
        const buildOut = await getSandboxCommandTextOutput(buildResult);
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
