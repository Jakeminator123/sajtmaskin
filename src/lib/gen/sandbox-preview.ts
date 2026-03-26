import type { CodeFile } from "./parser";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "./repair-generated-files";
import { touchSandboxSession } from "@/lib/gen/sandbox-session-store";
import {
  createSandboxRuntimeFromFiles,
  resolveSandboxPreviewModeFromEnv,
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

export interface SandboxPreviewError {
  stage: "repair" | "sandbox-create" | "install" | "build";
  message: string;
  raw?: string;
}

export type StartSandboxPreviewOptions = {
  /** Reserved for project-bound `.env.local` merge when implemented. */
  appProjectId?: string | null;
  chatId?: string | null;
  previewMode?: SandboxPreviewMode;
};

/**
 * Start a full Next.js sandbox from generated files.
 *
 * Flow: repair -> buildCompleteProject -> @vercel/sandbox -> install -> dev (and optional build verify).
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

  const resolvedMode = options?.previewMode ?? resolveSandboxPreviewModeFromEnv();
  const verifyBuild = resolvedMode === "dev_then_build";

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
    const cid =
      typeof options?.chatId === "string" && options.chatId.trim() ? options.chatId.trim() : null;
    if (cid && sandboxUrl.trim()) {
      touchSandboxSession({ chatId: cid, sandboxId: runtime.sandboxId, sandboxUrl });
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
