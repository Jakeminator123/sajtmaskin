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
  previewUrl = TIER2_URL,
  lifecycleToken: string | null = "life_1",
): PreviewStatusApiJson {
  return {
    ok: true,
    status: state,
    previewSessionId,
    previewUrl,
    versionId,
    lifecycleToken,
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
    activePreviewLifecycleToken: "life_1",
    isOwnEnginePreview: false,
    onPreviewSessionSuspect: vi.fn(),
    reportOwnEngineRenderFailure: vi.fn(),
    iframeRef: { current: null },
    ...overrides,
  };
}

function makeIframeRef(src = TIER2_URL) {
  let currentSrc = src;
  const setSrc = vi.fn((nextSrc: string) => {
    currentSrc = nextSrc;
  });
  const iframe = {
    getAttribute: vi.fn((name: string) => (name === "src" ? currentSrc : null)),
    setAttribute: vi.fn(),
  } as unknown as HTMLIFrameElement;
  Object.defineProperty(iframe, "src", {
    configurable: true,
    get: () => currentSrc,
    set: setSrc,
  });
  return { current: iframe, setSrc };
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

  it("river inte kvitto-kedjan när föräldern re-renderar med nya callback-identiteter", async () => {
    // Prod 2026-08-31 (chattar 18e55beb, 757d2def): en inline-callback i
    // sidkontrollern bytte identitet varje render, huvudeffekten startade om
    // på varje builder-render och avbröt varje pågående /preview-status-fråga
    // — "running"-kvittot sågs aldrig och frisk sajt dömdes ut på timeout.
    let resolveStatus!: (value: PreviewStatusApiJson) => void;
    fetchPreviewStatus.mockImplementation(
      () => new Promise<PreviewStatusApiJson>((resolve) => (resolveStatus = resolve)),
    );
    const iframeRef = makeIframeRef();
    const { result, rerender } = renderHook(
      (props: Parameters<typeof usePreviewIframe>[0]) => usePreviewIframe(props),
      { initialProps: makeParams({ iframeRef }) },
    );

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    const { signal } = fetchPreviewStatus.mock.calls[0][0] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);

    // Samma preview-identitet, men helt nya funktions-identiteter — exakt vad
    // varje builder-render producerade före fixen.
    rerender(makeParams({ iframeRef }));
    rerender(makeParams({ iframeRef }));

    expect(signal.aborted).toBe(false);
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);

    // Kedjan fullföljer: running-kvitto → ready-reload → onLoad → settle.
    await act(async () => {
      resolveStatus(status("running"));
      await Promise.resolve();
    });
    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
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

  it("aborts lifecycle N status and cannot reload lifecycle N+1 from its late result", async () => {
    let resolveLifecycleN: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus
      .mockReturnValueOnce(
        new Promise<PreviewStatusApiJson>((resolve) => {
          resolveLifecycleN = resolve;
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      activePreviewLifecycleToken: "life_N",
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    const lifecycleNSignal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;

    rerender({ ...initialParams, activePreviewLifecycleToken: "life_N1" });

    expect(lifecycleNSignal.aborted).toBe(true);
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveLifecycleN?.(status("running", "ps_1", "ver_1", TIER2_URL, "life_N"));
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(true);
  });

  it("does not settle a lifecycle N ready-reload onLoad after lifecycle N+1 becomes active", async () => {
    fetchPreviewStatus
      .mockResolvedValueOnce(status("running", "ps_1", "ver_1", TIER2_URL, "life_N"))
      .mockReturnValue(new Promise(() => {}));
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      activePreviewLifecycleToken: "life_N",
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);

    rerender({ ...initialParams, activePreviewLifecycleToken: "life_N1" });
    act(() => result.current.handleIframeLoad());

    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
  });

  it("waits for lifecycle hydration and accepts explicit null for a legacy session", async () => {
    fetchPreviewStatus.mockResolvedValue(
      status("running", "ps_1", "ver_1", TIER2_URL, null),
    );
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      activePreviewLifecycleToken: undefined,
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    expect(fetchPreviewStatus).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...initialParams, activePreviewLifecycleToken: null });
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(result.current.iframeLoading).toBe(true);

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
  });

  it("honors the 90s boot grace and fails closed after the Tier-2 readiness timeout", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("build_error"));
    const params = makeParams();
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    const signal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;
    act(() => vi.advanceTimersByTime(90_000));

    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();

    // The deadline first runs one bounded final status check; a non-running
    // receipt fails exactly like before.
    await act(async () => {
      vi.advanceTimersByTime(8_000);
      await Promise.resolve();
    });

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(signal.aborted).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);

    // A late onLoad cannot restart polling; late recovery hands the terminal
    // receipt to the existing owner once and then stops.
    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(8_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(3);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("visar aldrig timeout-bannern när deadline-kontrollen säger running", async () => {
    // Prod 2026-08-31 (chat a3346e1e): röd preview_ready_timeout-banner över
    // en fungerande v2. Ett running-kvitto som hinner fram exakt vid
    // deadline ska gå till ready-reload — inte till bannern.
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(status("running"));
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBeNull();
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
  });

  it("adopterar en roterad session vid deadline-kontrollen i stället för banner", async () => {
    // Prod 2026-09-01 (chat c2371f9c): follow-up mot hibernerad VM handoffade
    // gamla sessionen (ps_1) medan boot:en kom upp som ps_2/life_2 för samma
    // version och URL. Deadline-kontrollen ska adoptera identiteten — inte
    // fälla banner + suspect.
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(status("running", "ps_2", "ver_1", TIER2_URL, "life_2"));
    const onPreviewSessionRotated = vi.fn();
    const params = makeParams({ iframeRef: makeIframeRef(), onPreviewSessionRotated });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    expect(onPreviewSessionRotated).toHaveBeenCalledTimes(1);
    expect(onPreviewSessionRotated).toHaveBeenCalledWith({
      previewSessionId: "ps_2",
      versionId: "ver_1",
      lifecycleToken: "life_2",
    });
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
  });

  it("adopterar rotation under den vanliga statuspollen utan suspect-rapport", async () => {
    fetchPreviewStatus.mockResolvedValue(
      status("running", "ps_2", "ver_1", TIER2_URL, "life_2"),
    );
    const onPreviewSessionRotated = vi.fn();
    const params = makeParams({ iframeRef: makeIframeRef(), onPreviewSessionRotated });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      await Promise.resolve();
    });

    expect(onPreviewSessionRotated).toHaveBeenCalledTimes(1);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
    expect(result.current.iframeError).toBe(false);
    // Adoption stops this chain; no further polling with the stale identity.
    act(() => vi.advanceTimersByTime(8_000));
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
  });

  it("läker hela vägen: rotation → adopterade props → verifierad ready-reload", async () => {
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    fetchPreviewStatus.mockResolvedValue(
      status("running", "ps_2", "ver_1", TIER2_URL, "life_2"),
    );
    const onPreviewSessionRotated = vi.fn();
    const initialParams = makeParams({ iframeRef, onPreviewSessionRotated });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      await Promise.resolve();
    });
    expect(onPreviewSessionRotated).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();

    // Controllern adopterar identiteten → props uppdateras → kedjan startar om
    // och det matchande running-kvittot går till den verifierade ready-reloaden.
    await act(async () => {
      rerender(
        makeParams({
          iframeRef,
          onPreviewSessionRotated,
          activePreviewSessionId: "ps_2",
          activePreviewLifecycleToken: "life_2",
        }),
      );
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);
    expect(onPreviewSessionRotated).toHaveBeenCalledTimes(1);

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
  });

  it("utan adoptionscallback behåller ett roterat kvitto legacy-failbeteendet", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(status("running", "ps_2", "ver_1", TIER2_URL, "life_2"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("adopterar aldrig rotation för fel version eller annan chat-URL", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      // Fel version: samma URL, ny session — men kvittot gäller ver_2.
      .mockResolvedValueOnce(status("running", "ps_2", "ver_2", TIER2_URL, "life_2"));
    const onPreviewSessionRotated = vi.fn();
    const params = makeParams({ iframeRef: makeIframeRef(), onPreviewSessionRotated });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    expect(onPreviewSessionRotated).not.toHaveBeenCalled();
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("failar ändå när deadline-kontrollen själv hänger (bunden vakt)", async () => {
    fetchPreviewStatus.mockReturnValue(new Promise(() => {}));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(98_000));
    expect(result.current.iframeError).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("late-recovers the same Tier-2 identity through a verified same-src reload", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(status("starting"))
      .mockResolvedValueOnce(status("running"));
    const decoratedSrc = `${TIER2_URL}/boka?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ previewUrl: `${TIER2_URL}/boka`, iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    // Deadline: final check consumes the starting receipt and fails as before.
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(3);
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);

    act(() => result.current.handleIframeLoad());

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("stops the 4s late-recovery cadence after 30 seconds and continues a sparse self-heal poll", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    // Deadline: the bounded final check consumes one starting receipt first.
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    for (let index = 0; index < 7; index += 1) {
      await act(async () => {
        vi.advanceTimersByTime(4_000);
        await Promise.resolve();
      });
    }

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(9);
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    // 4s cadence must not fire again. The 30s window ends 2s after the
    // seventh late-recovery tick; the first self-heal read waits 12s more.
    await act(async () => {
      vi.advanceTimersByTime(13_999);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(9);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(10);
    expect(result.current.iframeError).toBe(false);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("self-heals a stale preview_ready_timeout banner via ready-reload after a late matching running receipt", async () => {
    // Prod 2026-08-31 (chat 47607bca): Fly finished after both the 98s
    // boot deadline and the 30s late-recovery tail. The red banner stayed
    // over a running v2 because nothing kept reading /preview-status.
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(result.current.iframeError).toBe(false);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();

    fetchPreviewStatus.mockResolvedValue(status("running"));
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBeNull();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
  });

  it("återupptar self-heal efter en ready-reload vars onLoad missar 15s-fönstret (SM-074)", async () => {
    // Prod 2026-09-01 (chat 4cac8fb0): hosten rapporterade ready men första
    // sidladdningen efter VM-omstarten tog >15 s på delad CPU. Den enda
    // ready-reloaden timeoutade och hela läkningen dog — bannern satt kvar
    // permanent på en frisk sajt tills identiteten råkade bytas.
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    // Första matchande kvittot → reload #1, vars onLoad aldrig hinner.
    fetchPreviewStatus.mockResolvedValue(status("running"));
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");

    // Pollen ska ha återupptagits: nästa kvitto ger reload #2 …
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(2);
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);

    // … och den här gången hinner sidan ladda → banner borta, allt friskt.
    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBeNull();
  });

  it("återupptar self-heal när boot-pollens ready-reload missar 15s-fönstret", async () => {
    fetchPreviewStatus.mockResolvedValue(status("running"));
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(result.current.iframeLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");

    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(2);
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
  });

  it.each(["stopped", "missing", "build_error"] as const)(
    "stoppar self-heal-pollen vid terminal status %s",
    async (state) => {
      fetchPreviewStatus
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValue(status("starting"));
      const iframeRef = makeIframeRef();
      const params = makeParams({ iframeRef });
      const { result } = renderHook(() => usePreviewIframe(params));

      act(() => result.current.handleIframeLoad());
      await act(async () => {
        vi.advanceTimersByTime(98_000);
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });

      fetchPreviewStatus.mockResolvedValue(status(state));
      await act(async () => {
        vi.advanceTimersByTime(12_000);
        await Promise.resolve();
      });
      const callsAfterTerminal = fetchPreviewStatus.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(36_000);
        await Promise.resolve();
      });
      expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAfterTerminal);
      expect(iframeRef.setSrc).not.toHaveBeenCalled();
      expect(result.current.iframeError).toBe(false);
    },
  );

  it("stoppar self-heal när /preview-status svarar missing med null-identitet", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    fetchPreviewStatus.mockResolvedValue({
      ok: true,
      status: "missing",
      previewSessionId: null,
      previewUrl: null,
      versionId: null,
      lifecycleToken: null,
      sessionExpiresAt: null,
      reason: "no_session",
    });
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    const callsAfterMissing = fetchPreviewStatus.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(36_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAfterMissing);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeError).toBe(false);
  });

  it("stoppar self-heal vid version_mismatch med sessionens versionId", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    fetchPreviewStatus.mockResolvedValue(
      status("version_mismatch", "ps_1", "ver_other", TIER2_URL, "life_1"),
    );
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    const callsAfterMismatch = fetchPreviewStatus.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(36_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAfterMismatch);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeError).toBe(false);
  });

  it("adopterar en roterad session på den glesa self-heal-pollen", async () => {
    // Merge av #1232: rotation måste läsas även här, inte bara på boot/deadline.
    // Annars läker 12s-pollen evigt mot ps_ny medan tabben fortfarande har ps_gammal.
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const onPreviewSessionRotated = vi.fn();
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef, onPreviewSessionRotated });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    fetchPreviewStatus.mockResolvedValue(
      status("running", "ps_2", "ver_1", TIER2_URL, "life_2"),
    );
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });

    expect(onPreviewSessionRotated).toHaveBeenCalledTimes(1);
    expect(onPreviewSessionRotated).toHaveBeenCalledWith({
      previewSessionId: "ps_2",
      versionId: "ver_1",
      lifecycleToken: "life_2",
    });
    // Suspect redan från 98s-deadlinen; adoptionen får inte starta en ny pollkedja.
    const callsAfterRotation = fetchPreviewStatus.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(36_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAfterRotation);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeError).toBe(false);
  });

  it("ger upp self-heal-reloads efter taket så ingen reload-loop uppstår", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    fetchPreviewStatus.mockResolvedValue(status("running"));
    // Tre kvitto→reload→timeout-varv förbrukar hela budgeten.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        vi.advanceTimersByTime(12_000);
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(15_000);
        await Promise.resolve();
      });
    }
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(3);
    const callsAfterBudget = fetchPreviewStatus.mock.calls.length;

    // Budgeten är slut: inga fler reloads och ingen fortsatt poll.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(3);
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAfterBudget);
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
  });

  it("does not clear the timeout banner on a mismatched self-heal receipt", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    fetchPreviewStatus.mockResolvedValue(status("running", "ps_stale"));
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });

    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("stops self-heal polling on unmount", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result, unmount } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    const callsAtUnmount = fetchPreviewStatus.mock.calls.length;
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(36_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAtUnmount);
  });

  it("stops self-heal polling when previewSrc identity changes", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const firstParams = makeParams({ iframeRef });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: firstParams,
    });

    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    const callsBeforeSrcChange = fetchPreviewStatus.mock.calls.length;

    rerender({
      ...firstParams,
      previewUrl: "https://vm-other.fly.dev/chat_1",
    });

    await act(async () => {
      vi.advanceTimersByTime(36_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsBeforeSrcChange);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
  });

  it.each([
    ["session", status("running", "ps_stale")],
    ["version", status("running", "ps_1", "ver_stale")],
    ["URL", status("running", "ps_1", "ver_1", "https://vm-other.fly.dev/chat_1")],
    ["chat path", status("running", "ps_1", "ver_1", "https://vm-test.fly.dev/chat_2")],
    [
      "lifecycle",
      status("running", "ps_1", "ver_1", TIER2_URL, "life_stale"),
    ],
  ])("rejects a late running receipt with mismatched %s", async (_label, lateStatus) => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(lateStatus);
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    // The deadline's final check must reject the mismatched receipt too.
    await act(async () => {
      vi.advanceTimersByTime(98_000);
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    // Late recovery reads the same mismatched receipt once and ends silently.
    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(3);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("aborts a late lifecycle N recovery when lifecycle N+1 becomes active", async () => {
    let resolveLate: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(
        new Promise<PreviewStatusApiJson>((resolve) => {
          resolveLate = resolve;
        }),
      );
    const iframeRef = makeIframeRef();
    const firstParams = makeParams({ activePreviewLifecycleToken: "life_N", iframeRef });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: firstParams,
    });

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(98_000));
    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });
    const lateSignal = fetchPreviewStatus.mock.calls[1]?.[0]?.signal as AbortSignal;

    rerender({ ...firstParams, activePreviewLifecycleToken: "life_N1" });
    expect(lateSignal.aborted).toBe(true);

    await act(async () => {
      resolveLate?.(status("running", "ps_1", "ver_1", TIER2_URL, "life_N"));
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(true);
  });

  it("makes the boot timeout inert when running arrives just before its deadline", async () => {
    let resolveStatus: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus.mockReturnValueOnce(
      new Promise<PreviewStatusApiJson>((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(97_999));

    await act(async () => {
      resolveStatus?.(status("running"));
      await Promise.resolve();
    });

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
  });

  it("fails closed if the ready reload never emits onLoad", async () => {
    fetchPreviewStatus.mockResolvedValue(status("running"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(15_000));

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("explicitly reloads the decorated controlled src and keeps the readiness gate closed", async () => {
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => {
      expect(result.current.reloadControlledPreview()).toBe(true);
    });

    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);
    act(() => vi.advanceTimersByTime(97_999));
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();

    // Deadline: the final check gets no receipt and fails as before.
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
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

  it.each(["starting", "running"] as const)(
    "hands a mismatched %s receipt to recovery without waiting for timeout",
    async (state) => {
      fetchPreviewStatus.mockResolvedValue(status(state, "ps_stale", "ver_stale"));
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
    },
  );

  it.each(["starting", "running"] as const)(
    "hands a lifecycle-mismatched %s receipt to recovery without waiting for timeout",
    async (state) => {
      fetchPreviewStatus.mockResolvedValue(
        status(state, "ps_1", "ver_1", TIER2_URL, "life_stale"),
      );
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
    },
  );
});
