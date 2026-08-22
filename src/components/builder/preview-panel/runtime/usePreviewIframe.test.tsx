import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewIframe } from "./usePreviewIframe";

const TIER2_URL = "https://preview.example/chat_1";

function renderTier2Iframe(onPreviewSessionSuspect = vi.fn()) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("src", `${TIER2_URL}?__sm_viewer=viewer_1`);
  const iframeRef = { current: iframe };
  const hook = renderHook(() =>
    usePreviewIframe({
      previewUrl: TIER2_URL,
      chatId: "chat_1",
      versionId: "version_1",
      isOwnEnginePreview: false,
      onPreviewSessionSuspect,
      reportOwnEngineRenderFailure: vi.fn(),
      iframeRef,
    }),
  );
  return { ...hook, iframe, onPreviewSessionSuspect };
}

describe("usePreviewIframe — controlled Tier-2 reload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES", "preview.example");
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("reloads the decorated src once and marks the session suspect after 30 seconds", () => {
    const { result, iframe, onPreviewSessionSuspect } = renderTier2Iframe();
    const setAttribute = vi.spyOn(iframe, "setAttribute");

    act(() => {
      expect(result.current.reloadControlledPreview()).toBe(true);
    });

    expect(setAttribute).toHaveBeenCalledTimes(1);
    expect(setAttribute).toHaveBeenCalledWith(
      "src",
      `${TIER2_URL}?__sm_viewer=viewer_1`,
    );
    act(() => vi.advanceTimersByTime(29_999));
    expect(onPreviewSessionSuspect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("cancels the reload timeout when the iframe loads", () => {
    const { result, onPreviewSessionSuspect } = renderTier2Iframe();

    act(() => {
      expect(result.current.reloadControlledPreview()).toBe(true);
      result.current.handleIframeLoad();
    });
    act(() => vi.advanceTimersByTime(30_000));

    expect(onPreviewSessionSuspect).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(false);
  });
});
