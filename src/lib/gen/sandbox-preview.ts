import type { CodeFile } from "./parser";
import { buildSandboxEnvLocalContents } from "@/lib/gen/sandbox-env-local";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "./repair-generated-files";
import {
  clearSandboxSessionAsync,
  getActiveSandboxSessionAsync,
  touchSandboxSessionAsync,
} from "@/lib/gen/sandbox-session-store";
import {
  createSandboxRuntimeFromFiles,
  resolveSandboxPreviewModeFromEnv,
  SandboxReadinessTimeoutError,
  tryResumeSandboxById,
  type RuntimeFile,
  type SandboxPreviewMode,
} from "@/lib/mcp/runtime-url";

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
  const resolvedMode = options?.previewMode ?? resolveSandboxPreviewModeFromEnv();
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
      const resumed = await tryResumeSandboxById(sess.sandboxId);
      if (resumed) {
        await touchSandboxSessionAsync({
          chatId: cid,
          sandboxId: resumed.sandboxId,
          sandboxUrl: resumed.primaryUrl,
          versionId: vid,
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
