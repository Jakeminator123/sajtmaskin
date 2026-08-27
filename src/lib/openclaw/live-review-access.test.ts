import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCacheForTests } from "@/lib/env";
import {
  isLiveReviewAutoGrantEnabled,
  parsePersistedLiveReviewGrant,
  requestedGrantHasLiveReview,
  resolveLiveReviewAccess,
  shouldAttachOpenClawLiveReviewContext,
} from "./live-review-access";

const GRANT = { powersOn: true, granted: ["live_review"] as const };

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCacheForTests();
});

describe("isLiveReviewAutoGrantEnabled", () => {
  it("är av som default och slås på av true", () => {
    vi.stubEnv("SAJTMASKIN_LIVE_REVIEW_AUTO_GRANT", "");
    resetServerEnvCacheForTests();
    expect(isLiveReviewAutoGrantEnabled()).toBe(false);

    vi.stubEnv("SAJTMASKIN_LIVE_REVIEW_AUTO_GRANT", "true");
    resetServerEnvCacheForTests();
    expect(isLiveReviewAutoGrantEnabled()).toBe(true);
  });
});

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

  it("auto-grant ersätter bara den persistenta chattgrinden", () => {
    expect(
      resolveLiveReviewAccess({
        flagEnabled: true,
        editEnabled: true,
        autoGrantEnabled: true,
        grant: null,
      }),
    ).toEqual({ allow: true });
    expect(
      resolveLiveReviewAccess({
        flagEnabled: false,
        editEnabled: true,
        autoGrantEnabled: true,
        grant: null,
      }),
    ).toEqual({ allow: false, reason: "flag_off" });
    expect(
      resolveLiveReviewAccess({
        flagEnabled: true,
        editEnabled: false,
        autoGrantEnabled: true,
        grant: null,
      }),
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

describe("shouldAttachOpenClawLiveReviewContext", () => {
  it("kräver persistad grant för vanlig chatt, inte request-body", () => {
    expect(
      shouldAttachOpenClawLiveReviewContext({
        routingIntent: "guide",
        debug: false,
        flagEnabled: true,
        editEnabled: true,
        grant: GRANT,
      }),
    ).toBe(true);
    expect(
      shouldAttachOpenClawLiveReviewContext({
        routingIntent: "guide",
        debug: false,
        flagEnabled: true,
        editEnabled: true,
        grant: null,
      }),
    ).toBe(false);
    expect(
      shouldAttachOpenClawLiveReviewContext({
        routingIntent: "review",
        debug: false,
        flagEnabled: false,
        editEnabled: true,
        grant: null,
      }),
    ).toBe(true);
  });

  it("auto-grant kräver huvudflaggan för vanlig Sajtagent-chatt", () => {
    expect(
      shouldAttachOpenClawLiveReviewContext({
        routingIntent: "guide",
        debug: false,
        flagEnabled: true,
        editEnabled: true,
        autoGrantEnabled: true,
        grant: null,
      }),
    ).toBe(true);
    expect(
      shouldAttachOpenClawLiveReviewContext({
        routingIntent: "guide",
        debug: false,
        flagEnabled: false,
        editEnabled: true,
        autoGrantEnabled: true,
        grant: null,
      }),
    ).toBe(false);
  });
});

describe("requestedGrantHasLiveReview", () => {
  it("känner bara igen den kanoniska id:n", () => {
    expect(requestedGrantHasLiveReview(["live_review"])).toBe(true);
    expect(requestedGrantHasLiveReview(["LIVE_REVIEW"])).toBe(false);
    expect(requestedGrantHasLiveReview({ liveReview: true })).toBe(false);
  });
});
