import { describe, it, expect } from "vitest";

import {
  appendBugRegisterEntries,
  bugRegisterEntryFromPayload,
  type BugRegisterSourcePayload,
} from "./bug-register";

const NOW = new Date("2026-06-28T01:00:00.000Z");

describe("bugRegisterEntryFromPayload", () => {
  it("drops info-level rows", () => {
    const payload: BugRegisterSourcePayload = {
      chatId: "c1",
      versionId: "v1",
      level: "info",
      category: "preflight:quality-gate",
      message: "Server verify passed.",
      meta: null,
    };
    expect(bugRegisterEntryFromPayload(payload, NOW)).toBeNull();
  });

  it("maps an error row with failed checks and repair meta", () => {
    const payload: BugRegisterSourcePayload = {
      chatId: "c1",
      versionId: "v1",
      level: "error",
      category: "server-repair",
      message: "Server repair incomplete.",
      meta: {
        firstFailureCheck: "typecheck",
        fixerModelId: "gpt-5.3-codex",
        repaired: false,
        llmPasses: 2,
        earlyStopReason: "no_improvement",
        checks: [
          { check: "typecheck", passed: false },
          { check: "build", passed: true },
        ],
      },
    };
    const entry = bugRegisterEntryFromPayload(payload, NOW);
    expect(entry).toEqual({
      ts: "2026-06-28T01:00:00.000Z",
      chatId: "c1",
      versionId: "v1",
      level: "error",
      category: "server-repair",
      message: "Server repair incomplete.",
      firstFailureCheck: "typecheck",
      failedChecks: ["typecheck"],
      fixerModelId: "gpt-5.3-codex",
      repaired: false,
      llmPasses: 2,
      earlyStopReason: "no_improvement",
    });
  });

  it("falls back to meta.failedChecks when checks[] is absent", () => {
    const payload: BugRegisterSourcePayload = {
      chatId: "c1",
      versionId: "v1",
      level: "warning",
      category: "server-verify:diagnostic",
      message: "blockers",
      meta: { failedChecks: ["build", "lint"] },
    };
    const entry = bugRegisterEntryFromPayload(payload, NOW);
    expect(entry?.failedChecks).toEqual(["build", "lint"]);
    expect(entry?.repaired).toBeNull();
  });

  it("appendBugRegisterEntries no-ops without throwing on an empty list", () => {
    expect(() => appendBugRegisterEntries([])).not.toThrow();
  });
});
