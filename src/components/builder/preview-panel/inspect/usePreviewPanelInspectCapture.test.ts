// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";
import type { JsxElementRegistryItem, RegistryMatch } from "@/lib/builder/jsx-element-registry";
import type { FileNode } from "@/lib/builder/types";

const dispatchInspectCaptureEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/builder/inspect-events", () => ({ dispatchInspectCaptureEvent }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { usePreviewPanelInspectCapture } from "./usePreviewPanelInspectCapture";

function clickEvent() {
  return {
    clientX: 640,
    clientY: 400,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
    },
  } as unknown as MouseEvent<HTMLDivElement>;
}

describe("usePreviewPanelInspectCapture — preview identity fence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not dispatch a late screenshot from the previous lifecycle", async () => {
    let resolveCapture!: (value: Response) => void;
    const captureResponse = new Promise<Response>((resolve) => {
      resolveCapture = resolve;
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => captureResponse);
    vi.stubGlobal("fetch", fetchMock);
    const setLastCodeMatch = vi.fn();

    const rendered = renderHook(
      ({ versionId, lifecycleToken }) =>
        usePreviewPanelInspectCapture({
          inspectorEnabled: true,
          previewUrl: "https://vm.fly.dev/chat_1",
          inspectMode: true,
          iframeLoading: false,
          externalLoading: false,
          inspectEngine: "playwright",
          hoveredMapElement: null,
          chatId: "chat_1",
          versionId,
          previewSessionId: "ps_1",
          lifecycleToken,
          identityReady: true,
          flatFilesForAi: [],
          elementRegistryRef: { current: [] } as MutableRefObject<JsxElementRegistryItem[]>,
          setFiles: vi.fn() as unknown as Dispatch<SetStateAction<FileNode[]>>,
          setInspectStatus: vi.fn(),
          setLastCodeMatch:
            setLastCodeMatch as unknown as Dispatch<SetStateAction<RegistryMatch | null>>,
          setLastAiCostDisplay: vi.fn(),
          setTotalAiCostUsd: vi.fn(),
        }),
      { initialProps: { versionId: "ver_old", lifecycleToken: "life_old" } },
    );

    act(() => {
      void rendered.result.current.handleCaptureClick(clickEvent());
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        versionId: "ver_old",
        previewSessionId: "ps_1",
        lifecycleToken: "life_old",
      }),
    );

    setLastCodeMatch.mockClear();
    rendered.rerender({ versionId: "ver_new", lifecycleToken: "life_new" });

    await act(async () => {
      resolveCapture(
        new Response(
          JSON.stringify({
          success: true,
          capturedUrl: "https://vm.fly.dev/chat_1",
          pointSummary: "stale",
          element: { tag: "button", text: "Old CTA" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await captureResponse;
    });

    expect(dispatchInspectCaptureEvent).not.toHaveBeenCalled();
    expect(setLastCodeMatch).not.toHaveBeenCalled();
  });

  it("drops a server stale-identity response and requests preview resync", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          staleIdentity: true,
          error: "Previewen har bytt version eller session.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onPreviewIdentityStale = vi.fn();
    const setInspectStatus = vi.fn();

    const rendered = renderHook(() =>
      usePreviewPanelInspectCapture({
        inspectorEnabled: true,
        previewUrl: "https://vm.fly.dev/chat_1",
        inspectMode: true,
        iframeLoading: false,
        externalLoading: false,
        inspectEngine: "playwright",
        hoveredMapElement: null,
        chatId: "chat_1",
        versionId: "ver_1",
        previewSessionId: "ps_1",
        lifecycleToken: "life_1",
        identityReady: true,
        onPreviewIdentityStale,
        flatFilesForAi: [],
        elementRegistryRef: { current: [] } as MutableRefObject<JsxElementRegistryItem[]>,
        setFiles: vi.fn() as unknown as Dispatch<SetStateAction<FileNode[]>>,
        setInspectStatus,
        setLastCodeMatch: vi.fn(),
        setLastAiCostDisplay: vi.fn(),
        setTotalAiCostUsd: vi.fn(),
      }),
    );

    await act(async () => {
      await rendered.result.current.handleCaptureClick(clickEvent());
    });

    expect(onPreviewIdentityStale).toHaveBeenCalledTimes(1);
    expect(setInspectStatus).toHaveBeenCalledWith(
      "Previewen byttes under inspektionen — synkar aktuell version.",
    );
    expect(dispatchInspectCaptureEvent).not.toHaveBeenCalled();
  });

  it("does not start Playwright capture before the full tuple is ready", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const rendered = renderHook(() =>
      usePreviewPanelInspectCapture({
        inspectorEnabled: true,
        previewUrl: "http://localhost:3000/api/preview-render?chatId=chat_1",
        inspectMode: true,
        iframeLoading: false,
        externalLoading: false,
        inspectEngine: "playwright",
        hoveredMapElement: null,
        chatId: "chat_1",
        versionId: "ver_1",
        previewSessionId: null,
        lifecycleToken: undefined,
        identityReady: false,
        flatFilesForAi: [],
        elementRegistryRef: { current: [] } as MutableRefObject<JsxElementRegistryItem[]>,
        setFiles: vi.fn() as unknown as Dispatch<SetStateAction<FileNode[]>>,
        setInspectStatus: vi.fn(),
        setLastCodeMatch: vi.fn(),
        setLastAiCostDisplay: vi.fn(),
        setTotalAiCostUsd: vi.fn(),
      }),
    );

    act(() => {
      void rendered.result.current.handleCaptureClick(clickEvent());
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
