import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBuilderCallbacks } from "./useBuilderCallbacks";

describe("useBuilderCallbacks handleVersionSelect", () => {
  it("prefers preview URL for own-engine rows over shim demoUrl argument", () => {
    const setCurrentPreviewUrl = vi.fn();
    const bumpPreviewRefreshToken = vi.fn();
    const { result } = renderHook(() =>
      useBuilderCallbacks({
        chatId: "chat_1",
        currentPreviewUrl: null,
        sendMessage: vi.fn(),
        effectiveVersionsList: [
          {
            versionId: "ver_1",
            id: "ver_1",
            canPin: false,
            previewUrl: "https://proj-abc.sandbox.vercel.run",
            demoUrl: null,
            legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_1",
          },
        ],
        bumpPreviewRefreshToken,
        setCurrentPreviewUrl,
        setSelectedVersionId: vi.fn(),
        setIsVersionPanelCollapsed: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleVersionSelect("ver_1", "/api/preview-render?chatId=x&versionId=y");
    });

    expect(setCurrentPreviewUrl).toHaveBeenCalledWith("https://proj-abc.sandbox.vercel.run");
    expect(bumpPreviewRefreshToken).toHaveBeenCalled();
  });

  it("sets null for own-engine when preview URL is missing so bootstrap can take over", () => {
    const setCurrentPreviewUrl = vi.fn();
    const bumpPreviewRefreshToken = vi.fn();
    const { result } = renderHook(() =>
      useBuilderCallbacks({
        chatId: "chat_1",
        currentPreviewUrl: "https://old.sandbox.vercel.run",
        sendMessage: vi.fn(),
        effectiveVersionsList: [
          {
            versionId: "ver_2",
            id: "ver_2",
            canPin: false,
            previewUrl: null,
            demoUrl: null,
            legacyShimPreviewUrl: "/api/preview-render?chatId=chat_1&versionId=ver_2",
          },
        ],
        bumpPreviewRefreshToken,
        setCurrentPreviewUrl,
        setSelectedVersionId: vi.fn(),
        setIsVersionPanelCollapsed: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleVersionSelect("ver_2");
    });

    expect(setCurrentPreviewUrl).toHaveBeenCalledWith(null);
    expect(bumpPreviewRefreshToken).toHaveBeenCalled();
  });

  it("legacy mapped rows still use demoUrl from list", () => {
    const setCurrentPreviewUrl = vi.fn();
    const { result } = renderHook(() =>
      useBuilderCallbacks({
        chatId: "chat_legacy",
        currentPreviewUrl: null,
        sendMessage: vi.fn(),
        effectiveVersionsList: [
          {
            versionId: "v0_1",
            id: "row_1",
            canPin: true,
            demoUrl: "https://vusercontent.net/legacy",
          },
        ],
        bumpPreviewRefreshToken: vi.fn(),
        setCurrentPreviewUrl,
        setSelectedVersionId: vi.fn(),
        setIsVersionPanelCollapsed: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleVersionSelect("v0_1");
    });

    expect(setCurrentPreviewUrl).toHaveBeenCalledWith("https://vusercontent.net/legacy");
  });
});
