import { afterEach, describe, expect, it } from "vitest";
import { getPreviewHostBaseUrl, getTier2RuntimeMode } from "./tier2-config";

const ORIGINAL_BASE_URL = process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  else process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = ORIGINAL_BASE_URL;
});

describe("getTier2RuntimeMode", () => {
  it("always resolves to preview_host", () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://vm-fly-jakem.fly.dev";
    expect(getTier2RuntimeMode()).toBe("preview_host");
  });

  it("still resolves to preview_host when runtime env is unset", () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://vm-fly-jakem.fly.dev";
    expect(getTier2RuntimeMode()).toBe("preview_host");
  });

  it("still reports preview_host even when the base url is missing", () => {
    delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
    expect(getTier2RuntimeMode()).toBe("preview_host");
  });
});

describe("getPreviewHostBaseUrl", () => {
  it("normalizes an accidentally pasted /preview suffix", () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://vm-fly-jakem.fly.dev/preview";
    expect(getPreviewHostBaseUrl()).toBe("https://vm-fly-jakem.fly.dev");
  });

  it("keeps non-preview path prefixes intact", () => {
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://example.com/custom-prefix/";
    expect(getPreviewHostBaseUrl()).toBe("https://example.com/custom-prefix");
  });
});
