/**
 * Partial-file-output detection + fixer-error formatting used by the
 * preflight → partial-file-repair branch in `finalizeAndSaveVersion`.
 *
 * Extracted from `src/lib/gen/stream/finalize-version.ts` 2026-04-21.
 */

import type { FinalizePreflightIssue } from "../finalize-preflight";

export function isPartialFileOutputIssue(issue: FinalizePreflightIssue): boolean {
  const message = issue.message.toLowerCase();
  return (
    message.includes("partial repair snippet") ||
    message.includes("file excerpt instead of a complete file") ||
    message.includes("overlapping import statements") ||
    message.includes("nested import inside an unfinished import block")
  );
}

export function extractPartialFileNames(issues: string[]): string[] {
  const files: string[] = [];
  for (const issue of issues) {
    const colonIdx = issue.indexOf(":");
    if (colonIdx > 0) {
      const candidate = issue.slice(0, colonIdx).trim();
      if (candidate && /\.\w{2,4}$/.test(candidate)) files.push(candidate);
    }
  }
  return [...new Set(files)];
}

export function formatPartialIssuesAsFixerErrors(
  partialFiles: string[],
  issues: string[],
): string[] {
  const errors = partialFiles.map(
    (f) =>
      `${f}:1:1 CRITICAL: This file contains only a partial snippet or excerpt. Output the COMPLETE file from the first import to the last line.`,
  );
  for (const issue of issues) {
    if (!errors.some((e) => issue.startsWith(e.split(":")[0]))) {
      errors.push(issue);
    }
  }
  return errors;
}
