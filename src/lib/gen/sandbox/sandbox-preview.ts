import type { CodeFile } from "../parser";
import type {
  BuildSpecPreviewPolicy,
  BuildSpecVerificationPolicy,
} from "../build-spec";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import { buildSandboxEnvLocalContents } from "@/lib/gen/sandbox/env-local";
import { startPreviewHostSession } from "@/lib/gen/sandbox/preview-host-client";
import {
  clearSandboxSessionAsync,
  getActiveSandboxSessionAsync,
  touchSandboxSessionAsync,
} from "@/lib/gen/sandbox/session-store";
import {
  getPreviewHostBaseUrl,
  getTier2RuntimeMode,
} from "@/lib/gen/sandbox/tier2-config";
import { tryResumeTier2Runtime } from "@/lib/gen/sandbox/tier2-resume";
import { buildCompleteProject } from "../project-scaffold";
import { repairGeneratedFiles } from "../repair-generated-files";
import {
  createSandboxRuntimeFromFiles,
  isSandboxConfigured,
  resolveSandboxPreviewModeFromPolicies,
  resolveSandboxPreviewModeFromEnv,
  SandboxReadinessTimeoutError,
  type RuntimeFile,
  type SandboxPreviewMode,
} from "@/lib/mcp/runtime-url";

export type SandboxPreviewTier2Meta = {
  tier2Provider: "vercel_sandbox" | "preview_host";
  failoverFrom?: "preview_host";
};

export interface SandboxPreviewResult {
  sandboxUrl: string;
  sandboxId: string;
  sandboxPreviewMode: SandboxPreviewMode;
  /** Tier 3 when a production build step ran in sandbox. */
  fidelityTier: 2 | 3;
  prodBuildVerified: boolean;
  prodBuildLogSnippet?: string;
  /** VM reused from session vs new provisioning. */
  startOutcome: "resumed" | "recreated";
  /** Telemetry / UI hints for tier-2 provider (Vercel Sandbox vs preview-host). */
  tier2Meta?: SandboxPreviewTier2Meta;
}

export type SandboxPreviewFailureCode = "readiness_timeout";

export interface SandboxPreviewError {
  stage: "repair" | "sandbox-create" | "install" | "build";
  message: string;
  /** Stable classifier for HTTP mapping — prefer over `message` substring checks. */
  failureCode?: SandboxPreviewFailureCode;
  raw?: string;
}

type StartSandboxPreviewOutcome =
  | { ok: true; result: SandboxPreviewResult }
  | { ok: false; error: SandboxPreviewError };

/** Own-engine stream + `/sandbox-preview` bootstrap can call `startSandboxPreview` at the same time for the same chat+version — share one in-flight promise so we do not spawn two VMs. */
const inflightSandboxByChatVersion = new Map<string, Promise<StartSandboxPreviewOutcome>>();

export type StartSandboxPreviewOptions = {
  /** When set, decrypted `projectEnvVars` merge into sandbox `.env.local` (after placeholders). */
  appProjectId?: string | null;
  chatId?: string | null;
  previewMode?: SandboxPreviewMode;
  previewPolicy?: BuildSpecPreviewPolicy | null;
  verificationPolicy?: BuildSpecVerificationPolicy | null;
  /**
   * Ignore any resumable sandbox session and build a fresh VM.
   * Used when project env vars changed and the old sandbox would keep stale `.env.local`.
   */
  forceRestart?: boolean;
  /**
   * When set with `chatId`, reuse an existing Vercel Sandbox for this version if the in-memory
   * session still points at a running VM (avoids duplicate sandboxes on reopen / bootstrap).
   */
  versionIdForSession?: string | null;
  /**
   * Skip `repairGeneratedFiles` when files already went through finalize preflight repair
   * (`filesJson` from DB / own-engine stream). Use `false` when parsing from raw `contentForVersion`.
   */
  skipRepair?: boolean;
};

/**
 * Start a full Next.js sandbox from generated files (own-engine + `/sandbox-preview` API).
 *
 * Ordning: (1) återanvänd befintlig VM om session matchar chat+version — **utan** att bygga projekt på nytt;
 * (2) valfritt `repairGeneratedFiles` om inte `skipRepair`; (3) `buildCompleteProject` + `.env.local`;
 * (4) @vercel/sandbox install → dev (ev. build verify).
 *
 * **Paritet:** `skipRepair: true` när underlaget redan är finalize-preflightat (`filesJson`), t.ex. own-engine-ström och API mot DB.
 */
