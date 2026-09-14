import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: false }));

const {
  decideKostnadsfriCampaignBenefit,
  resolveKostnadsfriCampaignPhase,
} = await import("./kostnadsfri-campaign");

describe("resolveKostnadsfriCampaignPhase", () => {
  it("reuses the initial slot for a versionless retry on the bound chat", () => {
    expect(
      resolveKostnadsfriCampaignPhase({
        requestedPhase: "continuation",
        chatId: "chat_1",
        initialChatId: "chat_1",
        initialVersionId: null,
      }),
    ).toBe("initial");
  });

  it("moves the same chat to follow-up after the initial version was claimed", () => {
    expect(
      resolveKostnadsfriCampaignPhase({
        requestedPhase: "continuation",
        chatId: "chat_1",
        initialChatId: "chat_1",
        initialVersionId: "version_1",
      }),
    ).toBe("followup");
  });

  it("does not move an unused or claimed invitation to another chat", () => {
    expect(
      resolveKostnadsfriCampaignPhase({
        requestedPhase: "continuation",
        chatId: "chat_2",
        initialChatId: "chat_1",
        initialVersionId: null,
      }),
    ).toBeNull();
    expect(
      resolveKostnadsfriCampaignPhase({
        requestedPhase: "continuation",
        chatId: "chat_2",
        initialChatId: "chat_1",
        initialVersionId: "version_1",
      }),
    ).toBeNull();
  });
});

describe("decideKostnadsfriCampaignBenefit", () => {
  const reservedInit = {
    phase: "initial" as const,
    versionId: "version_1",
    chatId: "chat_1",
  };

  it("grants follow-up when init completed via marker but entitlement version is still null", () => {
    expect(
      decideKostnadsfriCampaignBenefit({
        entitlementId: "campaign_1",
        requestedPhase: "continuation",
        chatId: "chat_1",
        initialChatId: "chat_1",
        initialVersionId: null,
        followupVersionId: null,
        reservedSlots: [reservedInit],
      }),
    ).toMatchObject({
      needsRestore: true,
      restored: {
        initialChatId: "chat_1",
        initialVersionId: "version_1",
        followupVersionId: null,
      },
      phase: "followup",
      benefit: { entitlementId: "campaign_1", phase: "followup" },
    });
  });

  it("still blocks a second init when the completion marker already reserved that slot", () => {
    expect(
      decideKostnadsfriCampaignBenefit({
        entitlementId: "campaign_1",
        requestedPhase: "initial",
        chatId: "chat_1",
        initialChatId: "chat_1",
        initialVersionId: null,
        followupVersionId: null,
        reservedSlots: [reservedInit],
      }),
    ).toMatchObject({
      needsRestore: true,
      restored: { initialVersionId: "version_1" },
      phase: null,
      benefit: null,
    });
  });

  it("keeps a versionless retry on the bound chat as init when no marker exists", () => {
    expect(
      decideKostnadsfriCampaignBenefit({
        entitlementId: "campaign_1",
        requestedPhase: "continuation",
        chatId: "chat_1",
        initialChatId: "chat_1",
        initialVersionId: null,
        followupVersionId: null,
        reservedSlots: [],
      }),
    ).toMatchObject({
      needsRestore: false,
      phase: "initial",
      benefit: { entitlementId: "campaign_1", phase: "initial" },
    });
  });

  it("does not grant a second follow-up after that slot is reserved", () => {
    expect(
      decideKostnadsfriCampaignBenefit({
        entitlementId: "campaign_1",
        requestedPhase: "continuation",
        chatId: "chat_1",
        initialChatId: "chat_1",
        initialVersionId: "version_1",
        followupVersionId: null,
        reservedSlots: [
          reservedInit,
          { phase: "followup", versionId: "version_2", chatId: "chat_1" },
        ],
      }),
    ).toMatchObject({
      phase: "followup",
      benefit: null,
    });
  });
});
