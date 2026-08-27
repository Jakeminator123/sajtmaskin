import { beforeEach, describe, expect, it, vi } from "vitest";

const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gen/preview/session-store", () => ({ getActivePreviewSessionAsync }));

import {
  isInspectorCompatibilityPreviewUrl,
  isInspectorPreviewIdentityCurrent,
  parseInspectorPreviewIdentity,
} from "./inspector-preview-identity";

describe("isInspectorCompatibilityPreviewUrl", () => {
  it("allows only the exact same-origin preview-render shim", () => {
    const appUrl = "http://localhost:3000/api/inspector-element-map";
    expect(
      isInspectorCompatibilityPreviewUrl(
        "http://localhost:3000/api/preview-render?chatId=c1",
        appUrl,
      ),
    ).toBe(true);
    expect(
      isInspectorCompatibilityPreviewUrl("http://localhost:3000/api/admin", appUrl),
    ).toBe(false);
    expect(
      isInspectorCompatibilityPreviewUrl(
        "http://127.0.0.1:3000/api/preview-render?chatId=c1",
        appUrl,
      ),
    ).toBe(false);
  });
});

describe("parseInspectorPreviewIdentity", () => {
  it("keeps tuple-less compatibility requests separate from partial identities", () => {
    expect(parseInspectorPreviewIdentity({ url: "https://example.test" }).status).toBe("absent");
    expect(
      parseInspectorPreviewIdentity({ chatId: "c1", versionId: "v1" }).status,
    ).toBe("invalid");
  });

  it("requires an explicit lifecycle value, including null for legacy", () => {
    expect(
      parseInspectorPreviewIdentity({
        chatId: "c1",
        versionId: "v1",
        previewSessionId: "ps1",
      }).status,
    ).toBe("invalid");
    expect(
      parseInspectorPreviewIdentity({
        chatId: "c1",
        versionId: "v1",
        previewSessionId: "ps1",
        lifecycleToken: null,
      }).status,
    ).toBe("valid");
  });
});

describe("isInspectorPreviewIdentityCurrent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      lifecycleToken: "life1",
      versionId: "v1",
      previewUrl: "https://vm.fly.dev/c1",
    });
  });

  it("accepts a route below the exact current preview tuple", async () => {
    await expect(
      isInspectorPreviewIdentityCurrent(
        {
          chatId: "c1",
          versionId: "v1",
          previewSessionId: "ps1",
          lifecycleToken: "life1",
        },
        "https://vm.fly.dev/c1/about?inspect=1",
      ),
    ).resolves.toBe(true);
  });

  it("rejects a stale lifecycle or another preview path", async () => {
    await expect(
      isInspectorPreviewIdentityCurrent(
        {
          chatId: "c1",
          versionId: "v1",
          previewSessionId: "ps1",
          lifecycleToken: "old",
        },
        "https://vm.fly.dev/c1",
      ),
    ).resolves.toBe(false);
    await expect(
      isInspectorPreviewIdentityCurrent(
        {
          chatId: "c1",
          versionId: "v1",
          previewSessionId: "ps1",
          lifecycleToken: "life1",
        },
        "https://vm.fly.dev/c10",
      ),
    ).resolves.toBe(false);
  });

  it("accepts any same-origin route when the current session URL is rooted at slash", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      lifecycleToken: "life1",
      versionId: "v1",
      previewUrl: "https://preview.example/",
    });

    await expect(
      isInspectorPreviewIdentityCurrent(
        {
          chatId: "c1",
          versionId: "v1",
          previewSessionId: "ps1",
          lifecycleToken: "life1",
        },
        "https://preview.example/about",
      ),
    ).resolves.toBe(true);
  });
});