export async function startSandboxPreview(
  generatedFiles: CodeFile[],
  options?: StartSandboxPreviewOptions,
): Promise<StartSandboxPreviewOutcome> {
  const cid =
    typeof options?.chatId === "string" && options.chatId.trim() ? options.chatId.trim() : null;
  const vid =
    typeof options?.versionIdForSession === "string" && options.versionIdForSession.trim()
      ? options.versionIdForSession.trim()
      : null;
  const dedupeKey = cid && vid
    ? `${cid}:${vid}:${options?.forceRestart === true ? "force-restart" : "default"}`
    : null;
  if (dedupeKey) {
    const existing = inflightSandboxByChatVersion.get(dedupeKey);
    if (existing) return existing;
  }

  const run = runStartSandboxPreview(generatedFiles, options);
  if (dedupeKey) {
    inflightSandboxByChatVersion.set(dedupeKey, run);
    void run.finally(() => {
      inflightSandboxByChatVersion.delete(dedupeKey);
    });
  }
  return run;
}

async function runStartSandboxPreview(
  generatedFiles: CodeFile[],
  options?: StartSandboxPreviewOptions,
): Promise<StartSandboxPreviewOutcome> {
  const resolvedMode = options?.previewMode
    ?? (
      options?.previewPolicy || options?.verificationPolicy
        ? resolveSandboxPreviewModeFromPolicies({
            previewPolicy: options?.previewPolicy ?? null,
            verificationPolicy: options?.verificationPolicy ?? null,
          })
        : resolveSandboxPreviewModeFromEnv()
    );
  const verifyBuild = resolvedMode === "dev_then_build";

  const cid =
    typeof options?.chatId === "string" && options.chatId.trim() ? options.chatId.trim() : null;
  const vid =
    typeof options?.versionIdForSession === "string" && options.versionIdForSession.trim()
      ? options.versionIdForSession.trim()
      : null;

  if (cid && options?.forceRestart) {
    await clearSandboxSessionAsync(cid);
  }

  if (cid && vid && options?.forceRestart !== true) {
    const sess = await getActiveSandboxSessionAsync(cid);
    if (sess?.versionId === vid && sess.sandboxId) {
      const resumed = await tryResumeTier2Runtime(sess);
      if (resumed) {
        await touchSandboxSessionAsync({
          chatId: cid,
          sandboxId: resumed.sandboxId,
          sandboxUrl: resumed.primaryUrl,
          versionId: vid,
          tier2Provider: sess.tier2Provider === "preview_host" ? "preview_host" : "vercel_sandbox",
        });
        return {
          ok: true,
          result: {
            sandboxUrl: resumed.primaryUrl,
            sandboxId: resumed.sandboxId,
            sandboxPreviewMode: resolvedMode,
            fidelityTier: 2,
            prodBuildVerified: false,
            startOutcome: "resumed",
            ...(sess.tier2Provider === "preview_host"
              ? { tier2Meta: { tier2Provider: "preview_host" as const } }
              : {}),
          },
        };
      }
      await clearSandboxSessionAsync(cid);
    }
  }

  const skipRepair = options?.skipRepair === true;
  let filesForProject: CodeFile[];
  if (skipRepair) {
    filesForProject = generatedFiles;
  } else {
    try {
      filesForProject = repairGeneratedFiles(generatedFiles).files;
    } catch (err) {
      return {
        ok: false,
        error: {
          stage: "repair",
          message: err instanceof Error ? err.message : "File repair failed",
        },
      };
    }
  }

  const projectFiles = buildCompleteProject(filesForProject);

  const runtimeFiles: RuntimeFile[] = projectFiles.map((f) => ({
    name: f.path,
    content: f.content,
  }));

  const envLocalPath = ".env.local";
  const envIdx = runtimeFiles.findIndex((f) => f.name === envLocalPath);
  let priorEnvLocal: string | null = null;
  if (envIdx >= 0) {
    priorEnvLocal = runtimeFiles[envIdx]!.content;
    runtimeFiles.splice(envIdx, 1);
  }
  const envBody = await buildSandboxEnvLocalContents({
    appProjectId: options?.appProjectId ?? null,
    generatedEnvLocal: priorEnvLocal,
  });
  runtimeFiles.push({ name: envLocalPath, content: envBody });

  const mode = getTier2RuntimeMode();
  const hostUrl = getPreviewHostBaseUrl();

  if (mode === "preview_host") {
    if (!hostUrl) {
      return {
        ok: false,
        error: {
          stage: "sandbox-create",
          message:
            "SAJTMASKIN_TIER2_RUNTIME=preview_host requires SAJTMASKIN_PREVIEW_HOST_BASE_URL to be set.",
        },
      };
    }
    if (!cid || !vid) {
      return {
        ok: false,
        error: {
          stage: "sandbox-create",
          message: "preview_host tier requires chatId and versionIdForSession.",
        },
      };
    }
  }

  const shouldTryPreviewHost =
    (mode === "preview_host" || mode === "preview_host_then_vercel") &&
    Boolean(hostUrl) &&
    Boolean(cid) &&
    Boolean(vid);

  let vercelAfterPreviewHostFail = false;

  if (shouldTryPreviewHost && cid && vid) {
    const filesJson = Object.fromEntries(projectFiles.map((f) => [f.path, f.content]));
    const started = await startPreviewHostSession({
      projectId: cid,
      versionId: vid,
      filesJson,
    });
    if (started.ok) {
      await touchSandboxSessionAsync({
        chatId: cid,
        sandboxId: started.sandboxId,
        sandboxUrl: started.sandboxUrl,
        versionId: vid,
        tier2Provider: "preview_host",
      });
      return {
        ok: true,
        result: {
          sandboxUrl: started.sandboxUrl,
          sandboxId: started.sandboxId,
          sandboxPreviewMode: resolvedMode,
          fidelityTier: 2,
          prodBuildVerified: false,
          startOutcome: started.startOutcome,
          tier2Meta: { tier2Provider: "preview_host" },
        },
      };
    }
    const allowVercelFallback = mode === "preview_host_then_vercel" && isSandboxConfigured();
    logSandboxLifecycleTelemetry({
      kind: "sandbox_preview_failed",
      chatId: cid,
      versionId: vid,
      stage: "sandbox-create",
      detail: started.message,
      msSinceEngineStart: 0,
      tier2Provider: "preview_host",
      willFailover: allowVercelFallback,
    });
    if (!allowVercelFallback) {
      return {
        ok: false,
        error: {
          stage: "sandbox-create",
          message: started.message,
        },
      };
    }
    vercelAfterPreviewHostFail = true;
  }

  try {
    const runtime = await createSandboxRuntimeFromFiles(runtimeFiles, {
      installCommand: "npm install --prefer-offline",
      startCommand: "npm run dev",
      ports: [3000],
      sandboxPreviewMode: resolvedMode,
      verifyBuild,
    });

    const bv = runtime.buildVerification;
    const fidelityTier: 2 | 3 = bv !== undefined ? 3 : 2;
    const sandboxUrl = runtime.primaryUrl ?? runtime.urls[3000] ?? "";
    if (cid && sandboxUrl.trim()) {
      await touchSandboxSessionAsync({
        chatId: cid,
        sandboxId: runtime.sandboxId,
        sandboxUrl,
        versionId: vid,
        tier2Provider: "vercel_sandbox",
      });
    }

    return {
      ok: true,
      result: {
        sandboxUrl,
        sandboxId: runtime.sandboxId,
        sandboxPreviewMode: resolvedMode,
        fidelityTier,
        prodBuildVerified: bv ? bv.ok : false,
        prodBuildLogSnippet: bv && !bv.ok ? bv.logSnippet : undefined,
        startOutcome: "recreated",
        ...(vercelAfterPreviewHostFail
          ? {
              tier2Meta: {
                tier2Provider: "vercel_sandbox" as const,
                failoverFrom: "preview_host" as const,
              },
            }
          : {}),
      },
    };
  } catch (err) {
    if (err instanceof SandboxReadinessTimeoutError) {
      return {
        ok: false,
        error: {
          stage: "sandbox-create",
          message: err.message,
          failureCode: "readiness_timeout",
          raw: err.stack,
        },
      };
    }
    const message = err instanceof Error ? err.message : "Sandbox creation failed";
    const isInstallError = message.includes("npm install") || message.includes("ERESOLVE");
    return {
      ok: false,
      error: {
        stage: isInstallError ? "install" : "sandbox-create",
        message,
        raw: err instanceof Error ? err.stack : undefined,
      },
    };
  }
}
