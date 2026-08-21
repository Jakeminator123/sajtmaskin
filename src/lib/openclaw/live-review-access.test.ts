import { describe, expect, it } from "vitest";
import {
  parsePersistedLiveReviewGrant,
  requestedGrantHasLiveReview,
  resolveLiveReviewAccess,
} from "./live-review-access";

const GRANT = { powersOn: true, granted: ["live_review"] as const };

describe("resolveLiveReviewAccess", () => {
  it("kräver flagga, OC_EDIT och persistad live_review-grant", () => {
    expect(
      resolveLiveReviewAccess({ flagEnabled: true, editEnabled: true, grant: GRANT }),
    ).toEqual({ allow: true });
  });

  it("flagga av slår igen även med giltig grant", () => {
    expect(
      resolveLiveReviewAccess({ flagEnabled: false, editEnabled: true, grant: GRANT }),
    ).toEqual({ allow: false, reason: "flag_off" });
  });

  it("OC_EDIT av slår igen även med giltig grant", () => {
    expect(
      resolveLiveReviewAccess({ flagEnabled: true, editEnabled: false, grant: GRANT }),
    ).toEqual({ allow: false, reason: "edit_off" });
  });

  it("saknad grant, avstängd knapp eller annan befogenhet är grant_off", () => {
    expect(
      resolveLiveReviewAccess({ flagEnabled: true, editEnabled: true, grant: null }),
    ).toEqual({ allow: false, reason: "grant_off" });
    expect(
      resolveLiveReviewAccess({
        flagEnabled: true,
        editEnabled: true,
        grant: { powersOn: false, granted: ["live_review"] },
      }),
    ).toEqual({ allow: false, reason: "grant_off" });
    expect(
      resolveLiveReviewAccess({
        flagEnabled: true,
        editEnabled: true,
        grant: { powersOn: true, granted: ["quick_edit"] },
      }),
    ).toEqual({ allow: false, reason: "grant_off" });
  });
});

describe("parsePersistedLiveReviewGrant", () => {
  it("släpper okända id:n och kräver boolean powersOn", () => {
    expect(
      parsePersistedLiveReviewGrant({
        powersOn: "true",
        granted: ["live_review", "nope", "quick_edit"],
      }),
    ).toEqual({ powersOn: false, granted: ["quick_edit", "live_review"] });
  });
});

describe("requestedGrantHasLiveReview", () => {
  it("känner bara igen den kanoniska id:n", () => {
    expect(requestedGrantHasLiveReview(["live_review"])).toBe(true);
    expect(requestedGrantHasLiveReview(["LIVE_REVIEW"])).toBe(false);
    expect(requestedGrantHasLiveReview({ liveReview: true })).toBe(false);
  });
});
