import type { CodeFile } from "./parser";
import { extractStructuralElements } from "./context/structural-elements";

export interface MergeWarning {
  type: "significant-shrink" | "scaffold-file-dropped" | "structural-elements-dropped";
  file: string;
  previousSize: number;
  newSize: number;
  droppedElements?: Array<{ kind: string; label: string }>;
}

export interface MergeResult {
  files: CodeFile[];
  warnings: MergeWarning[];
}

/**
 * Deep-merges a generated package.json into the previous one so dependency
 * objects are unioned instead of overwritten.
 *
 * LLM scoped edits frequently return a stripped package.json (only the deps
 * the model added) which would otherwise wipe the rest. We always union
 * `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`
 * and `scripts`. New scalar fields and other keys come from the new file
 * (with the previous values as fallback).
 *
 * Returns the new content unchanged if either side fails to parse as JSON.
 */
export function mergePackageJsonContent(prevContent: string, nextContent: string): string {
  let prev: Record<string, unknown>;
  let next: Record<string, unknown>;
  try {
    prev = JSON.parse(prevContent) as Record<string, unknown>;
    next = JSON.parse(nextContent) as Record<string, unknown>;
  } catch {
    return nextContent;
  }
  if (
    prev === null ||
    typeof prev !== "object" ||
    Array.isArray(prev) ||
    next === null ||
    typeof next !== "object" ||
    Array.isArray(next)
  ) {
    return nextContent;
  }

  const isPlainObject = (v: unknown): v is Record<string, string> =>
    !!v && typeof v === "object" && !Array.isArray(v);

  const mergeRecord = (key: string): Record<string, string> | undefined => {
    const p = prev[key];
    const n = next[key];
    if (!isPlainObject(p) && !isPlainObject(n)) return undefined;
    return {
      ...(isPlainObject(p) ? p : {}),
      ...(isPlainObject(n) ? n : {}),
    };
  };

  const merged: Record<string, unknown> = { ...prev, ...next };
  const depsKeys = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "scripts",
  ] as const;
  for (const key of depsKeys) {
    const m = mergeRecord(key);
    if (m && Object.keys(m).length > 0) {
      merged[key] = m;
    } else if (key in merged && !isPlainObject(merged[key])) {
      delete merged[key];
    }
  }

  return JSON.stringify(merged, null, 2);
}

/**
 * Merges new generated files into the previous file set.
 * Files in newFiles overwrite matching paths; all other previous files are kept.
 * Result is sorted by path for deterministic ordering.
 *
 * Special-case: `package.json` is always deep-merged (dependencies union)
 * regardless of `rejectSignificantShrinks`, because LLM scoped edits routinely
 * emit a partial package.json that would otherwise drop unrelated deps.
 *
 * Warns when a generated file is significantly smaller than the previous
 * version (potential token truncation). For package.json the warning is still
 * emitted for observability even though the content is preserved via deep merge.
 */
export function mergeVersionFilesWithWarnings(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
  options?: {
    rejectSignificantShrinks?: boolean;
    rejectDroppedStructuralElements?: boolean;
  },
): MergeResult {
  const rejectShrinks = options?.rejectSignificantShrinks === true;
  const rejectDroppedElements = options?.rejectDroppedStructuralElements === true;
  const merged = new Map<string, CodeFile>();
  const warnings: MergeWarning[] = [];

  for (const f of previousFiles) {
    merged.set(f.path, f);
  }
  for (const f of newFiles) {
    const prev = merged.get(f.path);
    const isShrunk = !!prev && f.content.length < prev.content.length * 0.5;
    if (isShrunk) {
      warnings.push({
        type: "significant-shrink",
        file: f.path,
        previousSize: prev!.content.length,
        newSize: f.content.length,
      });
    }

    if (f.path === "package.json" && prev) {
      const mergedContent = mergePackageJsonContent(prev.content, f.content);
      merged.set(f.path, { ...f, content: mergedContent });
      continue;
    }

    if (isShrunk && rejectShrinks) {
      continue;
    }

    // Structural element guard: detect when high-value UI elements
    // (video, canvas, forms, 3D, media components, play buttons, etc.)
    // disappear between versions. When `rejectDroppedStructuralElements`
    // is true, keep the previous file to prevent accidental loss.
    if (prev && rejectDroppedElements && !isShrunk) {
      const prevElements = extractStructuralElements(prev.content);
      if (prevElements.length > 0) {
        const nextElements = extractStructuralElements(f.content);
        const nextKinds = new Set(nextElements.map((e) => e.kind));
        const dropped = prevElements.filter((e) => !nextKinds.has(e.kind));
        if (dropped.length > 0) {
          warnings.push({
            type: "structural-elements-dropped",
            file: f.path,
            previousSize: prev.content.length,
            newSize: f.content.length,
            droppedElements: dropped,
          });
          continue;
        }
      }
    }

    merged.set(f.path, f);
  }

  return {
    files: Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  };
}
