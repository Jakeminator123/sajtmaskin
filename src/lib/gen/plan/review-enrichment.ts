// Server-side enrichment. Keep browser-safe plan helpers in review.ts.
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import { getVariantTemplateReviewReference } from "@/lib/gen/scaffold-variants/template-inspiration";

function inferPlanSiteType(planData: Record<string, unknown>): string | undefined {
  const existing = typeof planData.siteType === "string" ? planData.siteType.trim() : "";
  if (existing) return existing;

  const pages = Array.isArray(planData.pages) ? planData.pages : [];
  const pageNames = pages
    .map((page) =>
      page && typeof page === "object" ? String((page as { name?: unknown }).name ?? "") : "",
    )
    .filter(Boolean);
  const scope = Array.isArray(planData.scope) ? planData.scope.map((item) => String(item)) : [];
  const haystack = [...pageNames, ...scope].join(" ").toLowerCase();

  if (/(dashboard|portal|workspace|konto|admin|app)\b/.test(haystack)) {
    return "app-shell";
  }

  const pageCount = Math.max(pages.length, scope.length);
  if (pageCount <= 1) return "one-page";
  if (pageCount <= 5) return "brochure";
  return "content-heavy";
}

export function enrichPlanArtifactForReview(
  planData: Record<string, unknown> | null,
  options: {
    resolvedScaffold: ScaffoldManifest | null;
    scaffoldMode: "auto" | "manual" | "off";
    variantTemplateId?: string | null;
  },
): Record<string, unknown> | null {
  if (!planData) return null;

  const nextPlan: Record<string, unknown> = { ...planData };
  const inferredSiteType = inferPlanSiteType(nextPlan);
  if (inferredSiteType && typeof nextPlan.siteType !== "string") {
    nextPlan.siteType = inferredSiteType;
  }

  const { resolvedScaffold, scaffoldMode } = options;
  if (resolvedScaffold) {
    const existingScaffold =
      nextPlan.scaffold && typeof nextPlan.scaffold === "object"
        ? (nextPlan.scaffold as Record<string, unknown>)
        : {};
    nextPlan.scaffold = {
      id: resolvedScaffold.id,
      label:
        (typeof existingScaffold.label === "string" && existingScaffold.label) ||
        resolvedScaffold.label,
      reason:
        (typeof existingScaffold.reason === "string" && existingScaffold.reason) ||
        (scaffoldMode === "manual"
          ? "Användaren valde denna scaffold i buildern före planering."
          : "Builderns scaffold-matcher valde denna scaffold före planering."),
      source: scaffoldMode === "manual" ? "manual" : "auto",
    };
  }

  // Planner output must never invent gallery recommendations. Runtime owns the
  // exact Blob/addendum source after variant selection, so expose that one
  // reviewable reference. `variantTemplateId` is the id finalized for the
  // same prompt package the planner sees, so this cannot drift to another
  // candidate during review enrichment.
  const runtimeReference = options.variantTemplateId
    ? getVariantTemplateReviewReference(options.variantTemplateId)
    : null;
  nextPlan.variantTemplateReference = runtimeReference
    ? { ...runtimeReference, selectionReason: "selected-by-runtime-variant-ranking" }
    : null;

  return nextPlan;
}
