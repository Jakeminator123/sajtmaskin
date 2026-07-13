import { describe, expect, it } from "vitest";
import type { VersionErrorLog } from "@/lib/db/services/shared";
import {
  isLatestGateVerdictAdvisory,
  isLatestGateVerdictGreen,
  resolveGateFailureSummaryFromLogs,
} from "./gate-failure-summary";

function makeLog(overrides: Partial<VersionErrorLog>): VersionErrorLog {
  return {
    id: "log-id",
    chat_id: "chat-1",
    version_id: "version-1",
    v0_version_id: null,
    level: "error",
    category: null,
    message: "",
    meta: null,
    created_at: new Date("2026-06-22T00:00:00.000Z"),
    ...overrides,
  } as VersionErrorLog;
}

const at = (iso: string) => new Date(iso);

describe("resolveGateFailureSummaryFromLogs", () => {
  it("returns null when there are no quality-gate logs", () => {
    expect(
      resolveGateFailureSummaryFromLogs([
        makeLog({ category: "preview", level: "warning" }),
      ]),
    ).toBeNull();
  });

  it("surfaces the concrete first error line from the latest typecheck failure", () => {
    const logs = [
      makeLog({
        category: "quality-gate:typecheck",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: {
          stage: "typecheck",
          output:
            "app/page.tsx(11,14): error TS2304: Cannot find name 'Clapperboard'.\nFound 1 error.",
        },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { firstFailureCheck: "typecheck" },
      }),
    ];

    expect(resolveGateFailureSummaryFromLogs(logs)).toBe(
      "Typecheck misslyckades: app/page.tsx(11,14): error TS2304: Cannot find name 'Clapperboard'.",
    );
  });

  it("does not surface an older failure when the latest verdict passed", () => {
    const logs = [
      // Newest: a later passing verdict (summary-only, e.g. post-repair).
      makeLog({
        category: "preflight:quality-gate",
        level: "info",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { passed: true, firstFailureCheck: null },
      }),
      // Older: a failed typecheck attempt that is now stale.
      makeLog({
        category: "quality-gate:typecheck",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { output: "stale typecheck: error TS2304: Cannot find name 'Old'." },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { firstFailureCheck: "typecheck" },
      }),
    ];

    expect(resolveGateFailureSummaryFromLogs(logs)).toBeNull();
  });

  it("uses the latest attempt's failing check, not an older per-check output row", () => {
    const logs = [
      // Newest: server-verify summary failing on build (no per-check output row).
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { firstFailureCheck: "build" },
      }),
      // Older: a typecheck per-check output row from a previous attempt.
      makeLog({
        category: "quality-gate:typecheck",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { output: "stale typecheck: error TS2304: Cannot find name 'Stale'." },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { firstFailureCheck: "typecheck" },
      }),
    ];

    expect(resolveGateFailureSummaryFromLogs(logs)).toBe(
      "Build misslyckades under den automatiska verifieringen.",
    );
  });

  it("prefers the latest attempt's concrete output over an older attempt's", () => {
    const logs = [
      // Newest attempt: build failed with real output.
      makeLog({
        category: "quality-gate:build",
        level: "error",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { output: "Error: Module not found: newest" },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { firstFailureCheck: "build" },
      }),
      // Older attempt: typecheck failed (must be ignored).
      makeLog({
        category: "quality-gate:typecheck",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { output: "older typecheck error" },
      }),
    ];

    expect(resolveGateFailureSummaryFromLogs(logs)).toBe(
      "Build misslyckades: Error: Module not found: newest",
    );
  });

  it("falls back to the newest per-check output when no verdict row exists", () => {
    const logs = [
      makeLog({
        category: "quality-gate:build",
        level: "error",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { output: "Error: Module not found: newest" },
      }),
      makeLog({
        category: "quality-gate:typecheck",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { output: "older typecheck error" },
      }),
    ];

    expect(resolveGateFailureSummaryFromLogs(logs)).toBe(
      "Build misslyckades: Error: Module not found: newest",
    );
  });
});

