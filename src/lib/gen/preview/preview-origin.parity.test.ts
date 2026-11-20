import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_ORIGIN_DOMAIN,
  PREVIEW_ORIGIN_SLUG_RE,
  getPreviewOriginCspSource,
  getPreviewOriginDomain,
  isPreviewOriginHost,
} from "./preview-origin";

const require = createRequire(import.meta.url);
const hostOrigin = require("../../../../preview-host/src/runtime/preview-origin.js") as {
  PREVIEW_ORIGIN_SLUG_RE: RegExp;
  previewOriginSlugForChat: (chatId: string) => string;
};

const ENV_KEY = "NEXT_PUBLIC_SAJTMASKIN_PREVIEW_ORIGIN_DOMAIN";
const ORIGINAL = process.env[ENV_KEY];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = ORIGINAL;
});

describe("per-chat preview origin host/app parity (M03)", () => {
  it("uses the same slug pattern on host and app", () => {
    expect(hostOrigin.PREVIEW_ORIGIN_SLUG_RE.source).toBe(PREVIEW_ORIGIN_SLUG_RE.source);
  });

  it("accepts every slug the host mints, including mixed-case and underscore chatIds", () => {
    delete process.env[ENV_KEY];
    for (const chatId of ["chat_1", "Chat-ABC_123", "a", "x".repeat(120)]) {
      const slug = hostOrigin.previewOriginSlugForChat(chatId);
      expect(isPreviewOriginHost(`${slug}.${DEFAULT_PREVIEW_ORIGIN_DOMAIN}`)).toBe(true);
    }
    expect(hostOrigin.previewOriginSlugForChat("chat_1")).not.toBe(
      hostOrigin.previewOriginSlugForChat("chat_2"),
    );
  });
});

describe("isPreviewOriginHost", () => {
  const slug = "p-0123456789abcdef0123";

  it("matches exactly one slug label under the default domain", () => {
    delete process.env[ENV_KEY];
    expect(getPreviewOriginDomain()).toBe("vm.sajtmaskin.com");
    expect(isPreviewOriginHost(`${slug}.vm.sajtmaskin.com`)).toBe(true);
    expect(isPreviewOriginHost(`${slug}.VM.Sajtmaskin.com.`)).toBe(true);
  });

  it("rejects the bare domain, other labels, nested labels and look-alike suffixes", () => {
    delete process.env[ENV_KEY];
    for (const host of [
      "vm.sajtmaskin.com",
      "www.vm.sajtmaskin.com",
      `x.${slug}.vm.sajtmaskin.com`,
      `${slug}.vm.sajtmaskin.com.evil.example`,
      `${slug}evil.vm.sajtmaskin.com`,
      `${slug}.vm-sajtmaskin.com`,
      "p-0123.vm.sajtmaskin.com",
      `${slug}.sajtmaskin.se`,
      "",
    ]) {
      expect(isPreviewOriginHost(host), host).toBe(false);
    }
    expect(isPreviewOriginHost(null)).toBe(false);
  });

  it("follows the env override and ignores invalid values", () => {
    process.env[ENV_KEY] = " Previews.Example.NET. ";
    expect(getPreviewOriginDomain()).toBe("previews.example.net");
    expect(isPreviewOriginHost(`${slug}.previews.example.net`)).toBe(true);
    expect(isPreviewOriginHost(`${slug}.vm.sajtmaskin.com`)).toBe(false);
    expect(getPreviewOriginCspSource()).toBe("https://*.previews.example.net");

    process.env[ENV_KEY] = "https://*.bad";
    expect(getPreviewOriginDomain()).toBe(DEFAULT_PREVIEW_ORIGIN_DOMAIN);
  });
});
