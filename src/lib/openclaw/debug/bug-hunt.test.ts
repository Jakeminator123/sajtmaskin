import { describe, it, expect, vi } from "vitest";
import {
  buildOutcomeFinding,
  createBudgetTracker,
  DEFAULT_BUG_HUNT_BUDGET,
  mapEngineFindingsToDebugFindings,
  runBugHunt,
  type BugHuntEngineClient,
  type EngineErrorLogRow,
  type MapFindingsContext,
} from "./bug-hunt";

const CTX: MapFindingsContext = {
  runId: "run1",
  scenario: "scn1",
  chatId: "chat1",
  versionId: "v1",
  buildResult: "failed",
};

function fakeClient(overrides: Partial<BugHuntEngineClient> = {}): BugHuntEngineClient {
  return {
    createChat: vi.fn(async () => ({ chatId: "chat1", versionId: "v1" })),
    sendFollowUp: vi.fn(async () => ({ chatId: "chat1", versionId: "v2" })),
    waitForVersionSettled: vi.fn(async () => ({ state: "failed" })),
    forceBuild: vi.fn(async () => ({ result: "failed" as const })),
    repair: vi.fn(async () => ({ outcome: "completed", versionId: "v1" })),
    getErrorLogs: vi.fn(async () => [] as EngineErrorLogRow[]),
    ...overrides,
  };
}

describe("createBudgetTracker", () => {
  it("enforces prompt + repair + time + findings caps", () => {
    const tracker = createBudgetTracker(
      { maxPrompts: 2, maxRepairsPerVersion: 1, maxTotalMs: 1000, maxFindings: 3 },
      0,
    );
    expect(tracker.canSendPrompt()).toBe(true);
    tracker.recordPrompt();
    tracker.recordPrompt();
    expect(tracker.canSendPrompt()).toBe(false);

    expect(tracker.canRepair("v1")).toBe(true);
    tracker.recordRepair("v1");
    expect(tracker.canRepair("v1")).toBe(false);
    expect(tracker.canRepair("v2")).toBe(true);

    expect(tracker.isExpired(999)).toBe(false);
    expect(tracker.isExpired(1000)).toBe(true);

    tracker.recordFindings(3);
    expect(tracker.isFindingsExhausted()).toBe(true);
  });
});

describe("mapEngineFindingsToDebugFindings", () => {
  it("keeps only bug-level rows and extracts file/line from the manifest", () => {
    const rows: EngineErrorLogRow[] = [
      { level: "info", category: "x", message: "noise", meta: null },
      {
        level: "error",
        category: "quality-gate:build",
        message: "build failed",
        meta: {
          errorManifest: [
            { file: "app/page.tsx", diagnostics: [{ line: 120, message: "Failed to parse src" }] },
          ],
        },
      },
      { level: "warning", category: "images", message: "broken image", meta: null },
    ];
    const findings = mapEngineFindingsToDebugFindings(rows, CTX);
    expect(findings).toHaveLength(2);
    const buildFinding = findings.find((f) => f.category === "quality-gate:build");
    expect(buildFinding?.severity).toBe("error");
    expect(buildFinding?.file).toBe("app/page.tsx");
    expect(buildFinding?.line).toBe(120);
    expect(buildFinding?.buildResult).toBe("failed");
  });
});

describe("buildOutcomeFinding", () => {
  it("flags a failed build as an error finding", () => {
    expect(buildOutcomeFinding(CTX).severity).toBe("error");
    expect(buildOutcomeFinding({ ...CTX, buildResult: "passed" }).severity).toBe("info");
  });
});

describe("runBugHunt", () => {
  it("runs scenarios, forces builds, and writes findings", async () => {
    const client = fakeClient();
    const writeFindings = vi.fn(async () => undefined);
    const result = await runBugHunt(
      { client, writeFindings, now: () => 0 },
      {
        runId: "run1",
        scenarios: [{ id: "scn1", prompt: "build something", followUps: ["tweak it"] }],
      },
    );
    expect(client.createChat).toHaveBeenCalledTimes(1);
    expect(client.sendFollowUp).toHaveBeenCalledTimes(1);
    expect(client.forceBuild).toHaveBeenCalled();
    expect(writeFindings).toHaveBeenCalled();
    expect(result.promptsUsed).toBe(2);
    expect(result.stopReason).toBe("completed");
  });

  it("halts immediately when the kill-switch is tripped", async () => {
    const client = fakeClient();
    const writeFindings = vi.fn(async () => undefined);
    const result = await runBugHunt(
      { client, writeFindings, shouldStop: () => true, now: () => 0 },
      { runId: "run1", scenarios: [{ id: "scn1", prompt: "x" }] },
    );
    expect(client.createChat).not.toHaveBeenCalled();
    expect(result.stopReason).toBe("kill_switch");
  });

  it("stops on the prompt budget", async () => {
    const client = fakeClient();
    const writeFindings = vi.fn(async () => undefined);
    const result = await runBugHunt(
      { client, writeFindings, now: () => 0 },
      {
        runId: "run1",
        scenarios: [
          { id: "a", prompt: "1" },
          { id: "b", prompt: "2" },
          { id: "c", prompt: "3" },
        ],
        budget: { ...DEFAULT_BUG_HUNT_BUDGET, maxPrompts: 2 },
      },
    );
    expect(result.promptsUsed).toBeLessThanOrEqual(2);
    expect(result.stopReason).toBe("budget_prompts");
  });

  it("triggers a bounded repair when the build fails", async () => {
    const client = fakeClient();
    const writeFindings = vi.fn(async () => undefined);
    await runBugHunt(
      { client, writeFindings, now: () => 0 },
      { runId: "run1", scenarios: [{ id: "scn1", prompt: "x" }] },
    );
    expect(client.repair).toHaveBeenCalledTimes(1);
  });
});
