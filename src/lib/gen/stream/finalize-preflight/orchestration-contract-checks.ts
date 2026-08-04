import type { CodeFile } from "@/lib/gen/parser";
import type { PlannedRoute, RoutePlan } from "@/lib/gen/route-plan";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import { normPath } from "./file-heuristics";
import { createIssue, type FinalizePreflightIssue } from "./issues";

export function buildContractBackedRoutePlan(
  orchestrationContract: OrchestrationContract | null | undefined,
): RoutePlan | null {
  if (!orchestrationContract) return null;
  const requiredRoutePaths = orchestrationContract.generationToValidate.requiredRoutePaths;
  if (requiredRoutePaths.length === 0) return null;
  const routes: PlannedRoute[] = requiredRoutePaths.map((path) => ({
    path,
    name: path === "/" ? "Home" : path.split("/").filter(Boolean).join(" ") || "Route",
    intent: "Derived from orchestration contract required routes.",
    required: true,
  }));
  const rs = orchestrationContract.scaffoldToRoute.routeSource;
  return {
    provenance: { primarySource: rs, sources: [rs] },
    siteType:
      routes.length === 1
        ? "one-page"
        : routes.some((route) => route.path.startsWith("/dashboard") || route.path === "/settings")
          ? "app-shell"
          : "brochure",
    reason: "Generated from orchestration contract for preflight validation fallback.",
    routes,
  };
}

export function collectOrchestrationContractIssues(
  orchestrationContract: OrchestrationContract | null | undefined,
  files: CodeFile[],
): FinalizePreflightIssue[] {
  if (!orchestrationContract) return [];
  const issues: FinalizePreflightIssue[] = [];
  const fileSet = new Set(files.map((file) => normPath(file.path)));
  const hasRequiredFile = (requiredFile: string): boolean => {
    const normalized = normPath(requiredFile);
    if (fileSet.has(normalized)) return true;
    if (normalized.startsWith("app/")) {
      return fileSet.has(`src/${normalized}`);
    }
    if (normalized.startsWith("src/app/")) {
      return fileSet.has(normalized.replace(/^src\//, ""));
    }
    return false;
  };
  for (const requiredFile of orchestrationContract.generationToValidate.requiredFiles) {
    if (!hasRequiredFile(requiredFile)) {
      issues.push(
        createIssue(
          requiredFile,
          "warning",
          `Orchestration contract expected required file: ${requiredFile}`,
          "non_blocking_quality_warning",
        ),
      );
    }
  }
  return issues;
}
