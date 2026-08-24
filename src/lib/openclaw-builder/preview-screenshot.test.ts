import { describe, expect, it } from "vitest";

import {
  getPreviewScreenshot,
  type ScreenshotIdentity,
  type ScreenshotPin,
} from "./preview-screenshot";

const HASH_A = "a".repeat(64);
const CAPTURED_AT = "2026-08-24T16:54:00.000Z";

function identity(
  overrides: Partial<ScreenshotIdentity> = {},
): ScreenshotIdentity {
  return {
    tenantId: "tenant-1",
    chatId: "chat-1",
    versionId: "ver-1",
    filesRevision: "rev-1",
    ...overrides,
  };
}

function pin(overrides: Partial<ScreenshotPin> = {}): ScreenshotPin {
  return {
    ...identity(),
    artifactId: "shot-1",
    contentSha256: HASH_A,
    capturedAt: CAPTURED_AT,
    ...overrides,
  };
}

describe("getPreviewScreenshot", () => {
  it("returns the pinned artifact reference on a matching request", () => {
    const result = getPreviewScreenshot({
      job: identity(),
      requester: identity(),
      pin: pin(),
    });
    expect(result).toEqual({
      ok: true,
      tool: "preview.screenshot",
      artifactId: "shot-1",
      contentSha256: HASH_A,
      capturedAt: CAPTURED_AT,
      pinned: true,
    });
    if (result.ok) {
      expect(result).not.toHaveProperty("url");
      expect(result).not.toHaveProperty("bytes");
      expect(result).not.toHaveProperty("content");
      expect(result).not.toHaveProperty("tenantId");
      expect(JSON.stringify(result)).not.toContain("http");
      expect(JSON.stringify(result)).not.toContain("://");
      expect(Object.keys(result).sort()).toEqual(
        [
          "artifactId",
          "capturedAt",
          "contentSha256",
          "ok",
          "pinned",
          "tool",
        ].sort(),
      );
    }
  });

  it("returns not_found when the pin is missing", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: null,
      }),
    ).toEqual({ ok: false, code: "not_found" });
  });

  it("returns identity_mismatch when job and requester tenant or chat differ", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity({ tenantId: "tenant-other" }),
        pin: pin(),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity({ chatId: "chat-other" }),
        pin: pin(),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
  });

  it("returns identity_mismatch when the pin belongs to another tenant or chat", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ tenantId: "tenant-other" }),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ chatId: "chat-other" }),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
  });

  it("returns revision_mismatch when the pin is for another version or revision", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ versionId: "ver-other" }),
      }),
    ).toEqual({ ok: false, code: "revision_mismatch" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ filesRevision: "rev-other" }),
      }),
    ).toEqual({ ok: false, code: "revision_mismatch" });
  });

  it("returns revision_mismatch when job and requester version or revision differ", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity({ versionId: "ver-other" }),
        pin: pin(),
      }),
    ).toEqual({ ok: false, code: "revision_mismatch" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity({ filesRevision: "rev-other" }),
        pin: pin(),
      }),
    ).toEqual({ ok: false, code: "revision_mismatch" });
  });

  it("rejects URL-like artifactId values", () => {
    for (const artifactId of [
      "https://blob.vercel-storage.com/shot.png",
      "http://example.com/shot",
      "shot/path",
      "/absolute-shot",
      "http",
      "HTTP-ID",
    ]) {
      expect(
        getPreviewScreenshot({
          job: identity(),
          requester: identity(),
          pin: pin({ artifactId }),
        }),
      ).toEqual({ ok: false, code: "invalid_pin" });
    }
  });

  it("rejects an empty, overlong, or illegal-charset artifactId", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ artifactId: "" }),
      }),
    ).toEqual({ ok: false, code: "invalid_pin" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ artifactId: "x".repeat(129) }),
      }),
    ).toEqual({ ok: false, code: "invalid_pin" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ artifactId: "shot id" }),
      }),
    ).toEqual({ ok: false, code: "invalid_pin" });
  });

  it("rejects a contentSha256 that is not 64 lowercase hex", () => {
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ contentSha256: "A".repeat(64) }),
      }),
    ).toEqual({ ok: false, code: "invalid_pin" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ contentSha256: "not-a-hash" }),
      }),
    ).toEqual({ ok: false, code: "invalid_pin" });
    expect(
      getPreviewScreenshot({
        job: identity(),
        requester: identity(),
        pin: pin({ contentSha256: HASH_A.slice(0, 63) }),
      }),
    ).toEqual({ ok: false, code: "invalid_pin" });
  });

  it("rejects a capturedAt that is not a valid ISO datetime", () => {
    for (const capturedAt of [
      "",
      "yesterday",
      "2026-08-24",
      "2026-13-40T00:00:00.000Z",
      "August 24, 2026",
    ]) {
      expect(
        getPreviewScreenshot({
          job: identity(),
          requester: identity(),
          pin: pin({ capturedAt }),
        }),
      ).toEqual({ ok: false, code: "invalid_pin" });
    }
  });

  it("does not echo extra pin fields or construct a fetchable URL", () => {
    const stuffed = {
      ...pin(),
      url: "https://secret.example/shot.png",
      bytes: Uint8Array.from([1, 2, 3]),
      apiKey: "sk-live-tenant-secret",
    } as ScreenshotPin & { url: string; bytes: Uint8Array; apiKey: string };

    const result = getPreviewScreenshot({
      job: identity(),
      requester: identity(),
      pin: stuffed,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result).not.toHaveProperty("url");
    expect(result).not.toHaveProperty("bytes");
    expect(result).not.toHaveProperty("apiKey");
    const blob = JSON.stringify(result);
    expect(blob).not.toContain("https://");
    expect(blob).not.toContain("sk-live");
    expect(blob).not.toContain("secret.example");
  });
});
