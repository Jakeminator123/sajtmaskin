import type { CodeFile } from "@/lib/gen/parser";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import {
  isBlockedQuickEditPath,
  isDeletableQuickEditPath,
  isQuickEditSafePath,
  normalizeQuickEditPath,
} from "./guards";
import type { QuickEditApplyResult, QuickEditOp } from "./types";

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function replaceNthOccurrence(
  haystack: string,
  needle: string,
  replacement: string,
  n: number,
): string {
  let from = 0;
  let idx = -1;
  for (let found = 0; found < n; found += 1) {
    idx = haystack.indexOf(needle, from);
    if (idx === -1) return haystack;
    from = idx + needle.length;
  }
  if (idx === -1) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

/**
 * Apply deterministic quick edits to a base file set. Pure: no IO, no LLM.
 * Returns the next file set plus the exact list of changed paths, or a typed
 * failure (the caller falls back to the normal flow). Never guesses on
 * ambiguous text matches.
 */
export function applyQuickEdits(
  baseFiles: CodeFile[],
  ops: QuickEditOp[],
): QuickEditApplyResult {
  if (!Array.isArray(baseFiles) || baseFiles.length === 0) {
    return { ok: false, reason: "no_base_files", message: "No base files to edit." };
  }
  if (!Array.isArray(ops) || ops.length === 0) {
    return { ok: false, reason: "empty_ops", message: "No edits provided." };
  }

  const next = new Map<string, CodeFile>();
  for (const file of baseFiles) {
    next.set(file.path, { ...file });
  }
  const changed = new Set<string>();
  const removed = new Set<string>();

  for (const op of ops) {
    const path = normalizeQuickEditPath(op.path);
    if (!isQuickEditSafePath(path)) {
      return { ok: false, reason: "unsafe_path", message: `Unsafe path: ${op.path}` };
    }
    if (isBlockedQuickEditPath(path)) {
      return {
        ok: false,
        reason: "unsafe_path",
        message: `Blocked path: ${op.path} (sensitive file — secrets/lockfiles cannot be quick-edited).`,
      };
    }

    if (op.kind === "delete_file") {
      if (!isDeletableQuickEditPath(path)) {
        return {
          ok: false,
          reason: "protected_path",
          message: `Refusing to delete protected file: ${path}`,
        };
      }
      if (!next.has(path)) {
        return { ok: false, reason: "file_not_found", message: `File not found: ${path}` };
      }
      next.delete(path);
      changed.add(path);
      removed.add(path);
      continue;
    }

    if (op.kind === "replace_content") {
      const existing = next.get(path);
      if (existing && existing.content === op.content) {
        continue;
      }
      next.set(path, {
        path,
        content: op.content,
        language: existing?.language ?? inferFileLanguage(path),
      });
      changed.add(path);
      continue;
    }

    // replace_text
    const existing = next.get(path);
    if (!existing) {
      return { ok: false, reason: "file_not_found", message: `File not found: ${path}` };
    }
    const matches = countOccurrences(existing.content, op.find);
    if (matches === 0) {
      return {
        ok: false,
        reason: "no_match",
        message: `Text not found in ${path}.`,
      };
    }
    if (matches > 1) {
      const occ = op.occurrence;
      if (occ === undefined || occ < 1 || occ > matches) {
        return {
          ok: false,
          reason: "ambiguous_match",
          message: `"${op.find}" occurs ${matches} times in ${path}; specify which occurrence.`,
        };
      }
    }
    const updatedContent =
      matches === 1
        ? replaceNthOccurrence(existing.content, op.find, op.replace, 1)
        : replaceNthOccurrence(existing.content, op.find, op.replace, op.occurrence ?? 1);
    if (updatedContent === existing.content) {
      continue;
    }
    next.set(path, { ...existing, content: updatedContent });
    changed.add(path);
  }

  if (changed.size === 0) {
    return { ok: false, reason: "no_change", message: "No changes were applied." };
  }

  return {
    ok: true,
    files: Array.from(next.values()),
    changedPaths: Array.from(changed),
    removedPaths: Array.from(removed),
  };
}
