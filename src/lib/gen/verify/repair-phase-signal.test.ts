import { beforeEach, describe, expect, it, vi } from "vitest";

const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

import {
  REPAIR_PHASE_LOG_CATEGORY,
  recordRepairPhaseSignal,
  withRepairPhaseSignal,
} from "./repair-phase-signal";

beforeEach(() => {
  createEngineVersionErrorLogs.mockReset();
  createEngineVersionErrorLogs.mockResolvedValue([]);
});

describe("withRepairPhaseSignal", () => {
  it("persists start before the await and end with durationMs", async () => {
    const order: string[] = [];
    createEngineVersionErrorLogs.mockImplementation(async (rows: Array<{ message: string }>) => {
      order.push(rows[0]?.message ?? "");
      return [];
    });

    const result = await withRepairPhaseSignal(
      { chatId: "c1", versionId: "v1", phase: "llm_pass", passIndex: 0 },
      async () => {
        order.push("await");
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(order[0]).toContain("started");
    expect(order[1]).toBe("await");
    expect(order[2]).toContain("finished");
    const endMeta = createEngineVersionErrorLogs.mock.calls[1][0][0].meta as {
      durationMs: number;
      event: string;
      phase: string;
    };
    expect(endMeta.event).toBe("end");
    expect(endMeta.phase).toBe("llm_pass");
    expect(endMeta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("still writes start when the await throws (isolate-kill evidence)", async () => {
    await expect(
      withRepairPhaseSignal({ chatId: "c1", versionId: "v1", phase: "preview_verify" }, async () => {
        throw new Error("killed");
      }),
    ).rejects.toThrow("killed");
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(2);
    expect(createEngineVersionErrorLogs.mock.calls[0][0][0].category).toBe(
      REPAIR_PHASE_LOG_CATEGORY,
    );
    expect(createEngineVersionErrorLogs.mock.calls[0][0][0].meta.event).toBe("start");
  });
});

describe("recordRepairPhaseSignal", () => {
  it("swallows persistence errors so the loop is never blocked", async () => {
    createEngineVersionErrorLogs.mockRejectedValue(new Error("db down"));
    await expect(
      recordRepairPhaseSignal({
        chatId: "c1",
        versionId: "v1",
        phase: "build_log",
        event: "start",
      }),
    ).resolves.toBeUndefined();
  });
});
