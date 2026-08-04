import {
  resolvePreflightIssueCategory,
  type PreflightIssueCategory,
} from "../preflight-contract";

export type FinalizePreflightIssue = {
  file: string;
  severity: "error" | "warning";
  message: string;
  category: PreflightIssueCategory;
};

export function createIssue(
  file: string,
  severity: "error" | "warning",
  message: string,
  category?: PreflightIssueCategory | null,
): FinalizePreflightIssue {
  return {
    file,
    severity,
    message,
    category: resolvePreflightIssueCategory({ file, severity, message, category }),
  };
}

export function describePreviewBlockFromIssues(
  issues: FinalizePreflightIssue[],
): string | null {
  const blockingIssue = issues.find(
    (issue) => issue.severity === "error" && issue.category !== "non_blocking_quality_warning",
  );
  if (!blockingIssue) return null;
  return `Automatic preflight blocked preview: ${blockingIssue.file}: ${blockingIssue.message}`;
}
