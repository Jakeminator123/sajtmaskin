import type { CodeFile } from "@/lib/gen/parser";
import { normPath } from "./file-heuristics";
import { createIssue, type FinalizePreflightIssue } from "./issues";

/** Catch Tier-2 / export foot-guns (missing next, broken package.json, etc.). */
export function collectTier2HygieneIssues(files: CodeFile[]): FinalizePreflightIssue[] {
  const issues: FinalizePreflightIssue[] = [];
  const byNorm = new Map(files.map((f) => [normPath(f.path), f]));

  const pkgFile = files.find((f) => normPath(f.path) === "package.json");
  if (!pkgFile) {
    issues.push(
      createIssue(
        "package.json",
        "error",
        "Missing package.json — Tier 2 needs it for `npm install` + `next dev`.",
        "dependency_install_failure",
      ),
    );
    return issues;
  }

  try {
    const pkg = JSON.parse(pkgFile.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    if (!pkg.dependencies?.next) {
      issues.push(
        createIssue(
          "package.json",
          "error",
          "Missing `next` in dependencies — preview VM and local `npm run dev` will fail.",
          "dependency_install_failure",
        ),
      );
    }
    const devScript = pkg.scripts?.dev ?? "";
    if (devScript && !/\bnext\b/.test(devScript)) {
      issues.push(
        createIssue(
          "package.json",
          "warning",
          "`scripts.dev` does not reference `next` — Tier 2 expects e.g. `next dev`.",
          "non_blocking_quality_warning",
        ),
      );
    }
    if (!pkg.devDependencies?.typescript && files.some((f) => /\.tsx?$/.test(f.path))) {
      issues.push(
        createIssue(
          "package.json",
          "warning",
          "TypeScript sources present but `typescript` missing from devDependencies.",
          "non_blocking_quality_warning",
        ),
      );
    }
  } catch {
    issues.push(
      createIssue("package.json", "error", "package.json is not valid JSON.", "dependency_install_failure"),
    );
  }

  const hasTsSources = files.some((f) => /\.tsx?$/.test(f.path));
  if (hasTsSources && !byNorm.has("next-env.d.ts")) {
    issues.push(
      createIssue(
        "next-env.d.ts",
        "warning",
        "Missing next-env.d.ts with TypeScript sources — Next creates it on first dev; scaffold should include it.",
        "non_blocking_quality_warning",
      ),
    );
  }

  return issues;
}
