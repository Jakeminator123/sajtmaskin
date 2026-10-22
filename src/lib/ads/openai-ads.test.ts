import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOpenAiAdsConfig,
  isOpenAiAdsEnabled,
  OPENAI_ADS_DEFAULT_PIXEL_ID,
  OPENAI_ADS_SDK_URL,
  openAiAdsBootstrapSource,
  parseOpenAiAdsEnv,
} from "./openai-ads";

describe("parseOpenAiAdsEnv", () => {
  it("uses the public pixel id when env is missing or blank", () => {
    expect(parseOpenAiAdsEnv({}).pixelId).toBe(OPENAI_ADS_DEFAULT_PIXEL_ID);
    expect(parseOpenAiAdsEnv({ pixelId: "   " }).pixelId).toBe(OPENAI_ADS_DEFAULT_PIXEL_ID);
  });

  it("accepts an alphanumeric override and rejects junk", () => {
    expect(parseOpenAiAdsEnv({ pixelId: " AbcDef12_- " }).pixelId).toBe("AbcDef12_-");
    expect(parseOpenAiAdsEnv({ pixelId: "too" }).pixelId).toBeNull();
    expect(parseOpenAiAdsEnv({ pixelId: "https://evil.example/x" }).pixelId).toBeNull();
  });
});

describe("getOpenAiAdsConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the code default when the public env key is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID", "");
    expect(getOpenAiAdsConfig().pixelId).toBe(OPENAI_ADS_DEFAULT_PIXEL_ID);
  });

  it("reads the public override", () => {
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID", "CustomPixelId123");
    expect(getOpenAiAdsConfig().pixelId).toBe("CustomPixelId123");
  });
});

describe("isOpenAiAdsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off on localhost/preview unless ENABLED=1", () => {
    const config = parseOpenAiAdsEnv({});
    expect(isOpenAiAdsEnabled(config, "localhost")).toBe(false);
    expect(isOpenAiAdsEnabled(config, "sajtmaskin-git-preview.vercel.app")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "1");
    expect(isOpenAiAdsEnabled(config, "localhost")).toBe(true);
  });

  it("is on for production hosts without extra env", () => {
    const config = parseOpenAiAdsEnv({});
    expect(isOpenAiAdsEnabled(config, "sajtmaskin.se")).toBe(true);
    expect(isOpenAiAdsEnabled(config, "www.sajtmaskin.se")).toBe(true);
    expect(isOpenAiAdsEnabled(config, "sajtmaskin.vercel.app")).toBe(true);
  });

  it("kill-switch 0/off wins even on production hosts", () => {
    const config = parseOpenAiAdsEnv({});
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "0");
    expect(isOpenAiAdsEnabled(config, "sajtmaskin.se")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_OPENAI_ADS_ENABLED", "off");
    expect(isOpenAiAdsEnabled(config, "sajtmaskin.se")).toBe(false);
  });
});

describe("openAiAdsBootstrapSource", () => {
  it("emits the official loader, consent false before init, and no debug flag", () => {
    const source = openAiAdsBootstrapSource(OPENAI_ADS_DEFAULT_PIXEL_ID);
    expect(source).toContain(OPENAI_ADS_SDK_URL);
    expect(source.indexOf(`oaiq("consent",false)`)).toBeLessThan(source.indexOf("oaiq(\"init\""));
    expect(source).toContain(`pixelId:"${OPENAI_ADS_DEFAULT_PIXEL_ID}"`);
    expect(source).not.toMatch(/debug/i);
  });
});
