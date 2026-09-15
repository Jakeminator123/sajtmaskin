import { describe, expect, it } from "vitest";
import {
  createKostnadsfriCampaignReceipt,
  verifyKostnadsfriCampaignReceipt,
} from "./campaign-receipt";

describe("kostnadsfri campaign receipt", () => {
  const now = new Date("2026-09-14T12:00:00Z");

  it("binds a verified receipt to both invitation and anonymous session", () => {
    const receipt = createKostnadsfriCampaignReceipt({
      slug: "acme-ab",
      sessionId: "sess_1",
      now,
    });

    expect(
      verifyKostnadsfriCampaignReceipt(receipt, { slug: "acme-ab", sessionId: "sess_1", now }),
    ).toBe(true);
    expect(
      verifyKostnadsfriCampaignReceipt(receipt, { slug: "other-ab", sessionId: "sess_1", now }),
    ).toBe(false);
    expect(
      verifyKostnadsfriCampaignReceipt(receipt, { slug: "acme-ab", sessionId: "sess_2", now }),
    ).toBe(false);
    expect(
      verifyKostnadsfriCampaignReceipt(receipt, { slug: "acme", sessionId: "sess_1", now }),
    ).toBe(false);
  });

  it("rejects tampering and expired receipts", () => {
    const receipt = createKostnadsfriCampaignReceipt({
      slug: "acme-ab",
      sessionId: "sess_1",
      now,
    });
    expect(
      verifyKostnadsfriCampaignReceipt(`${receipt}x`, {
        slug: "acme-ab",
        sessionId: "sess_1",
        now,
      }),
    ).toBe(false);
    expect(
      verifyKostnadsfriCampaignReceipt(receipt, {
        slug: "acme-ab",
        sessionId: "sess_1",
        now: new Date("2026-09-22T12:00:01Z"),
      }),
    ).toBe(false);
  });
});
