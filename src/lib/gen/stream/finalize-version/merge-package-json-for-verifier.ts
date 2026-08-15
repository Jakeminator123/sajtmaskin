/**
 * Prepare the `package.json` the verifier judges: the baseline-merged
 * manifest that `buildCompleteProject` persists, not the model's thin draft.
 *
 * Own-engine codegen often emits a six-line `package.json`. Persist already
 * overlays Sajtmaskin's baseline (`next`/`react` in `dependencies`,
 * `tailwindcss` in `devDependencies`). The verifier used to read the draft
 * and emit a blocking false positive (prod chat `6e865848`, 2026-08-14).
 *
 * Imported-repo mode skips this — those chats persist the template's own
 * manifest, not the Sajtmaskin baseline.
 */
import { rebuildContent } from "@/lib/gen/autofix/pipeline";
import { applyBaselinePackageJsonMerge } from "@/lib/gen/export/project-scaffold";
import {
  parseCodeProject,
  serializeCodeProject,
  type CodeFile,
} from "@/lib/gen/parser";

export interface VerifierPackageJsonView {
  /** Serialized CodeProject the LLM verifier reads. */
  verifierContent: string;
  /** File list used for the mechanical dependency re-check. */
  filesForDependencyCheck: CodeFile[];
}

export function prepareVerifierPackageJson(
  content: string,
  opts?: { skipBaselineMerge?: boolean },
): VerifierPackageJsonView {
  const { files } = parseCodeProject(content);
  if (files.length === 0 || opts?.skipBaselineMerge) {
    return { verifierContent: content, filesForDependencyCheck: files };
  }

  const mergedFiles = applyBaselinePackageJsonMerge(files);
  const originalPkg = files.find((file) => file.path === "package.json");
  const mergedPkg = mergedFiles.find((file) => file.path === "package.json");
  if (!mergedPkg) {
    return { verifierContent: content, filesForDependencyCheck: mergedFiles };
  }
  if (originalPkg) {
    const next = files.map((file) => (file.path === "package.json" ? mergedPkg : file));
    return {
      verifierContent: rebuildContent(content, files, next),
      filesForDependencyCheck: mergedFiles,
    };
  }
  return {
    verifierContent: `${content.trimEnd()}\n\n${serializeCodeProject([mergedPkg])}\n`,
    filesForDependencyCheck: mergedFiles,
  };
}
