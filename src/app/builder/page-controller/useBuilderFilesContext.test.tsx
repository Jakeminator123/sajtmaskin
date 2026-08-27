// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBuilderFilesContext } from "./useBuilderFilesContext";

function ref<T>(current: T) {
  return { current };
}

function renderFilesContext() {
  const mutateVersions = vi.fn();
  const onVersionStatusRefresh = vi.fn();
  const setSelectedVersionId = vi.fn();
  const setPreviewRefreshToken = vi.fn();
  const pendingCreatedVersionRef = ref<{ id: string; ts: number } | null>(null);

  const rendered = renderHook(() =>
    useBuilderFilesContext({
      chatId: "chat_1",
      activeVersionId: null,
      previewRefreshToken: 0,
      filesContextKeyRef: ref<string | null>(null),
      promptFetchDoneRef: ref<string | null>(null),
      pendingCreatedVersionRef,
      mutateVersions,
      onVersionStatusRefresh,
      onPreviewSessionMeta: vi.fn(),
      setCurrentPageCode: vi.fn(),
      setExistingUiComponents: vi.fn(),
      setPreviewRefreshToken,
      setSelectedVersionId,
      state: { setCurrentPreviewUrl: vi.fn() },
      vmPreview: { previewBootstrapDoneKeysRef: ref(new Set<string>()) },
    }),
  );

  return {
    ...rendered,
    mutateVersions,
    onVersionStatusRefresh,
    pendingCreatedVersionRef,
    setPreviewRefreshToken,
    setSelectedVersionId,
  };
}

describe("useBuilderFilesContext save refresh", () => {
  it("refreshes active status and version history after a same-version save", () => {
    const rendered = renderFilesContext();

    act(() => {
      rendered.result.current();
    });

    expect(rendered.mutateVersions).toHaveBeenCalledTimes(1);
    expect(rendered.onVersionStatusRefresh).toHaveBeenCalledTimes(1);
    expect(rendered.setSelectedVersionId).not.toHaveBeenCalled();
    expect(rendered.setPreviewRefreshToken).toHaveBeenCalledWith(expect.any(Number));
  });

  it("refreshes each status surface only once when a save creates a version", () => {
    const rendered = renderFilesContext();

    act(() => {
      rendered.result.current({ versionId: "ver_new" });
    });

    expect(rendered.pendingCreatedVersionRef.current?.id).toBe("ver_new");
    expect(rendered.setSelectedVersionId).toHaveBeenCalledWith("ver_new");
    expect(rendered.mutateVersions).toHaveBeenCalledTimes(1);
    expect(rendered.onVersionStatusRefresh).toHaveBeenCalledTimes(1);
  });
});
