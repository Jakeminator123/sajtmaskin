import { describe, expect, it, vi } from "vitest";

const resolveEngineDemoUrlDetails = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/demo-url", () => ({
  resolveEngineDemoUrlDetails,
}));

import { buildOwnEnginePreviewRuntime, isSafeRelativePath } from "./runtime-url";

describe("runtime-url helpers", () => {
  it("accepts Next.js route-group and dynamic segment paths", () => {
    expect(isSafeRelativePath("app/(marketing)/[slug]/page.tsx")).toBe(true);
    expect(isSafeRelativePath("app/@modal/(.)photos/[id]/page.tsx")).toBe(true);
    expect(isSafeRelativePath("app/blog/[...slug]/page.tsx")).toBe(true);
  });

  it("labels resolved sandbox URLs as sandbox mode", () => {
    resolveEngineDemoUrlDetails.mockReturnValue({
      demoUrl: "https://sandbox.example/ver_1",
      legacyPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
      mode: "runtime",
    });

    expect(
      buildOwnEnginePreviewRuntime({
        chatId: "chat_1",
        versionId: "ver_1",
        sandboxUrl: "https://sandbox.example/ver_1",
      }),
    ).toMatchObject({
      mode: "sandbox",
      url: "https://sandbox.example/ver_1",
    });
  });

  it("passes through full version lifecycle context when provided", () => {
    const version = {
      id: "ver_failed",
      verification_state: "failed",
      sandbox_url: "https://sandbox.example/ver_failed",
    };
    resolveEngineDemoUrlDetails.mockReturnValue({
      demoUrl: null,
      legacyPreviewUrl: null,
      mode: "none",
    });

    buildOwnEnginePreviewRuntime({
      chatId: "chat_1",
      versionId: "ver_failed",
      version,
    });

    expect(resolveEngineDemoUrlDetails).toHaveBeenLastCalledWith("chat_1", version, undefined);
  });
});
