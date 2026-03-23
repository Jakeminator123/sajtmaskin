import { describe, expect, it } from "vitest";
import { buildFinalizePreflightLogBundle } from "./finalize-preflight-logs";
import type { FinalizePreflightIssue } from "./finalize-preflight";

const BASE = {
  chatId: "chat_1",
  versionId: "ver_1",
  preflightFileCount: 10,
  previewBlockingReason: null,
  finalizedPreviewFileCount: 10,
  scaffoldRetry: null,
  routePlan: null,
} as const;

describe("buildFinalizePreflightLogBundle", () => {
  it("reports verification-blocking summary when errors exist", () => {
    const issues: FinalizePreflightIssue[] = [
      { file: "app/admin/page.tsx", severity: "error", message: "Syntax error" },
      { file: "app/page.tsx", severity: "warning", message: "Missing h1" },
    ];
    const bundle = buildFinalizePreflightLogBundle({ ...BASE, preflightIssues: issues });

    expect(bundle.hasVerificationBlockingPreflightErrors).toBe(true);
    expect(bundle.preflightFailureSummary).toBe(
      "Automatic preflight found verification-blocking issues.",
    );
  });

  it("reports warnings-only summary when only warnings exist", () => {
    const issues: FinalizePreflightIssue[] = [
      { file: "app/page.tsx", severity: "warning", message: "Missing h1" },
    ];
    const bundle = buildFinalizePreflightLogBundle({ ...BASE, preflightIssues: issues });

    expect(bundle.hasVerificationBlockingPreflightErrors).toBe(false);
    expect(bundle.preflightFailureSummary).toBe(
      "Automatic preflight completed with warnings.",
    );
  });

  it("reports clean summary when no issues exist", () => {
    const bundle = buildFinalizePreflightLogBundle({ ...BASE, preflightIssues: [] });

    expect(bundle.preflightFailureSummary).toBe("Automatic preflight completed.");
    expect(bundle.preflightLogs).toHaveLength(1);
  });

  it("reports preview-blocking summary when preview cannot be built", () => {
    const issues: FinalizePreflightIssue[] = [
      { file: "preview", severity: "error", message: "Could not build preview" },
    ];
    const bundle = buildFinalizePreflightLogBundle({
      ...BASE,
      preflightIssues: issues,
      previewBlockingReason: "Could not build preview",
    });

    expect(bundle.preflightFailureSummary).toBe(
      "Automatic preflight found preview-blocking issues.",
    );
  });

  it("includes primaryBlocker in issues log when errors exist", () => {
    const issues: FinalizePreflightIssue[] = [
      { file: "app/admin/page.tsx", severity: "error", message: 'Syntax error line 43' },
      { file: "/pricing", severity: "warning", message: "Planned route missing" },
    ];
    const bundle = buildFinalizePreflightLogBundle({ ...BASE, preflightIssues: issues });
    const issuesLog = bundle.preflightLogs.find((l) => l.category === "preflight:issues");

    expect(issuesLog?.meta.primaryBlocker).toEqual({
      file: "app/admin/page.tsx",
      message: 'Syntax error line 43',
    });
  });

  it("omits primaryBlocker when only warnings exist", () => {
    const issues: FinalizePreflightIssue[] = [
      { file: "app/page.tsx", severity: "warning", message: "Missing h1" },
    ];
    const bundle = buildFinalizePreflightLogBundle({ ...BASE, preflightIssues: issues });
    const issuesLog = bundle.preflightLogs.find((l) => l.category === "preflight:issues");

    expect(issuesLog?.meta.primaryBlocker).toBeUndefined();
  });
});