describe("isLatestGateVerdictGreen (BB#299 watchdog reconciliation)", () => {
  it("is false when there is no quality-gate verdict at all", () => {
    expect(
      isLatestGateVerdictGreen([makeLog({ category: "preview", level: "warning" })]),
    ).toBe(false);
  });

  it("is true for a clean pass verdict (meta.passed === true) — the prod false-red profile", () => {
    expect(
      isLatestGateVerdictGreen([
        makeLog({
          category: "preflight:quality-gate",
          level: "info",
          meta: { passed: true, firstFailureCheck: null },
        }),
      ]),
    ).toBe(true);
  });

  it("is true for an info-level verdict even without meta.passed", () => {
    expect(
      isLatestGateVerdictGreen([
        makeLog({ category: "preflight:quality-gate", level: "info", meta: {} }),
      ]),
    ).toBe(true);
  });

  it("is true for an F2 render-first typecheck-advisory verdict (warning, no repass)", () => {
    expect(
      isLatestGateVerdictGreen([
        makeLog({
          category: "preflight:quality-gate",
          level: "warning",
          meta: { passed: false, firstFailureCheck: "typecheck" },
        }),
      ]),
    ).toBe(true);
  });

  it("is false for a hard-failed verdict (error level)", () => {
    expect(
      isLatestGateVerdictGreen([
        makeLog({
          category: "preflight:quality-gate",
          level: "error",
          meta: { passed: false, firstFailureCheck: "build" },
        }),
      ]),
    ).toBe(false);
  });

  it("is false for a post-repair 'did not pass' warning (meta.repass === true)", () => {
    expect(
      isLatestGateVerdictGreen([
        makeLog({
          category: "preflight:quality-gate",
          level: "warning",
          meta: { repass: true, promoted: false },
        }),
      ]),
    ).toBe(false);
  });

  it("uses the NEWEST verdict: a later pass wins over an older failure", () => {
    const logs = [
      makeLog({
        category: "preflight:quality-gate",
        level: "info",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { passed: true },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { firstFailureCheck: "typecheck" },
      }),
    ];
    expect(isLatestGateVerdictGreen(logs)).toBe(true);
  });

  it("uses the NEWEST verdict: a later failure wins over an older pass", () => {
    const logs = [
      makeLog({
        category: "preflight:quality-gate",
        level: "error",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { firstFailureCheck: "build" },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "info",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { passed: true },
      }),
    ];
    expect(isLatestGateVerdictGreen(logs)).toBe(false);
  });
});

describe("isLatestGateVerdictAdvisory (bugbot medium #518 — degraded-emit on reconcile)", () => {
  it("is false when there is no quality-gate verdict at all", () => {
    expect(
      isLatestGateVerdictAdvisory([makeLog({ category: "preview", level: "warning" })]),
    ).toBe(false);
  });

  it("is TRUE for an F2 render-first typecheck-advisory verdict (warning, no repass)", () => {
    expect(
      isLatestGateVerdictAdvisory([
        makeLog({
          category: "preflight:quality-gate",
          level: "warning",
          meta: { passed: false, firstFailureCheck: "typecheck" },
        }),
      ]),
    ).toBe(true);
  });

  it("is FALSE for a clean pass (meta.passed === true) — never advisory", () => {
    expect(
      isLatestGateVerdictAdvisory([
        makeLog({
          category: "preflight:quality-gate",
          level: "info",
          meta: { passed: true },
        }),
      ]),
    ).toBe(false);
  });

  it("is FALSE for a hard-failed verdict (error level)", () => {
    expect(
      isLatestGateVerdictAdvisory([
        makeLog({
          category: "preflight:quality-gate",
          level: "error",
          meta: { firstFailureCheck: "build" },
        }),
      ]),
    ).toBe(false);
  });

  it("is FALSE for a post-repair 'did not pass' warning (meta.repass === true)", () => {
    expect(
      isLatestGateVerdictAdvisory([
        makeLog({
          category: "preflight:quality-gate",
          level: "warning",
          meta: { repass: true, promoted: false },
        }),
      ]),
    ).toBe(false);
  });

  it("uses the NEWEST verdict: a later clean pass is not advisory over an older advisory", () => {
    const logs = [
      makeLog({
        category: "preflight:quality-gate",
        level: "info",
        created_at: at("2026-06-22T10:05:00.000Z"),
        meta: { passed: true },
      }),
      makeLog({
        category: "preflight:quality-gate",
        level: "warning",
        created_at: at("2026-06-22T10:00:00.000Z"),
        meta: { firstFailureCheck: "typecheck" },
      }),
    ];
    expect(isLatestGateVerdictAdvisory(logs)).toBe(false);
  });
});
