import { describe, expect, it } from "vitest";
import { derivePreviewLifecycleState } from "./preview-lifecycle";

describe("derivePreviewLifecycleState", () => {
  it("returns failed when preview session is disabled", () => {
    expect(
      derivePreviewLifecycleState({
        previewBuildErrorStage: "preview_session_disabled",
        hasPreviewBuildError: true,
        previewSessionRecovering: false,
        previewPending: false,
        currentPreviewUrl: null,
      }),
    ).toBe("failed");
  });

  it("returns recovering before bootstrapping and errors", () => {
    expect(
      derivePreviewLifecycleState({
        previewBuildErrorStage: null,
        hasPreviewBuildError: true,
        previewSessionRecovering: true,
        previewPending: true,
        currentPreviewUrl: "https://example.com",
      }),
    ).toBe("recovering");
  });

  it("returns bootstrapping when pending and not recovering", () => {
    expect(
      derivePreviewLifecycleState({
        previewBuildErrorStage: null,
        hasPreviewBuildError: false,
        previewSessionRecovering: false,
        previewPending: true,
        currentPreviewUrl: null,
      }),
    ).toBe("bootstrapping");
  });

  it("returns live for tier-2 URLs", () => {
    expect(
      derivePreviewLifecycleState({
        previewBuildErrorStage: null,
        hasPreviewBuildError: false,
        previewSessionRecovering: false,
        previewPending: false,
        currentPreviewUrl: "https://chat-preview.vercel.run",
      }),
    ).toBe("live");
  });

  it("returns idle for shim preview URLs", () => {
    expect(
      derivePreviewLifecycleState({
        previewBuildErrorStage: null,
        hasPreviewBuildError: false,
        previewSessionRecovering: false,
        previewPending: false,
        currentPreviewUrl: "/api/preview-render?chatId=c1",
      }),
    ).toBe("idle");
  });
});
