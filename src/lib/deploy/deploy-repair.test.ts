import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerBuildErrorRepair = vi.hoisted(() => vi.fn());
const getVercelDeploymentBuildLogText = vi.hoisted(() => vi.fn());
const isQualityGateConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
}));

vi.mock("@/lib/gen/defaults", () => ({
  REPAIR_LOOP_BUDGET_MS: 600_000,
}));

vi.mock("@/lib/gen/verify/server-verify", () => ({
  triggerBuildErrorRepair,
}));

vi.mock("@/lib/gen/verify/preview-quality-gate", () => ({
  isQualityGateConfigured,
}));

vi.mock("@/lib/vercelDeploy", () => ({
  getVercelDeploymentBuildLogText,
}));

const { runDeployBuildRepair } = await import("./deploy-repair");

describe("runDeployBuildRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isQualityGateConfigured.mockReturnValue(true);
    getVercelDeploymentBuildLogText.mockResolvedValue(null);
    triggerBuildErrorRepair.mockImplementation(
      async (params: { onRepairAvailable?: (p: unknown) => void }) => {
        params.onRepairAvailable?.({
          versionId: "ver_1",
          summary: "Server repair passed quality gate.",
          repairAvailableAt: "2026-07-08T00:00:00.000Z",
        });
        return { started: true, repairAvailable: true };
      },
    );
  });

  it("runs a forced, deadline-bounded build-error repair and returns repair_available", async () => {
    const result = await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      vercelDeploymentId: "dpl_1",
      fallbackMessage: "fallback",
    });

    expect(result.status).toBe("repair_available");
    expect(result.summary).toBe("Server repair passed quality gate.");

    // Reuses the preview-VM build-error repair path, forced (bypasses the
    // auto-repair env gate) and deadline-bounded — but NEVER redeploys/promotes
    // (triggerBuildErrorRepair only produces repair_available).
    expect(triggerBuildErrorRepair).toHaveBeenCalledTimes(1);
    const call = triggerBuildErrorRepair.mock.calls[0][0];
    expect(call.force).toBe(true);
    expect(typeof call.repairDeadlineEpochMs).toBe("number");
    expect(call.buildError.stage).toBe("vercel-deploy");
  });

  it("uses the fetched Vercel build-log text as repair context when available", async () => {
    getVercelDeploymentBuildLogText.mockResolvedValue("Module not found: './missing'");

    await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      vercelDeploymentId: "dpl_1",
      fallbackMessage: "fallback message",
    });

    const call = triggerBuildErrorRepair.mock.calls[0][0];
    expect(call.buildError.message).toBe("Module not found: './missing'");
  });

  it("falls back to the supplied message when no build log is available", async () => {
    getVercelDeploymentBuildLogText.mockResolvedValue(null);

    await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      vercelDeploymentId: null,
      fallbackMessage: "fallback message",
    });

    const call = triggerBuildErrorRepair.mock.calls[0][0];
    expect(call.buildError.message).toBe("fallback message");
    // No Vercel id → no log fetch attempted.
    expect(getVercelDeploymentBuildLogText).not.toHaveBeenCalled();
  });

  it("maps a busy lease to repairing", async () => {
    triggerBuildErrorRepair.mockResolvedValue({
      started: false,
      repairAvailable: false,
      skippedReason: "lease_busy",
    });
    const result = await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      fallbackMessage: "fallback",
    });
    expect(result.status).toBe("repairing");
  });

  it("maps a newer version to superseded", async () => {
    triggerBuildErrorRepair.mockResolvedValue({
      started: false,
      repairAvailable: false,
      skippedReason: "not_latest",
    });
    const result = await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      fallbackMessage: "fallback",
    });
    expect(result.status).toBe("superseded");
  });

  it("returns failed when the loop ran but could not fix the build", async () => {
    triggerBuildErrorRepair.mockResolvedValue({ started: true, repairAvailable: false });
    const result = await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      fallbackMessage: "fallback",
    });
    expect(result.status).toBe("failed");
  });

  it("returns unavailable without running when the quality gate is not configured", async () => {
    isQualityGateConfigured.mockReturnValue(false);
    const result = await runDeployBuildRepair({
      chatId: "chat_1",
      versionId: "ver_1",
      fallbackMessage: "fallback",
    });
    expect(result.status).toBe("unavailable");
    expect(triggerBuildErrorRepair).not.toHaveBeenCalled();
  });
});
