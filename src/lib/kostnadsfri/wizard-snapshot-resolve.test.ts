import { beforeEach, describe, expect, it, vi } from "vitest";

const getPromptHandoffByIdForOwner = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getPromptHandoffByIdForOwner,
}));

const { resolveKostnadsfriWizardSnapshotForOwner } = await import("./wizard-snapshot-resolve");

describe("resolveKostnadsfriWizardSnapshotForOwner", () => {
  beforeEach(() => {
    getPromptHandoffByIdForOwner.mockReset();
  });

  it("returns null without an owner scope", async () => {
    await expect(
      resolveKostnadsfriWizardSnapshotForOwner({
        promptHandoffId: "handoff_1",
        userId: null,
        sessionId: null,
      }),
    ).resolves.toBeNull();
    expect(getPromptHandoffByIdForOwner).not.toHaveBeenCalled();
  });

  it("reads a kostnadsfri snapshot from the existing handoff payload", async () => {
    getPromptHandoffByIdForOwner.mockResolvedValue({
      id: "handoff_1",
      prompt: "Build a professional website",
      source: "kostnadsfri",
      payload: {
        wizardSnapshot: {
          industryId: "",
          followupOverrodeIndustry: false,
          resolvedIndustryId: null,
          descriptionHash: "c".repeat(64),
          uspHash: null,
          descriptionPreview: "Lotteri och spelplattformar",
          uspPreview: null,
        },
      },
    });

    const resolved = await resolveKostnadsfriWizardSnapshotForOwner({
      promptHandoffId: "handoff_1",
      userId: "user_1",
      sessionId: "sess_1",
    });

    expect(getPromptHandoffByIdForOwner).toHaveBeenCalledWith("handoff_1", {
      userId: "user_1",
      sessionId: "sess_1",
    });
    expect(resolved).toMatchObject({
      followupOverrodeIndustry: false,
      descriptionPreview: "Lotteri och spelplattformar",
    });
  });

  it("ignores audit handoffs and foreign rows", async () => {
    getPromptHandoffByIdForOwner.mockResolvedValue({
      source: "audit",
      payload: { wizardSnapshot: { industryId: "restaurant" } },
    });
    await expect(
      resolveKostnadsfriWizardSnapshotForOwner({
        promptHandoffId: "handoff_1",
        userId: "user_1",
        sessionId: null,
      }),
    ).resolves.toBeNull();

    getPromptHandoffByIdForOwner.mockResolvedValue(null);
    await expect(
      resolveKostnadsfriWizardSnapshotForOwner({
        promptHandoffId: "handoff_1",
        userId: "other-user",
        sessionId: null,
      }),
    ).resolves.toBeNull();
  });
});
