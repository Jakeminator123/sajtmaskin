// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readCampaignClaimPending,
  writeCampaignClaimPending,
} from "@/lib/kostnadsfri/campaign-account";
import { useAuthStore } from "./auth-store";

afterEach(() => {
  writeCampaignClaimPending(null);
  vi.unstubAllGlobals();
});

describe("utloggning", () => {
  it("rensar sparflaggan för kampanjkontot", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true }))),
    );
    writeCampaignClaimPending({ slug: "inbjudan-a", campaignUserId: "user_a" });

    useAuthStore.getState().logout();

    expect(readCampaignClaimPending()).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});
