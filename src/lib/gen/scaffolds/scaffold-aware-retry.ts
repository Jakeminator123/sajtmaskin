import { and, eq, gte } from "drizzle-orm";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { CodeFile } from "@/lib/gen/parser";
import type { FinalizePreflightIssue } from "@/lib/gen/stream/finalize-preflight";
import { db } from "@/lib/db/client";
import { generationTelemetry } from "@/lib/db/schema";
import { getScaffoldById } from "./registry";
import { matchScaffold } from "./matcher";
import { searchScaffolds } from "./scaffold-search";
import type { ScaffoldManifest } from "./types";

const RETRY_MIN_RECORDS = 5;
const RETRY_LOOKBACK_DAYS = 30;

export type ScaffoldRetryFailureType =
  | "app-shell-mismatch"
  | "site-shell-mismatch"
  | "missing-core-files"
  | "route-structure-mismatch"
  | "scaffold-import-drift"
  | "preview-build-failure"
  | "blocking-preflight";

export interface ScaffoldRetrySuggestion {
  currentScaffoldId: string;
  currentScaffoldLabel: string;
  suggestedScaffoldId: string;
  suggestedScaffoldLabel: string;
  failureType: ScaffoldRetryFailureType;
  reason: string;
  source: "heuristic" | "keyword" | "embedding";
  confidence: "medium" | "high";
  historicalRetrySuccessRate?: number | null;
}

interface InferScaffoldRetryParams {
  prompt: string;
  buildIntent: BuildIntent;
  resolvedScaffold: ScaffoldManifest | null;
  preflightIssues: FinalizePreflightIssue[];
  previewBlockingReason: string | null;
  finalizedFilesForPreview: CodeFile[];
}

const APP_SCAFFOLD_IDS = new Set(["dashboard", "app-shell"]);

function hasRouteCount(files: CodeFile[], minimum: number): boolean {
  // Dual-support: counts routes in either `app/`- or `src/app/`-rooted output.
  // Scaffolds always use `app/`, but post-merge LLM output may be either —
  // see `validateScaffoldManifest` JSDoc for the policy.
  const routeFiles = files.filter((file) =>
    /(^|\/)app\/.+\/page\.(tsx|jsx|ts|js)$/.test(file.path) || file.path === "app/page.tsx" || file.path === "src/app/page.tsx",
  );
  return routeFiles.length >= minimum;
}

function classifyFailureType(
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest,
  preflightIssues: FinalizePreflightIssue[],
  previewBlockingReason: string | null,
  finalizedFilesForPreview: CodeFile[],
): ScaffoldRetryFailureType {
  const issueText = preflightIssues
    .map((issue) => `${issue.file} ${issue.message}`)
    .join("\n")
    .toLowerCase();

  if (buildIntent === "app" && !APP_SCAFFOLD_IDS.has(resolvedScaffold.id)) {
    return "app-shell-mismatch";
  }

  if (
    buildIntent !== "app" &&
    APP_SCAFFOLD_IDS.has(resolvedScaffold.id) &&
    !hasRouteCount(finalizedFilesForPreview, 3)
  ) {
    return "site-shell-mismatch";
  }

  if (
    issueText.includes("layout.tsx is missing") ||
    issueText.includes("globals.css is missing") ||
    issueText.includes("page/layout file is missing a default export")
  ) {
    return "missing-core-files";
  }

  const hasImportDriftSignal =
    issueText.includes("unresolved local import") ||
    issueText.includes("preview-only stripped import leaked") ||
    issueText.includes("imported third-party package") ||
    issueText.includes("missing a default export");
  const hasMergedSyntaxOnlySignal =
    issueText.includes("merged syntax error") && !hasImportDriftSignal;

  if (hasMergedSyntaxOnlySignal) {
    return "blocking-preflight";
  }

  if (
    hasImportDriftSignal ||
    issueText.includes("merged syntax error")
  ) {
    return "scaffold-import-drift";
  }

  if (issueText.includes("duplicate route file")) {
    return "route-structure-mismatch";
  }

  if (previewBlockingReason) {
    return "preview-build-failure";
  }

  return "blocking-preflight";
}

