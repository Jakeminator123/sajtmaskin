import type { CodeFile } from "@/lib/gen/parser";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
import { runHydrationPreflightChecks } from "@/lib/gen/validation/hydration-preflight";
import {
  crossCheckHrefsAgainstRoutes,
  extractHrefsFromFiles,
  formatMismatchMessage,
} from "@/lib/gen/verify/href-route-cross-check";
import { createIssue, type FinalizePreflightIssue } from "./issues";
import { collectTier2HygieneIssues } from "./tier2-hygiene";

type FinalizePreflightPassId =
  | "tier2_hygiene"
  | "project_sanity"
  | "seo_preflight"
  | "hydration_preflight"
  | "href_route_cross_check";

type FinalizePreflightPassResult = {
  pass: FinalizePreflightPassId;
  issues: FinalizePreflightIssue[];
};

type FinalizePreflightAllResult = {
  issues: FinalizePreflightIssue[];
  passes: FinalizePreflightPassResult[];
  unresolvedImportFallbackUsed: boolean;
  sanityValid: boolean;
  sanityIssuesForLog: ReturnType<typeof runProjectSanityChecks>["issues"];
  hrefMismatches: ReturnType<typeof crossCheckHrefsAgainstRoutes>;
};

export function runFinalizePreflightAll(params: {
  files: CodeFile[];
  actualRoutes: string[];
  importedRepoMode?: boolean;
}): FinalizePreflightAllResult {
  const tier2Issues = collectTier2HygieneIssues(params.files);

  const sanity = runProjectSanityChecks(params.files);
  // Imported repos (v0 templates) do not conform to the own-engine scaffold
  // contract, so downgrade project-sanity errors to non-blocking warnings —
  // the VM is the real validator for a verbatim repo edit.
  const sanityIssues = sanity.issues.map((issue) => {
    const downgrade = params.importedRepoMode && issue.severity === "error";
    return createIssue(
      issue.file,
      downgrade ? "warning" : issue.severity,
      issue.message,
      downgrade ? "non_blocking_quality_warning" : issue.category,
    );
  });

  const seoIssues = runSeoPreflightChecks(params.files).map((issue) =>
    createIssue(issue.file || "seo", issue.severity, issue.message, issue.category),
  );

  // Non-deterministic-render (hydration-risk) advisory. Always non-blocking —
  // it never gates preview, only surfaces a concrete message so the user isn't
  // left with an opaque console hydration mismatch. Runs for imported-repo
  // follow-ups too (importedRepoMode does not skip this pass).
  const hydrationIssues = runHydrationPreflightChecks(params.files).map((issue) =>
    createIssue(issue.file, issue.severity, issue.message, issue.category),
  );

  const extractedHrefs = extractHrefsFromFiles(params.files);
  const hrefMismatches = crossCheckHrefsAgainstRoutes(extractedHrefs, params.actualRoutes);
  const hrefIssues = hrefMismatches.slice(0, 20).map((mismatch) =>
    createIssue(
      mismatch.file,
      "warning",
      formatMismatchMessage(mismatch),
      "non_blocking_quality_warning",
    ),
  );

  const passes: FinalizePreflightPassResult[] = [
    { pass: "tier2_hygiene", issues: tier2Issues },
    { pass: "project_sanity", issues: sanityIssues },
    { pass: "seo_preflight", issues: seoIssues },
    { pass: "hydration_preflight", issues: hydrationIssues },
    { pass: "href_route_cross_check", issues: hrefIssues },
  ];

  return {
    issues: passes.flatMap((pass) => pass.issues),
    passes,
    unresolvedImportFallbackUsed: sanity.unresolvedImportFallbackUsed,
    sanityValid: sanity.valid,
    sanityIssuesForLog: sanity.issues,
    hrefMismatches,
  };
}
