import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_ACCOUNT_UNCLAIMED_CODE,
  campaignAccountBlockedBody,
  isCampaignAccountProvider,
  isUnclaimedCampaignAccount,
} from "./campaign-account";
import {
  CAMPAIGN_CLAIM_MAX_AGE,
  createCampaignClaimTicket,
  kostnadsfriCampaignEmail,
  readCampaignClaimTicket,
} from "./campaign-account-ticket";

describe("campaign account providers", () => {
  it("treats saved and unsaved campaign accounts as campaign, but only unsaved as unclaimed", () => {
    expect(isCampaignAccountProvider("kostnadsfri")).toBe(true);
    expect(isCampaignAccountProvider("kostnadsfri_claimed")).toBe(true);
    expect(isCampaignAccountProvider("email")).toBe(false);
    expect(isCampaignAccountProvider(null)).toBe(false);
    expect(isUnclaimedCampaignAccount({ provider: "kostnadsfri" })).toBe(true);
    expect(isUnclaimedCampaignAccount({ provider: "kostnadsfri_claimed" })).toBe(false);
    expect(isUnclaimedCampaignAccount(null)).toBe(false);
  });

  it("explains the block with a stable code", () => {
    expect(campaignAccountBlockedBody("publish")).toMatchObject({
      success: false,
      code: CAMPAIGN_ACCOUNT_UNCLAIMED_CODE,
      error: expect.stringContaining("publicera"),
    });
  });
});

describe("kostnadsfriCampaignEmail", () => {
  it("is one undeliverable address per page", () => {
    expect(kostnadsfriCampaignEmail("zax-2-0-ab")).toBe(
      "kostnadsfri+zax-2-0-ab@kampanj.sajtmaskin.invalid",
    );
    expect(kostnadsfriCampaignEmail("zax-2-0-ab")).toBe(kostnadsfriCampaignEmail("zax-2-0-ab"));
  });

  it("hashes slugs that are not plain lowercase tokens", () => {
    const email = kostnadsfriCampaignEmail("Åkeri AB/../x");
    expect(email).toMatch(/^kostnadsfri\+[a-f0-9]{32}@kampanj\.sajtmaskin\.invalid$/);
    expect(email).not.toBe(kostnadsfriCampaignEmail("Akeri AB/../x"));
  });
});

describe("campaign claim ticket", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  it("round-trips the campaign user id", () => {
    const ticket = createCampaignClaimTicket("user_campaign", "inbjudan-a", now);
    expect(readCampaignClaimTicket(ticket, now)).toEqual({
      campaignUserId: "user_campaign",
      slug: "inbjudan-a",
    });
  });

  it("rejects tampering, extra segments and expiry", () => {
    const ticket = createCampaignClaimTicket("user_campaign", "inbjudan-a", now);
    const [encoded, signature] = ticket.split(".");
    const forged = Buffer.from(
      JSON.stringify({ campaignUserId: "someone_else", expiresAt: 9_999_999_999 }),
    ).toString("base64url");

    expect(readCampaignClaimTicket(`${forged}.${signature}`, now)).toBeNull();
    expect(readCampaignClaimTicket(`${encoded}.${signature}.x`, now)).toBeNull();
    expect(readCampaignClaimTicket(`${encoded}.`, now)).toBeNull();
    expect(readCampaignClaimTicket(`${"x".repeat(4_097)}.sig`, now)).toBeNull();
    expect(readCampaignClaimTicket(null, now)).toBeNull();
    expect(
      readCampaignClaimTicket(ticket, new Date(now.getTime() + (CAMPAIGN_CLAIM_MAX_AGE + 1) * 1000)),
    ).toBeNull();
  });
});
