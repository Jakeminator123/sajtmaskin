import { describe, expect, it } from "vitest";
import type { VersionErrorLog } from "@/lib/db/services/shared";
import { resolveGateFailureSummaryFromLogs } from "./gate-failure-summary";

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
