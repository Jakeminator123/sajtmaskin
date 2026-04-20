import { getAllScaffolds } from "./registry";
import type { ScaffoldManifest } from "./types";

export interface ScaffoldManifestIssue {
  scaffoldId: string;
  severity: "error" | "warning";
  message: string;
}

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
