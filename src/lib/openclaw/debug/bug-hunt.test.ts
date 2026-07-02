import { describe, it, expect, vi } from "vitest";
import {
  buildOutcomeFinding,
  BUG_HUNT_BUDGET_CEILING,
  clampBugHuntBudget,
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
    waitForVersionSettled: vi.fn(async () => ({ state: "failed", settled: true })),
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

  it("never reports an unknown build as passed (false-green)", () => {
    const f = buildOutcomeFinding({ ...CTX, buildResult: "unknown" });
    expect(f.severity).toBe("warning");
    expect(f.message).toMatch(/could NOT be verified/i);
  });
});

describe("clampBugHuntBudget", () => {
  it("falls back to defaults when nothing is provided", () => {
    expect(clampBugHuntBudget()).toEqual(DEFAULT_BUG_HUNT_BUDGET);
  });

  it("clamps oversized overrides to the server ceiling", () => {
    const clamped = clampBugHuntBudget({
      maxPrompts: 9999,
      maxTotalMs: 999_999_999,
      maxFindings: 1_000_000,
      maxRepairsPerVersion: 99,
    });
    expect(clamped.maxPrompts).toBe(BUG_HUNT_BUDGET_CEILING.maxPrompts);
    expect(clamped.maxTotalMs).toBe(BUG_HUNT_BUDGET_CEILING.maxTotalMs);
    expect(clamped.maxFindings).toBe(BUG_HUNT_BUDGET_CEILING.maxFindings);
    expect(clamped.maxRepairsPerVersion).toBe(BUG_HUNT_BUDGET_CEILING.maxRepairsPerVersion);
  });

  it("floors invalid/negative values", () => {
    const clamped = clampBugHuntBudget({ maxPrompts: -5, maxFindings: 0 });
    expect(clamped.maxPrompts).toBe(1);
    expect(clamped.maxFindings).toBe(1);
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

  it("does not force a gate when the version never settles (Bugbot)", async () => {
    const client = fakeClient({
      waitForVersionSettled: vi.fn(async () => ({ state: "streaming", settled: false })),
    });
    const writeFindings = vi.fn(async () => undefined);
    await runBugHunt(
      { client, writeFindings, now: () => 0 },
      { runId: "run1", scenarios: [{ id: "scn1", prompt: "x" }] },
    );
    // A still-streaming version must NOT be force-built/repaired; an unverified
    // warning finding is recorded instead.
    expect(client.forceBuild).not.toHaveBeenCalled();
    expect(client.repair).not.toHaveBeenCalled();
    const calls = writeFindings.mock.calls as unknown as Array<
      [Array<{ severity: string; buildResult: string }>]
    >;
    const written = calls.flatMap((c) => c[0]);
    expect(written.some((f) => f.severity === "warning" && f.buildResult === "unknown")).toBe(true);
  });

  it("skips processing when createChat returns an unresolved ref (Bugbot)", async () => {
    const client = fakeClient({
      createChat: vi.fn(async () => ({ chatId: "", versionId: "" })),
    });
    const writeFindings = vi.fn(async () => undefined);
    await runBugHunt(
      { client, writeFindings, now: () => 0 },
      { runId: "run1", scenarios: [{ id: "scn1", prompt: "x", followUps: ["f1"] }] },
    );
    // Unresolved init ref must not poll/build or chain, but records a warning
    // finding so it isn't a silent success.
    expect(client.forceBuild).not.toHaveBeenCalled();
    expect(client.sendFollowUp).not.toHaveBeenCalled();
    const calls = writeFindings.mock.calls as unknown as Array<
      [Array<{ severity: string; buildResult: string }>]
    >;
    const written = calls.flatMap((c) => c[0]);
    expect(written.some((f) => f.severity === "warning" && f.buildResult === "unknown")).toBe(true);
  });

  it("stops the follow-up chain when a follow-up ref is unresolved (Bugbot)", async () => {
    const client = fakeClient({
      createChat: vi.fn(async () => ({ chatId: "chat1", versionId: "v1" })),
      // Passing build so the init version doesn't trigger a repair re-build,
      // keeping forceBuild call-count to exactly one per processed version.
      forceBuild: vi.fn(async () => ({ result: "passed" as const })),
      sendFollowUp: vi.fn(async () => ({ chatId: "", versionId: "" })),
    });
    const writeFindings = vi.fn(async () => undefined);
    await runBugHunt(
      { client, writeFindings, now: () => 0 },
      { runId: "run1", scenarios: [{ id: "scn1", prompt: "x", followUps: ["f1", "f2"] }] },
    );
    // Init version processed once; the first follow-up returns an unresolved
    // ref which breaks the chain, so it is never processed and f2 never sends.
    expect(client.forceBuild).toHaveBeenCalledTimes(1);
    expect(client.sendFollowUp).toHaveBeenCalledTimes(1);
    // BB#oc3: the unresolved follow-up records the same explicit warning
    // finding as the init path — not just a log line.
    const calls = writeFindings.mock.calls as unknown as Array<
      [Array<{ severity: string; buildResult: string }>]
    >;
    const written = calls.flatMap((c) => c[0]);
    expect(written.some((f) => f.severity === "warning" && f.buildResult === "unknown")).toBe(true);
  });

  it("continues with remaining scenarios when one scenario throws (BB#oc2)", async () => {
    const createChat = vi
      .fn(async () => ({ chatId: "chat1", versionId: "v1" }))
      .mockRejectedValueOnce(new Error("Engine error 502: bad gateway"));
    const client = fakeClient({
      createChat,
      forceBuild: vi.fn(async () => ({ result: "passed" as const })),
    });
    const writeFindings = vi.fn(async () => undefined);
    const result = await runBugHunt(
      { client, writeFindings, now: () => 0 },
      {
        runId: "run1",
        scenarios: [
          { id: "throws", prompt: "x" },
          { id: "survives", prompt: "y" },
        ],
      },
    );
    // The throwing scenario is recorded as a warning finding, and the run
    // continues to the second scenario instead of aborting the whole batch.
    expect(result.scenariosRun).toBe(2);
    expect(result.stopReason).toBe("completed");
    expect(createChat).toHaveBeenCalledTimes(2);
    const calls = writeFindings.mock.calls as unknown as Array<
      [Array<{ severity: string; category: string | null; message: string }>]
    >;
    const written = calls.flatMap((c) => c[0]);
    expect(
      written.some(
        (f) =>
          f.severity === "warning" &&
          f.category === "oc-debug:scenario-error" &&
          f.message.includes("502"),
      ),
    ).toBe(true);
  });
});
