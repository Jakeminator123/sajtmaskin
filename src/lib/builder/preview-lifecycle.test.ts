import { describe, expect, it } from "vitest";
import {
  derivePreviewLifecycleState,
  shouldBlockPreviewWithLoadingOverlay,
} from "./preview-lifecycle";

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

// Regression (2026-07 preview-lifecycle simplification, punkt 3): background
// verification / preview-session bootstrap must never click-block a live
// preview — the overlay is only allowed when no usable preview is on screen.
describe("shouldBlockPreviewWithLoadingOverlay", () => {
  const base = {
    isCreatingChat: false,
    previewPending: false,
    previewLifecycle: "live" as const,
    currentPreviewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    isAnyStreaming: false,
  };

  it("does NOT block a live tier-2 preview while previewPending (verification/bootstrap in background)", () => {
    expect(
      shouldBlockPreviewWithLoadingOverlay({ ...base, previewPending: true }),
    ).toBe(false);
  });

  it("blocks while previewPending with no preview on screen (cold boot)", () => {
    expect(
      shouldBlockPreviewWithLoadingOverlay({
        ...base,
        previewPending: true,
        previewLifecycle: "bootstrapping",
        currentPreviewUrl: null,
      }),
    ).toBe(true);
  });

  it("blocks while a chat is being created", () => {
    expect(shouldBlockPreviewWithLoadingOverlay({ ...base, isCreatingChat: true })).toBe(true);
  });

  it("blocks while recovering (the shown session is dead)", () => {
    expect(
      shouldBlockPreviewWithLoadingOverlay({ ...base, previewLifecycle: "recovering" }),
    ).toBe(true);
  });

  it("blocks while streaming with no preview URL yet", () => {
    expect(
      shouldBlockPreviewWithLoadingOverlay({
        ...base,
        currentPreviewUrl: null,
        previewLifecycle: "idle",
        isAnyStreaming: true,
      }),
    ).toBe(true);
  });

  it("never blocks an idle live preview", () => {
    expect(shouldBlockPreviewWithLoadingOverlay(base)).toBe(false);
  });
});