function buildFailureReason(
  failureType: ScaffoldRetryFailureType,
  currentScaffold: ScaffoldManifest,
  suggestedScaffold: ScaffoldManifest,
): string {
  switch (failureType) {
    case "app-shell-mismatch":
      return `Prompten ser mer app-lik ut än nuvarande scaffold ${currentScaffold.label}. Testa repair-turnen med ${suggestedScaffold.label}.`;
    case "site-shell-mismatch":
      return `Nuvarande scaffold ${currentScaffold.label} ser för app-tung ut för den här sajten. Testa repair-turnen med ${suggestedScaffold.label}.`;
    case "missing-core-files":
      return `Blockerande preflight saknar centrala App Router-filer. Testa en enklare scaffold som ${suggestedScaffold.label} för repair-turnen.`;
    case "route-structure-mismatch":
      return `Felbilden tyder på att routestrukturen inte passar nuvarande scaffold ${currentScaffold.label}. Testa ${suggestedScaffold.label}.`;
    case "scaffold-import-drift":
      return `Felbilden tyder på scaffold/import-drift i ${currentScaffold.label}. Repair-turnen kan behöva pivotera till ${suggestedScaffold.label}.`;
    case "preview-build-failure":
      return `Preview-preflight blockerades och ${suggestedScaffold.label} ser ut som en bättre scaffold-kandidat för nästa repair-turn.`;
    case "blocking-preflight":
    default:
      return `Preflight-blockeringen tyder på att ${currentScaffold.label} kan vara en svag scaffold-fit. Prova repair-turnen med ${suggestedScaffold.label}.`;
  }
}

function suggestHeuristicScaffold(
  buildIntent: BuildIntent,
  currentScaffold: ScaffoldManifest,
  failureType: ScaffoldRetryFailureType,
): ScaffoldManifest | null {
  if (failureType === "app-shell-mismatch") {
    return getScaffoldById("app-shell");
  }

  if (failureType === "site-shell-mismatch") {
    return getScaffoldById("landing-page");
  }

  if (failureType === "route-structure-mismatch") {
    if (buildIntent === "app") {
      return currentScaffold.id === "dashboard"
        ? getScaffoldById("app-shell")
        : getScaffoldById("dashboard");
    }
    if (currentScaffold.id === "base-nextjs") {
      return getScaffoldById("landing-page");
    }
  }

  if (failureType === "missing-core-files" || failureType === "scaffold-import-drift") {
    if (buildIntent === "app") {
      return getScaffoldById("app-shell");
    }
    return currentScaffold.id === "base-nextjs"
      ? getScaffoldById("landing-page")
      : getScaffoldById("base-nextjs");
  }

  return null;
}

/**
 * SAJ-38: returns the historical success rate for retries that landed on
 * `suggestedId`. The rate is currently *not* conditioned on which scaffold
 * the retry pivoted away from — `generation_telemetry` only records the
 * scaffold that was actually used (`scaffoldId`) and a flag
 * (`scaffoldRetryUsed`), not the prior scaffold. To make the rate
 * meaningful per pivot pair we'd need a `scaffold_retry_from_id` column.
 * Until then this is a per-target rate; callers should treat it that way.
 *
 * SAJ-57 (UPSTREAM BLOCKER): `scaffoldRetryUsed` is currently hardcoded
 * to `false` in `persist-telemetry.ts` because no upstream signal flags a
 * generation as a retry attempt. As a result this query **always** returns
 * `null` regardless of how many retries have happened. Fixing SAJ-57 is a
 * prerequisite for this function to return real numbers.
 */
