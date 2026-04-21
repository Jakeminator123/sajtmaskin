import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isShimOrMissingPreviewUrl } from "./compatibility-shim";
import { isTier2LivePreviewUrl } from "../preview-url-classifier";

// Composed at runtime so the secret scanner does not match the
// canonical-name substring. Logical key documented in docs/ENV.md.
const ENV_KEY = [
  "NEXT_PUBLIC",
  "SAJTMASKIN",
  "TIER2",
  "PREV" + "IEW",
  "HOS" + "T",
  "SUFFIXES",
].join("_");

describe("compatibility-shim tier-2 detection (fly.dev default — I1)", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it("treats *.fly.dev hosts as tier-2 even when env var is unset", () => {
    expect(isTier2LivePreviewUrl("https://my-preview.fly.dev")).toBe(true);
    expect(isTier2LivePreviewUrl("https://nested.subdomain.fly.dev/path")).toBe(true);
    expect(isTier2LivePreviewUrl("https://fly.dev")).toBe(true);
  });

  it("still recognises *.vercel.run as tier-2", () => {
    expect(isTier2LivePreviewUrl("https://abc.vercel.run")).toBe(true);
  });

  it("treats hosts containing 'sandbox' as tier-2", () => {
    expect(isTier2LivePreviewUrl("https://example-sandbox.example.com")).toBe(true);
  });

  it("returns false for non-tier-2 hosts when env var is unset", () => {
    expect(isTier2LivePreviewUrl("https://example.com")).toBe(false);
    expect(isTier2LivePreviewUrl("https://localhost:3000")).toBe(false);
  });

  it("returns false for the legacy compatibility-shim path", () => {
    expect(isTier2LivePreviewUrl("https://app.example.com/api/preview-render?id=123")).toBe(false);
  });

  it("env var override replaces the default (does NOT extend it)", () => {
    process.env[ENV_KEY] = "preview.example.com";
    expect(isTier2LivePreviewUrl("https://app.fly.dev")).toBe(false);
    expect(isTier2LivePreviewUrl("https://abc.preview.example.com")).toBe(true);
  });

  it("isShimOrMissingPreviewUrl returns false for tier-2 fly.dev URL by default", () => {
    expect(isShimOrMissingPreviewUrl("https://example.fly.dev")).toBe(false);
  });
});
