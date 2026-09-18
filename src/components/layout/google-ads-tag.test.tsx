// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const ensureGoogleAdsTag = vi.hoisted(() => vi.fn());
const isGoogleAdsEnabled = vi.hoisted(() => vi.fn());
const trackGoogleAdsConversion = vi.hoisted(() => vi.fn());
const usePathname = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

vi.mock("@/lib/marketing/google-ads", () => ({
  ensureGoogleAdsTag,
  isGoogleAdsEnabled,
  trackGoogleAdsConversion,
}));

import { GoogleAdsTag } from "./google-ads-tag";

describe("GoogleAdsTag", () => {
  beforeEach(() => {
    ensureGoogleAdsTag.mockReset();
    isGoogleAdsEnabled.mockReset();
    trackGoogleAdsConversion.mockReset();
    usePathname.mockReturnValue("/");
    isGoogleAdsEnabled.mockReturnValue(true);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "sajtmaskin.se", search: "" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("installs the tag and ignores conversions on the marketing site", () => {
    render(<GoogleAdsTag nonce="abc" />);
    expect(ensureGoogleAdsTag).toHaveBeenCalledWith({
      nonce: "abc",
      hostname: "sajtmaskin.se",
    });
    expect(trackGoogleAdsConversion).not.toHaveBeenCalled();
  });

  it("fires builder_start on /builder and account_created from signup=1", () => {
    usePathname.mockReturnValue("/builder");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "sajtmaskin.se", search: "?signup=1&login=success" },
    });

    render(<GoogleAdsTag />);
    expect(trackGoogleAdsConversion).toHaveBeenCalledWith("builder_start");
    expect(trackGoogleAdsConversion).toHaveBeenCalledWith("account_created");
  });

  it("does not fire conversions when the tag is disabled", () => {
    isGoogleAdsEnabled.mockReturnValue(false);
    usePathname.mockReturnValue("/builder");
    render(<GoogleAdsTag />);
    expect(trackGoogleAdsConversion).not.toHaveBeenCalled();
  });
});
