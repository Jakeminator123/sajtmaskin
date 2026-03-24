import type { CodeFile } from "./parser";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "./repair-generated-files";
import {
  createSandboxRuntimeFromFiles,
  type RuntimeFile,
} from "@/lib/mcp/runtime-url";

export interface SandboxPreviewResult {
  sandboxUrl: string;
  sandboxId: string;
}

export interface SandboxPreviewError {
  stage: "repair" | "sandbox-create" | "install" | "build";
  message: string;
  raw?: string;
}

/**
 * Start a full Next.js sandbox from generated files.
 *
 * Flow: repair files -> build complete project (add package.json etc.)
 *       -> write to @vercel/sandbox -> npm install -> npm run dev
 *       -> return sandbox URL for iframe embedding.
 */
export async function startSandboxPreview(
  generatedFiles: CodeFile[],
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

  try {
    const runtime = await createSandboxRuntimeFromFiles(runtimeFiles, {
      installCommand: "npm install --prefer-offline",
      startCommand: "npm run dev",
      ports: [3000],
      timeoutMs: 3 * 60_000,
    });

    return {
      ok: true,
      result: {
        sandboxUrl: runtime.primaryUrl ?? runtime.urls[3000] ?? "",
        sandboxId: runtime.sandboxId,
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
