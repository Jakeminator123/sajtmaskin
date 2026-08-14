import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCommunityRegistryRequest,
  communityRegistryFetchHeaders,
  isShadcnblocksRegistryUrl,
  rewriteCommunityRegistryUrl,
} from "./community-registry-fetch";

const FAKE_KEY = "sk_test_fake_shadcnblocks_token";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isShadcnblocksRegistryUrl", () => {
  it("accepts apex and www hosts only", () => {
    expect(isShadcnblocksRegistryUrl("https://shadcnblocks.com/r/hero1.json")).toBe(true);
    expect(isShadcnblocksRegistryUrl("https://www.shadcnblocks.com/r/hero1.json")).toBe(true);
    expect(isShadcnblocksRegistryUrl("https://oss.tailark.com/r/radix/mist-hero-section-1.json")).toBe(
      false,
    );
    expect(isShadcnblocksRegistryUrl("https://magicui.design/r/marquee")).toBe(false);
    expect(isShadcnblocksRegistryUrl("https://ui.shadcn.com/r/styles/new-york/button.json")).toBe(
      false,
    );
    expect(isShadcnblocksRegistryUrl("not-a-url")).toBe(false);
  });
});

describe("rewriteCommunityRegistryUrl", () => {
  it("rewrites the apex host to www so Authorization survives the redirect", () => {
    expect(rewriteCommunityRegistryUrl("https://shadcnblocks.com/r/hero1.json")).toBe(
      "https://www.shadcnblocks.com/r/hero1.json",
    );
  });

  it("leaves www and other hosts unchanged", () => {
    expect(rewriteCommunityRegistryUrl("https://www.shadcnblocks.com/r/hero1.json")).toBe(
      "https://www.shadcnblocks.com/r/hero1.json",
    );
    expect(rewriteCommunityRegistryUrl("https://oss.tailark.com/r/radix/{name}.json")).toBe(
      "https://oss.tailark.com/r/radix/{name}.json",
    );
  });
});

describe("communityRegistryFetchHeaders", () => {
  it("sends Bearer only for shadcnblocks when the key is set", () => {
    vi.stubEnv("SHADCNBLOCKS_API_KEY", FAKE_KEY);
    expect(communityRegistryFetchHeaders("https://www.shadcnblocks.com/r/hero1.json")).toEqual({
      Authorization: `Bearer ${FAKE_KEY}`,
    });
    expect(communityRegistryFetchHeaders("https://shadcnblocks.com/r/hero1.json")).toEqual({
      Authorization: `Bearer ${FAKE_KEY}`,
    });
  });

  it("sends nothing for other registries even when the key is set", () => {
    vi.stubEnv("SHADCNBLOCKS_API_KEY", FAKE_KEY);
    expect(
      communityRegistryFetchHeaders("https://oss.tailark.com/r/radix/mist-hero-section-1.json"),
    ).toEqual({});
    expect(communityRegistryFetchHeaders("https://magicui.design/r/marquee")).toEqual({});
    expect(
      communityRegistryFetchHeaders("https://ui.shadcn.com/r/styles/new-york/button.json"),
    ).toEqual({});
  });

  it("keeps unauthenticated fetches when the key is missing or blank", () => {
    vi.stubEnv("SHADCNBLOCKS_API_KEY", "");
    expect(communityRegistryFetchHeaders("https://www.shadcnblocks.com/r/hero1.json")).toEqual({});
    vi.unstubAllEnvs();
    expect(communityRegistryFetchHeaders("https://www.shadcnblocks.com/r/hero1.json")).toEqual({});
  });
});

describe("buildCommunityRegistryRequest", () => {
  it("rewrites apex to www and attaches Bearer", () => {
    vi.stubEnv("SHADCNBLOCKS_API_KEY", FAKE_KEY);
    const { url, init } = buildCommunityRegistryRequest(
      "https://shadcnblocks.com/r/pricing1.json",
      { signal: AbortSignal.timeout(1_000) },
    );
    expect(url).toBe("https://www.shadcnblocks.com/r/pricing1.json");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${FAKE_KEY}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not invent headers for non-shadcnblocks URLs", () => {
    vi.stubEnv("SHADCNBLOCKS_API_KEY", FAKE_KEY);
    const { url, init } = buildCommunityRegistryRequest("https://magicui.design/r/marquee");
    expect(url).toBe("https://magicui.design/r/marquee");
    expect(init.headers).toBeUndefined();
  });
});
