import type { CodeFile } from "@/lib/gen/parser";

/**
 * Replace original file contents in the raw CodeProject string with fixed versions.
 * Uses file-path-aware fenced block matching to avoid replacing the wrong file
 * when multiple files contain identical content snippets.
 */
export function rebuildContent(
  originalContent: string,
  originalFiles: CodeFile[],
  fixedFiles: CodeFile[],
): string {
  let result = originalContent;

  for (let i = 0; i < originalFiles.length; i++) {
    const orig = originalFiles[i];
    const fixed = fixedFiles[i];
    if (orig.content === fixed.content) continue;

    const escapedPath = orig.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fenceRe = new RegExp(
      "(```\\w+\\s+file=\"" + escapedPath + "\"[^\\n]*\\n)" +
        "([\\s\\S]*?)" +
        "(\\n```)",
    );
    const match = result.match(fenceRe);
    if (match) {
      result = result.replace(fenceRe, `$1${fixed.content}$3`);
    }
  }

  return result;
}