export async function getHistoricalRetrySuccess(
  suggestedId: string,
): Promise<number | null> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - RETRY_LOOKBACK_DAYS);

    const rows = await db
      .select({
        previewSuccess: generationTelemetry.previewSuccess,
      })
      .from(generationTelemetry)
      .where(
        and(
          eq(generationTelemetry.scaffoldId, suggestedId),
          eq(generationTelemetry.scaffoldRetryUsed, true),
          gte(generationTelemetry.createdAt, thirtyDaysAgo),
        ),
      );

    if (rows.length < RETRY_MIN_RECORDS) return null;

    const successCount = rows.filter((r) => r.previewSuccess === true).length;
    return successCount / rows.length;
  } catch {
    return null;
  }
}

async function withHistoricalRate(
  base: Omit<ScaffoldRetrySuggestion, "historicalRetrySuccessRate">,
): Promise<ScaffoldRetrySuggestion> {
  const rate = await getHistoricalRetrySuccess(base.suggestedScaffoldId);
  return { ...base, historicalRetrySuccessRate: rate ?? undefined };
}

export async function inferScaffoldRetrySuggestion({
  prompt,
  buildIntent,
  resolvedScaffold,
  preflightIssues,
  previewBlockingReason,
  finalizedFilesForPreview,
}: InferScaffoldRetryParams): Promise<ScaffoldRetrySuggestion | null> {
  if (!resolvedScaffold) return null;

  const blockingIssueCount = preflightIssues.filter((issue) => issue.severity === "error").length;
  if (blockingIssueCount === 0 && !previewBlockingReason) {
    return null;
  }

  const failureType = classifyFailureType(
    buildIntent,
    resolvedScaffold,
    preflightIssues,
    previewBlockingReason,
    finalizedFilesForPreview,
  );

  if (failureType === "blocking-preflight") {
    return null;
  }

  const heuristicCandidate = suggestHeuristicScaffold(buildIntent, resolvedScaffold, failureType);
  if (heuristicCandidate && heuristicCandidate.id !== resolvedScaffold.id) {
    return withHistoricalRate({
      currentScaffoldId: resolvedScaffold.id,
      currentScaffoldLabel: resolvedScaffold.label,
      suggestedScaffoldId: heuristicCandidate.id,
      suggestedScaffoldLabel: heuristicCandidate.label,
      failureType,
      reason: buildFailureReason(failureType, resolvedScaffold, heuristicCandidate),
      source: "heuristic",
      confidence:
        failureType === "app-shell-mismatch" ||
        failureType === "site-shell-mismatch" ||
        failureType === "missing-core-files"
          ? "high"
          : "medium",
    });
  }

  const keywordCandidate = matchScaffold(prompt, buildIntent);
  if (keywordCandidate && keywordCandidate.id !== resolvedScaffold.id) {
    return withHistoricalRate({
      currentScaffoldId: resolvedScaffold.id,
      currentScaffoldLabel: resolvedScaffold.label,
      suggestedScaffoldId: keywordCandidate.id,
      suggestedScaffoldLabel: keywordCandidate.label,
      failureType,
      reason: buildFailureReason(failureType, resolvedScaffold, keywordCandidate),
      source: "keyword",
      confidence: "medium",
    });
  }

  try {
    const semanticCandidates = await searchScaffolds(prompt, 4);
    const semanticCandidate = semanticCandidates.find(
      (candidate) => candidate.scaffold.id !== resolvedScaffold.id,
    )?.scaffold;
    if (semanticCandidate) {
      return withHistoricalRate({
        currentScaffoldId: resolvedScaffold.id,
        currentScaffoldLabel: resolvedScaffold.label,
        suggestedScaffoldId: semanticCandidate.id,
        suggestedScaffoldLabel: semanticCandidate.label,
        failureType,
        reason: buildFailureReason(failureType, resolvedScaffold, semanticCandidate),
        source: "embedding",
        confidence: "medium",
      });
    }
  } catch {
    // Best-effort only. Retry suggestions must never break finalize.
  }

  return null;
}
