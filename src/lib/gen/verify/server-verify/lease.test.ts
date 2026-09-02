import { beforeEach, describe, expect, it, vi } from "vitest";

const acquireVersionLease = vi.hoisted(() => vi.fn());
const releaseVersionLease = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const warnLog = vi.hoisted(() => vi.fn());
const isQualityGateConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/db/client", () => ({ dbConfigured: true }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  acquireVersionLease,
  releaseVersionLease,
  getPreferredVersion,
  getLatestVersion,
}));
vi.mock("@/lib/utils/debug", () => ({ warnLog }));
vi.mock("../preview-quality-gate", () => ({ isQualityGateConfigured }));

import { acquireVerifyLease } from "./lease";

describe("acquireVerifyLease — fail-closed (L4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns proceed:true with a real runId when the lease is granted", async () => {
    acquireVersionLease.mockResolvedValue({ runId: "run-owned" });
    const outcome = await acquireVerifyLease("ver-1", "server_verify");
    expect(outcome).toEqual({ proceed: true, runId: "run-owned" });
    if (outcome.proceed) {
      expect(outcome.runId.length).toBeGreaterThan(0);
    }
  });

  it("returns proceed:false lease_busy when another live lease owns the version", async () => {
    acquireVersionLease.mockResolvedValue(null);
    await expect(acquireVerifyLease("ver-1", "server_verify")).resolves.toEqual({
      proceed: false,
      reason: "lease_busy",
    });
  });

  it("returns proceed:false lease_unavailable on DB error — never proceed without runId", async () => {
    acquireVersionLease.mockRejectedValue(new Error("relation engine_version_jobs does not exist"));
    const outcome = await acquireVerifyLease("ver-1", "build_error_repair");
    expect(outcome).toEqual({ proceed: false, reason: "lease_unavailable" });
    expect(warnLog).toHaveBeenCalledWith(
      "engine",
      expect.stringContaining("fail-closed"),
      expect.objectContaining({ versionId: "ver-1" }),
    );
  });

  it("gives exactly one proceed:true owner when two acquires race", async () => {
    acquireVersionLease
      .mockResolvedValueOnce({ runId: "run-a" })
      .mockResolvedValueOnce(null);

    const [first, second] = await Promise.all([
      acquireVerifyLease("ver-1", "server_verify"),
      acquireVerifyLease("ver-1", "manual_repair"),
    ]);
    const owners = [first, second].filter((outcome) => outcome.proceed);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toEqual({ proceed: true, runId: expect.any(String) });
    const denied = [first, second].filter((outcome) => !outcome.proceed);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toEqual({ proceed: false, reason: "lease_busy" });
  });
});
