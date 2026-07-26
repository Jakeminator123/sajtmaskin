import { parseCodeProject } from "@/lib/gen/parser";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";

/**
 * Blocking preflight findings for a serialized code project, as stable keys.
 *
 * The repair loop compares the set before and after each LLM pass: a pass that
 * removes one blocker but adds another has not repaired anything, it has moved
 * the failure — and the next round then "repairs" the damage it just caused.
 * Only `error` severity counts; warnings never block preview or export.
 *
 * The key must be the finding's IDENTITY, not its rendered text. Some messages
 * enumerate what is wrong ("Duplicate module sources for X: a, b, c") and that
 * enumeration shrinks as the problem is partially fixed. Keyed on the message,
 * going from three duplicates to two looks like a new blocker, and the guard
 * below rolls back genuine progress (Codex P1 on #623). Those findings carry a
 * `subject`; the message is only a fallback for findings where it already is
 * the identity.
 */
export function collectRepairBlockers(projectContent: string): Set<string> {
  let files;
  try {
    files = parseCodeProject(projectContent).files;
  } catch {
    return new Set();
  }
  if (files.length === 0) return new Set();

  const result = runProjectSanityChecks(files, {
    // The loop works on the generated files only; the scaffold merge supplies
    // package.json at preview/export time, so a missing one is not a blocker.
    scaffoldBaselineCoversPackageJson: true,
  });
  return new Set(
    result.issues
      .filter((issue) => issue.severity === "error")
      .map(
        (issue) =>
          `${issue.category ?? "unknown"}|${issue.file}|${
            issue.subject ?? issue.message.replace(/\s+/g, " ").trim()
          }`,
      ),
  );
}

export function introducedRepairBlockers(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): string[] {
  return [...after].filter((key) => !before.has(key)).sort();
}
