import type { CodeFile } from "@/lib/gen/parser";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import {
  countParseErrors,
  isGuardablePath,
} from "@/lib/gen/autofix/rules/import-binding-ast";
import {
  isBlockedQuickEditPath,
  isDeletableQuickEditPath,
  isJsxEditableQuickEditPath,
  isQuickEditSafePath,
  normalizeQuickEditPath,
} from "./guards";
import { deleteJsxNode, type DeleteJsxNodeFailureReason } from "./delete-jsx-node";
import type { QuickEditApplyResult, QuickEditFailureReason, QuickEditOp } from "./types";

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

function quickEditReasonForJsxDelete(
  reason: DeleteJsxNodeFailureReason,
): QuickEditFailureReason {
  switch (reason) {
    case "node_not_found":
    case "tag_mismatch":
      return "no_match";
    case "unsupported_file":
    case "invalid_locator":
      return "jsx_delete_unsupported";
    default:
      return "jsx_delete_unsafe";
  }
}

/**
 * First changed file whose syntax got WORSE, as a typed failure — or null when
 * the batch is clean. Paths the TypeScript parser does not cover (json, css,
 * md, binary assets) are skipped, and an already-broken file may stay equally
 * broken: the gate blocks regressions, it does not demand that a quick edit
 * repairs damage it did not cause.
 */
function findParseRegression(
  baseContentByPath: Map<string, string>,
  next: Map<string, CodeFile>,
  changedPaths: Iterable<string>,
): Extract<QuickEditApplyResult, { ok: false }> | null {
  for (const path of changedPaths) {
    const file = next.get(path);
    if (!file || !isGuardablePath(path)) continue;
    const baseContent = baseContentByPath.get(path);
    const before = baseContent === undefined ? 0 : countParseErrors(baseContent, path);
    const after = countParseErrors(file.content, path);
    if (after > before) {
      return {
        ok: false,
        reason: "parse_regression",
        message: `Edit would leave ${path} unparsable (${after} syntax error${
          after === 1 ? "" : "s"
        }).`,
      };
    }
  }
  return null;
}

export interface QuickEditApplyOptions {
  /**
   * Reject the whole batch when a changed file ends up with more syntax errors
   * than it started with. ON by default: the Fast Edit Lane deliberately skips
   * the LLM pipeline and its verification, so a malformed machine-authored edit
   * otherwise reaches the preview VM unchecked (prod 2026-08-01, chat 435baa63:
   * a nav-array entry inserted without a separating comma crashed the header
   * build). The client-side counter in `preview-page-ops` is a bracket/tag
   * heuristic and cannot see a missing comma — this is the real gate.
   *
   * Pass `false` for human-authored content (the code view's save button): a
   * person may deliberately save a half-finished file, and refusing the write
   * would throw away text they typed.
   */
  guardSyntax?: boolean;
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
  options: QuickEditApplyOptions = {},
): QuickEditApplyResult {
  if (!Array.isArray(baseFiles) || baseFiles.length === 0) {
    return { ok: false, reason: "no_base_files", message: "No base files to edit." };
  }
  if (!Array.isArray(ops) || ops.length === 0) {
    return { ok: false, reason: "empty_ops", message: "No edits provided." };
  }

  const next = new Map<string, CodeFile>();
  const baseContentByPath = new Map<string, string>();
  for (const file of baseFiles) {
    next.set(file.path, { ...file });
    baseContentByPath.set(file.path, file.content);
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

    if (op.kind === "delete_jsx_node") {
      if (!isJsxEditableQuickEditPath(path)) {
        return {
          ok: false,
          reason: "protected_path",
          message: `Refusing to edit JSX in protected file: ${path}`,
        };
      }
      const existing = next.get(path);
      if (!existing) {
        return { ok: false, reason: "file_not_found", message: `File not found: ${path}` };
      }
      const deleted = deleteJsxNode(existing.content, path, {
        lineNumber: op.lineNumber,
        tagName: op.tagName,
      });
      if (!deleted.ok) {
        return {
          ok: false,
          reason: quickEditReasonForJsxDelete(deleted.reason),
          message: deleted.message,
        };
      }
      next.set(path, { ...existing, content: deleted.content });
      changed.add(path);
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

  if (options.guardSyntax !== false) {
    const regression = findParseRegression(baseContentByPath, next, changed);
    if (regression) return regression;
  }

  return {
    ok: true,
    files: Array.from(next.values()),
    changedPaths: Array.from(changed),
    removedPaths: Array.from(removed),
  };
}
