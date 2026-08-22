import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchPreviewStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/builder/preview-session/api", () => ({ fetchPreviewStatus }));

import { usePreviewIframe } from "./usePreviewIframe";
import type { PreviewStatusApiJson } from "@/lib/gen/preview/preview-contract";

const TIER2_URL = "https://vm-test.fly.dev/chat_1";

function status(
  state: PreviewStatusApiJson["status"],
  previewSessionId = "ps_1",
  versionId = "ver_1",
): PreviewStatusApiJson {
  return {
    ok: true,
    status: state,
    previewSessionId,
    previewUrl: TIER2_URL,
    versionId,
    sessionExpiresAt: null,
  };
}

function makeParams(overrides: Partial<Parameters<typeof usePreviewIframe>[0]> = {}) {
  return {
    previewUrl: TIER2_URL,
    refreshToken: 0,
    chatId: "chat_1",
    versionId: "ver_1",
    activePreviewSessionId: "ps_1",
    isOwnEnginePreview: false,
    onPreviewSessionSuspect: vi.fn(),
    reportOwnEngineRenderFailure: vi.fn(),
    iframeRef: { current: null },
    ...overrides,
  };
}

function makeIframeRef(src = TIER2_URL) {
  const iframe = {
    src,
    getAttribute: vi.fn((name: string) => (name === "src" ? src : null)),
  } as unknown as HTMLIFrameElement;
  return { current: iframe };
}

describe("usePreviewIframe — Tier-2 readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchPreviewStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps raw external onLoad behavior unchanged", () => {
    const params = makeParams({
      previewUrl: "https://external.example/preview",
      activePreviewSessionId: null,
    });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());

    expect(result.current.iframeLoading).toBe(false);
    expect(fetchPreviewStatus).not.toHaveBeenCalled();
  });

  it("keeps loading while Tier-2 is starting and unlocks only on exact running status", async () => {
    fetchPreviewStatus
      .mockResolvedValueOnce(status("starting"))
      .mockResolvedValueOnce(status("running"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    expect(result.current.iframeLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    // A running receipt forces a same-src reload so the host's HTTP-200
    // starting document cannot be revealed before runtime content loads.
    expect(result.current.iframeLoading).toBe(true);
    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
  });

  it("starts the gate when version and session metadata arrive after the iframe loaded", async () => {
    fetchPreviewStatus.mockResolvedValue(status("running"));
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      versionId: null,
      activePreviewSessionId: null,
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    expect(fetchPreviewStatus).not.toHaveBeenCalled();

    await act(async () => {
      rerender(makeParams({ activePreviewSessionId: "ps_1", iframeRef }));
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    expect(result.current.iframeLoading).toBe(true);
    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
  });

  it("ignores and aborts a stale status response after session identity changes", async () => {
    let resolveFirst: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus.mockReturnValueOnce(
      new Promise<PreviewStatusApiJson>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const firstParams = makeParams();
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: firstParams,
    });

    act(() => result.current.handleIframeLoad());
    const firstSignal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;

    rerender(makeParams({ activePreviewSessionId: "ps_2" }));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      resolveFirst?.(status("running", "ps_1"));
      await Promise.resolve();
    });

    expect(result.current.iframeLoading).toBe(true);
  });

  it("settles loading and requests recovery after the Tier-2 readiness timeout", () => {
    fetchPreviewStatus.mockReturnValueOnce(new Promise(() => {}));
    const params = makeParams();
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    const signal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;
    act(() => vi.advanceTimersByTime(30_000));

    expect(result.current.iframeLoading).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    const callsAtTimeout = fetchPreviewStatus.mock.calls.length;
    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(8_000));
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAtTimeout);
  });

  it("hands terminal status to recovery once without continuing the poll", async () => {
    fetchPreviewStatus.mockResolvedValue(status("build_error"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });

    expect(result.current.iframeLoading).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(8_000));
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
  });
});
