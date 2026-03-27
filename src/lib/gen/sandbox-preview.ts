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

export type { SandboxPreviewMode };

export interface SandboxPreviewResult {
  sandboxUrl: string;
  sandboxId: string;
  sandboxPreviewMode: SandboxPreviewMode;
  /** Tier 3 when a production build step ran in sandbox. */
  fidelityTier: 2 | 3;
  prodBuildVerified: boolean;
  prodBuildLogSnippet?: string;
}

export type SandboxPreviewFailureCode = "readiness_timeout";

export interface SandboxPreviewError {
  stage: "repair" | "sandbox-create" | "install" | "build";
  message: string;
  /** Stable classifier for HTTP mapping — prefer over `message` substring checks. */
  failureCode?: SandboxPreviewFailureCode;
  raw?: string;
}

export { httpStatusForSandboxPreviewFailure } from "./sandbox-preview-errors";

export type StartSandboxPreviewOptions = {
  /** When set, decrypted `projectEnvVars` merge into sandbox `.env.local` (after placeholders). */
  appProjectId?: string | null;
  chatId?: string | null;
  previewMode?: SandboxPreviewMode;
  /**
   * When set with `chatId`, reuse an existing Vercel Sandbox for this version if the in-memory
   * session still points at a running VM (avoids duplicate sandboxes on reopen / bootstrap).
   */
  versionIdForSession?: string | null;
};

/**
 * Start a full Next.js sandbox from generated files.
 *
 * Flow: repair -> buildCompleteProject -> merged `.env.local` (placeholders + project + generated)
 * -> @vercel/sandbox -> install -> dev (and optional build verify).
 *
 * **Paritet mot sparad version:** `finalizeAndSaveVersion` kör redan merge + preflight på `filesJson`.
 * Denna väg kör dessutom `repairGeneratedFiles()` på inkommande filer innan `buildCompleteProject`
 * (samma repair som behövs för att Next ska starta i VM). Om du behöver bit-exakt samma bytes som i DB,
 * mata in rå `files_json` och acceptera att repair kan justera kända mönster — annars riskerar
 * sandbox att visa en marginellt annan variant än kodvyn om repair ändrar något.
 */
export async function startSandboxPreview(
  generatedFiles: CodeFile[],
  options?: StartSandboxPreviewOptions,
): Promise<
  | { ok: true; result: SandboxPreviewResult }
  | { ok: false; error: SandboxPreviewError }
> {
  let repairedFiles: CodeFile[];
  try {
    repairedFiles = repairGeneratedFiles(generatedFiles).files;
  } catch (err) {
    return {
      ok: false,
      error: {
        stage: "repair",
        message: err instanceof Error ? err.message : "File repair failed",
      },
    };
  }

  const projectFiles = buildCompleteProject(repairedFiles);

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

  const resolvedMode = options?.previewMode ?? resolveSandboxPreviewModeFromEnv();
  const verifyBuild = resolvedMode === "dev_then_build";

  const cid =
    typeof options?.chatId === "string" && options.chatId.trim() ? options.chatId.trim() : null;
  const vid =
    typeof options?.versionIdForSession === "string" && options.versionIdForSession.trim()
      ? options.versionIdForSession.trim()
      : null;

  if (cid && vid) {
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
          },
        };
      }
      await clearSandboxSessionAsync(cid);
    }
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
