import { getAllScaffolds } from "./registry";
import type { ScaffoldManifest } from "./types";

export interface ScaffoldManifestIssue {
  scaffoldId: string;
  severity: "error" | "warning";
  message: string;
}

/**
 * SAJ-43 clarification — scaffold layout is `app/`-rooted by design.
 *
 * Two distinct layers in this codebase use different rules:
 *
 *  - **Scaffolds** (this module + `src/lib/gen/scaffolds/<id>/files/`) are
 *    Sajtmaskin's internal manifest format. They MUST use `app/`-prefix
 *    (Next.js root layout). All 9 current scaffolds follow this. The check
 *    below fails loud if a future scaffold drifts to `src/app/`.
 *
 *  - **LLM-emitted project files** (the actual user-generated site) MAY use
 *    EITHER `app/` or `src/app/`. Several runtime code paths intentionally
 *    accept both — see `seo-defaults.ts` (`enrichLayoutMetadata`),
 *    `scaffold-aware-retry.ts` (`hasRouteCount`),
 *    `serialize.ts` (`scoreCriticalFile`),
 *    `finalize-preflight.ts` (`HOME_PAGE_REQUIRED_PATHS`),
 *    `builder/page-blocks-catalog.ts` (`PAGE_BLOCKS_TARGET_FILE_CANDIDATES`),
 *    plus editor + analyze paths. Do NOT remove `src/app/`-branches in those
 *    files — they exist because users may have v0-imported or pre-existing
 *    `src/app/`-rooted projects, and removing them would break those flows.
 */
export function validateScaffoldManifest(scaffold: ScaffoldManifest): ScaffoldManifestIssue[] {
  const issues: ScaffoldManifestIssue[] = [];
  const filePaths = scaffold.files.map((file) => file.path);
  const uniqueFilePaths = new Set(filePaths);

  if (uniqueFilePaths.size !== filePaths.length) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "Scaffold contains duplicate file paths",
    });
  }

  // SAJ-43 regression guard: scaffolds must use `app/`-prefix, not `src/app/`.
  // LLM-emitted output is allowed both (see JSDoc above), but our scaffold
  // manifests are an internal contract that this validator enforces.
  const srcAppFiles = scaffold.files.filter((file) => file.path.startsWith("src/app/"));
  if (srcAppFiles.length > 0) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: `Scaffold manifests must use \`app/\`-prefix, not \`src/app/\`. Drifted files: ${srcAppFiles.map((f) => f.path).join(", ")}`,
    });
  }

  const globalsCss = scaffold.files.find((file) => file.path === "app/globals.css");
  if (!globalsCss) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "Scaffold is missing app/globals.css",
    });
  } else if (!globalsCss.content.includes("@theme inline")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: "app/globals.css does not include @theme inline tokens",
    });
  }

  if (!scaffold.files.some((file) => file.path === "app/layout.tsx")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "error",
      message: "Scaffold is missing app/layout.tsx",
    });
  }

  if (!scaffold.files.some((file) => file.path === "app/page.tsx")) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: "Scaffold is missing app/page.tsx",
    });
  }

  const totalFileChars = scaffold.files.reduce((sum, f) => sum + f.content.length, 0);
  if (totalFileChars > 15_000) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: `Total scaffold file content is ${totalFileChars} chars (recommended max 15 000). Large scaffolds waste prompt budget.`,
    });
  }

  if (!scaffold.qualityChecklist || scaffold.qualityChecklist.length < 3) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: `qualityChecklist should have at least 3 entries (has ${scaffold.qualityChecklist?.length ?? 0})`,
    });
  }

  if (scaffold.promptHints.length < 2) {
    issues.push({
      scaffoldId: scaffold.id,
      severity: "warning",
      message: `promptHints should have at least 2 entries (has ${scaffold.promptHints.length})`,
    });
  }

  if (scaffold.research?.referenceTemplates) {
    for (const reference of scaffold.research.referenceTemplates) {
      if (reference.qualityScore < 0 || reference.qualityScore > 100) {
        issues.push({
          scaffoldId: scaffold.id,
          severity: "error",
          message: `Reference template ${reference.id} has an invalid quality score`,
        });
      }
    }
  }

  return issues;
}

export function runScaffoldManifestChecks(): ScaffoldManifestIssue[] {
  return getAllScaffolds().flatMap(validateScaffoldManifest);
}
