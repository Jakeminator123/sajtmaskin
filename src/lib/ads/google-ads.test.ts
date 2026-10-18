import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversionId,
  getGoogleAdsConfig,
  GOOGLE_ADS_DEFAULT_ID,
  GOOGLE_ADS_DEFAULT_LABELS,
  isAdminAppPath,
  isGoogleAdsEnabled,
  isGoogleAdsProductionHost,
  isGoogleAdsQueueableEvent,
  parseGoogleAdsEnv,
} from "./google-ads";

describe("parseGoogleAdsEnv", () => {
  it("uses the public #1480 account tag when env is missing or blank", () => {
    expect(parseGoogleAdsEnv({}).adsId).toBe(GOOGLE_ADS_DEFAULT_ID);
    expect(parseGoogleAdsEnv({ adsId: "   " }).adsId).toBe(GOOGLE_ADS_DEFAULT_ID);
    expect(conversionId("builder_start", parseGoogleAdsEnv({}))).toBe(
      `${GOOGLE_ADS_DEFAULT_ID}/${GOOGLE_ADS_DEFAULT_LABELS.builder_start}`,
    );
    expect(conversionId("account_created", parseGoogleAdsEnv({}))).toBe(
      `${GOOGLE_ADS_DEFAULT_ID}/${GOOGLE_ADS_DEFAULT_LABELS.account_created}`,
    );
    expect(conversionId("first_generation", parseGoogleAdsEnv({}))).toBeNull();
  });

  it("rejects GA4 and GTM ids so this surface cannot load those tags", () => {
    expect(parseGoogleAdsEnv({ adsId: "G-ABCDEF123" }).adsId).toBeNull();
    expect(parseGoogleAdsEnv({ adsId: "GTM-XXXX" }).adsId).toBeNull();
    expect(parseGoogleAdsEnv({ adsId: "AW-not-digits" }).adsId).toBeNull();
  });

  it("lets env labels override defaults and treats first_generation as a custom event without a label", () => {
    const config = parseGoogleAdsEnv({
      adsId: "AW-123456789",
      builderStartLabel: " start_label ",
    });
    expect(config.adsId).toBe("AW-123456789");
    expect(conversionId("builder_start", config)).toBe("AW-123456789/start_label");
    expect(conversionId("account_created", config)).toBe(
      `AW-123456789/${GOOGLE_ADS_DEFAULT_LABELS.account_created}`,
    );
    expect(conversionId("first_generation", config)).toBeNull();
    expect(isGoogleAdsQueueableEvent("first_generation", config)).toBe(true);
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

  it("keeps the code default when public env keys are unset", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL", "");
    const config = getGoogleAdsConfig();
    expect(config.adsId).toBe(GOOGLE_ADS_DEFAULT_ID);
    expect(conversionId("builder_start", config)).toBe(
      `${GOOGLE_ADS_DEFAULT_ID}/${GOOGLE_ADS_DEFAULT_LABELS.builder_start}`,
    );
  });

  it("builds send_to from an env account tag plus one label", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "AW-999");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_FIRST_GENERATION_LABEL", "gen_label");
    const config = getGoogleAdsConfig();
    expect(conversionId("first_generation", config)).toBe("AW-999/gen_label");
    expect(conversionId("builder_start", config)).toBe(
      `AW-999/${GOOGLE_ADS_DEFAULT_LABELS.builder_start}`,
    );
  });
});

describe("isGoogleAdsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off on localhost/preview unless ENABLED=1", () => {
    const config = parseGoogleAdsEnv({});
    expect(isGoogleAdsEnabled(config, "localhost")).toBe(false);
    expect(isGoogleAdsEnabled(config, "sajtmaskin-git-preview.vercel.app")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ENABLED", "1");
    expect(isGoogleAdsEnabled(config, "localhost")).toBe(true);
  });

  it("is on for production hosts without extra env", () => {
    const config = parseGoogleAdsEnv({});
    expect(isGoogleAdsEnabled(config, "sajtmaskin.se")).toBe(true);
    expect(isGoogleAdsEnabled(config, "www.sajtmaskin.se")).toBe(true);
    expect(isGoogleAdsEnabled(config, "sajtmaskin.vercel.app")).toBe(true);
  });

  it("kill-switch 0/off wins even on production hosts", () => {
    const config = parseGoogleAdsEnv({});
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ENABLED", "0");
    expect(isGoogleAdsEnabled(config, "sajtmaskin.se")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ENABLED", "off");
    expect(isGoogleAdsEnabled(config, "sajtmaskin.se")).toBe(false);
  });
});

describe("isGoogleAdsProductionHost", () => {
  it("matches the production hosts only", () => {
    expect(isGoogleAdsProductionHost("sajtmaskin.se")).toBe(true);
    expect(isGoogleAdsProductionHost("SAJTMASKIN.SE.")).toBe(true);
    expect(isGoogleAdsProductionHost("localhost")).toBe(false);
    expect(isGoogleAdsProductionHost("preview.sajtmaskin.se")).toBe(false);
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
