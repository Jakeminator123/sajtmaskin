import type { CodeFile } from "../parser";
import { buildCompleteProject, PLACEHOLDER_API_ROUTE } from "./project-scaffold";
import { repairGeneratedFiles } from "../autofix/repair-generated-files";
import { isPipelineAuthoredEnvLocal } from "../preview/env-local";

export type { UiComponent } from "./project-scaffold-ui-reader";

/**
 * Resolve whether `chatId` should be treated as a verbatim imported repo
 * (v0-template / ZIP import — `edit_kind="imported_repo"` in its version
 * history). Fail-open to `false` (= legacy scaffold assembly) on any lookup
 * error, and lazy-import the repository so this pure assembly module keeps
 * the DB out of its static import graph.
 */
export async function chatUsesVerbatimRepo(chatId: string): Promise<boolean> {
  try {
    const repo = await import("@/lib/db/chat-repository-pg");
    if (typeof repo.chatHasImportedRepoVersion !== "function") return false;
    return await repo.chatHasImportedRepoVersion(chatId);
  } catch {
    return false;
  }
}

export interface BuildExportableProjectOptions {
  /**
   * True for chats whose version history contains an
   * `edit_kind="imported_repo"` row (verbatim v0-template / ZIP imports —
   * resolve via `chatHasImportedRepoVersion`). The stored files ARE the
   * complete project: scaffold merge would inject foreign scaffold files and
   * force-pin baseline dependency versions over the template's own (breaking
   * lockfile-frozen installs), and the mechanical autofix pass is tuned for
   * the own-engine stack. Skip both and keep the repo verbatim, so export,
   * download and verify all see the same project the preview VM runs.
   */
  verbatimRepo?: boolean;
}

/**
 * Canonical pipeline for building the complete, repaired Next.js project
 * from stored version files. Every surface that exports, downloads, verifies,
 * or previews a project MUST use this function to guarantee consistency.
 *
 * Steps: scaffold merge → UI component resolution → dependency completion → deterministic repairs.
 * With `verbatimRepo: true` (imported repos) the files pass through unchanged
 * apart from dropping the pipeline-authored `.env.local`.
 */
export async function buildExportableProject(
  generatedFiles: CodeFile[],
  options?: BuildExportableProjectOptions,
): Promise<CodeFile[]> {
  // Persisted pipeline env artifacts are intentionally dossier-scoped for the
  // code view. Verify/export assembly needs the complete harmless/F2
  // placeholder envelope so build-time env reads behave like preview. Remove
  // only pipeline-authored env here; model-authored env remains authoritative.
  const filesForRuntimeAssembly = generatedFiles.filter(
    (file) =>
      file.path !== ".env.local" ||
      !isPipelineAuthoredEnvLocal(file.content),
  );
  if (options?.verbatimRepo) {
    // Preview↔verify parity: `startPreviewSession` (skipProjectScaffold path)
    // injects the placeholder API route into the VM when the repo lacks it,
    // so verify/export must ship the same file — otherwise RenderGate would
    // build a project missing a route the live preview actually serves.
    const hasPlaceholderRoute = filesForRuntimeAssembly.some(
      (file) =>
        file.path === "app/api/placeholder/route.ts" ||
        file.path === "app/api/placeholder/route.js",
    );
    if (!hasPlaceholderRoute) {
      return [
        ...filesForRuntimeAssembly,
        {
          path: "app/api/placeholder/route.ts",
          content: PLACEHOLDER_API_ROUTE,
          language: "ts",
        },
      ];
    }
    return filesForRuntimeAssembly;
  }
  // Dynamic import keeps Turbopack from merging fs-heavy UI scanning into every route that
  // transitively touched this module (quality-gate, repair, export, etc.).
  const { collectRequiredUiComponents } = await import("./project-scaffold-ui-reader");
  const uiComponents = collectRequiredUiComponents(filesForRuntimeAssembly);
  return repairGeneratedFiles(
    buildCompleteProject(filesForRuntimeAssembly, uiComponents),
  ).files;
}
