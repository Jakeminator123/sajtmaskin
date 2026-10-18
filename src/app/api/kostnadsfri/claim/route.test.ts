import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const transferKostnadsfriCampaignAccount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/kostnadsfri-account", () => ({ transferKostnadsfriCampaignAccount }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: unknown, _key: string, handler: () => Promise<Response>) => handler(),
}));

import {
  CAMPAIGN_CLAIM_COOKIE_HOST,
  createCampaignClaimTicket,
} from "@/lib/kostnadsfri/campaign-account-ticket";
import { POST } from "./route";

function claimRequest(body: unknown, cookie?: string): NextRequest {
  return new NextRequest("https://sajtmaskin.se/api/kostnadsfri/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const campaignUser = { id: "user_campaign", provider: "kostnadsfri" };
const ownUser = { id: "user_own", provider: "email" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/kostnadsfri/claim", () => {
  it("starts only from an unsaved campaign account and sets a host-only ticket", async () => {
    getCurrentUser.mockResolvedValue(campaignUser);
    const response = await POST(claimRequest({ action: "start" }));
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${CAMPAIGN_CLAIM_COOKIE_HOST}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("secure");

    getCurrentUser.mockResolvedValue(ownUser);
    expect((await POST(claimRequest({ action: "start" }))).status).toBe(409);
  });

  it("requires a signed-in caller", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await POST(claimRequest({ action: "complete" }))).status).toBe(401);
    expect(transferKostnadsfriCampaignAccount).not.toHaveBeenCalled();
  });

  it("does not complete while still signed in as a campaign account", async () => {
    getCurrentUser.mockResolvedValue(campaignUser);
    const ticket = createCampaignClaimTicket("user_campaign");
    const response = await POST(
      claimRequest({ action: "complete" }, `${CAMPAIGN_CLAIM_COOKIE_HOST}=${ticket}`),
    );
    expect(response.status).toBe(409);
    expect(transferKostnadsfriCampaignAccount).not.toHaveBeenCalled();
  });

  it("refuses to complete without a valid ticket", async () => {
    getCurrentUser.mockResolvedValue(ownUser);
    const response = await POST(
      claimRequest({ action: "complete" }, `${CAMPAIGN_CLAIM_COOKIE_HOST}=forged.ticket`),
    );
    expect(response.status).toBe(400);
    expect(transferKostnadsfriCampaignAccount).not.toHaveBeenCalled();
  });

  it("moves the ticket's campaign account to the caller, ignoring ids in the body", async () => {
    getCurrentUser.mockResolvedValue(ownUser);
    transferKostnadsfriCampaignAccount.mockResolvedValue({ status: "transferred", projects: 1 });
    const ticket = createCampaignClaimTicket("user_campaign");
    const response = await POST(
      claimRequest(
        { action: "complete", campaignUserId: "victim" },
        `${CAMPAIGN_CLAIM_COOKIE_HOST}=${ticket}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(transferKostnadsfriCampaignAccount).toHaveBeenCalledWith({
      campaignUserId: "user_campaign",
      targetUserId: "user_own",
    });
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(`${CAMPAIGN_CLAIM_COOKIE_HOST}=;.*Max-Age=0`, "i"),
    );
  });

  it("reports an invitation that someone already saved", async () => {
    getCurrentUser.mockResolvedValue(ownUser);
    transferKostnadsfriCampaignAccount.mockResolvedValue({ status: "already_claimed" });
    const ticket = createCampaignClaimTicket("user_campaign");
    const response = await POST(
      claimRequest({ action: "complete" }, `${CAMPAIGN_CLAIM_COOKIE_HOST}=${ticket}`),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "already_claimed" });
  });
});
