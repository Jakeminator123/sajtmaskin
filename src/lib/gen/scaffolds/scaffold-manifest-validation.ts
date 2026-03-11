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
