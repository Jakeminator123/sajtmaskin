// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { warning: vi.fn(), message: vi.fn() } }));
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


describe("saved quick-edit preview warning", () => {
  it("selects saved source and retries only the matching preview, never another chat/version", () => {
    const onRetryPreview = vi.fn();
    const onPreviewSessionMeta = vi.fn();
    const setSelectedVersionId = vi.fn();
    const setCurrentPreviewUrl = vi.fn();
    const doneKeys = new Set(["chat_1:ver_saved"]);
    const mutateVersions = vi.fn();
    const renderOptions = { initialProps: { chatId: "chat_1", activeVersionId: null as string | null } };
    const { result, rerender } = renderHook(({ chatId, activeVersionId }) => useBuilderFilesContext({
      chatId, activeVersionId, previewRefreshToken: 0,
      // Prevent the unrelated prompt-context fetch in this focused test.
      filesContextKeyRef: ref(activeVersionId ? `${chatId}:${activeVersionId}:0` : null),
      promptFetchDoneRef: ref(null), pendingCreatedVersionRef: ref(null),
      mutateVersions, onVersionStatusRefresh: vi.fn(), onRetryPreview, onPreviewSessionMeta,
      setCurrentPageCode: vi.fn(), setExistingUiComponents: vi.fn(),
      setPreviewRefreshToken: vi.fn(), setSelectedVersionId,
      state: { setCurrentPreviewUrl }, vmPreview: { previewBootstrapDoneKeysRef: ref(doneKeys) },
    }), renderOptions);

    act(() => result.current({
      versionId: "ver_saved", previewError: "host boot failed",
      previewUrl: "https://stale.example", previewSessionId: "stale-session",
    }));
    expect(setSelectedVersionId).toHaveBeenCalledWith("ver_saved");
    expect(mutateVersions).toHaveBeenCalledTimes(1);
    expect(setCurrentPreviewUrl).toHaveBeenCalledWith(null);
    expect(setCurrentPreviewUrl).not.toHaveBeenCalledWith("https://stale.example");
    expect(onPreviewSessionMeta).not.toHaveBeenCalled();
    expect(doneKeys.has("chat_1:ver_saved")).toBe(false);
    expect(onRetryPreview).not.toHaveBeenCalled();

    const notice = vi.mocked(toast.warning).mock.calls.at(-1)?.[1];
    const action = notice?.action;
    if (!action || typeof action !== "object" || !("onClick" in action) || typeof action.onClick !== "function") {
      throw new Error("Missing preview retry action");
    }
    const retryPreview = action.onClick;
    rerender({ chatId: "chat_1", activeVersionId: "ver_saved" });
    act(() => retryPreview({} as never));
    expect(onRetryPreview).toHaveBeenCalledExactlyOnceWith("ver_saved");
    rerender({ chatId: "chat_1", activeVersionId: "ver_other" });
    act(() => retryPreview({} as never));
    rerender({ chatId: "chat_2", activeVersionId: "ver_saved" });
    act(() => retryPreview({} as never));
    expect(onRetryPreview).toHaveBeenCalledTimes(1);
    expect(mutateVersions).toHaveBeenCalledTimes(1);
  });
});
