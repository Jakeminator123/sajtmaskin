import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversionId,
  getGoogleAdsConfig,
  isAdminAppPath,
  isGoogleAdsEnabled,
  parseGoogleAdsEnv,
} from "./google-ads";

describe("parseGoogleAdsEnv", () => {
  it("fails closed when the account tag is missing or blank", () => {
    expect(parseGoogleAdsEnv({}).adsId).toBeNull();
    expect(parseGoogleAdsEnv({ adsId: "   " }).adsId).toBeNull();
    expect(isGoogleAdsEnabled(parseGoogleAdsEnv({}))).toBe(false);
  });

  it("rejects GA4 and GTM ids so this surface cannot load those tags", () => {
    expect(parseGoogleAdsEnv({ adsId: "G-ABCDEF123" }).adsId).toBeNull();
    expect(parseGoogleAdsEnv({ adsId: "GTM-XXXX" }).adsId).toBeNull();
    expect(parseGoogleAdsEnv({ adsId: "AW-not-digits" }).adsId).toBeNull();
  });

  it("accepts an AW account tag and treats empty labels as per-event no-ops", () => {
    const config = parseGoogleAdsEnv({
      adsId: "AW-123456789",
      builderStartLabel: " start_label ",
    });
    expect(config.adsId).toBe("AW-123456789");
    expect(isGoogleAdsEnabled(config)).toBe(true);
    expect(conversionId("builder_start", config)).toBe("AW-123456789/start_label");
    expect(conversionId("account_created", config)).toBeNull();
    expect(conversionId("first_generation", config)).toBeNull();
  });

  it("rejects labels that look like a full send_to or contain slashes", () => {
    const config = parseGoogleAdsEnv({
      adsId: "AW-123456789",
      builderStartLabel: "AW-123456789/label",
      accountCreatedLabel: "ok/nope",
    });
    expect(config.labels.builder_start).toBeNull();
    expect(config.labels.account_created).toBeNull();
  });
});

describe("getGoogleAdsConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the public env keys and stays off when they are unset", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL", "");
    expect(isGoogleAdsEnabled(getGoogleAdsConfig())).toBe(false);
    expect(conversionId("builder_start")).toBeNull();
  });

  it("builds send_to from the account tag plus one label", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "AW-999");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_FIRST_GENERATION_LABEL", "gen_label");
    const config = getGoogleAdsConfig();
    expect(conversionId("first_generation", config)).toBe("AW-999/gen_label");
    expect(conversionId("builder_start", config)).toBeNull();
  });
});

describe("isAdminAppPath", () => {
  it("matches /admin and nested admin routes only", () => {
    expect(isAdminAppPath("/admin")).toBe(true);
    expect(isAdminAppPath("/admin/users")).toBe(true);
    expect(isAdminAppPath("/builder")).toBe(false);
    expect(isAdminAppPath("/administration")).toBe(false);
    expect(isAdminAppPath(null)).toBe(false);
  });
});
