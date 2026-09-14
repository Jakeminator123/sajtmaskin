import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: false }));

const { resolveKostnadsfriCampaignPhase } = await import("./kostnadsfri-campaign");

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
