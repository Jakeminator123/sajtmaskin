import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPreviewVisibleVersion,
  getPreviewVisibleVersion,
  resetPreviewVisibleVersionForTests,
  setPreviewVisibleVersion,
  usePreviewShowsVersion,
} from "./preview-visible-version";

afterEach(() => resetPreviewVisibleVersionForTests());

describe("preview-visible-version", () => {
  it("reports showing only for the exact chat and version", () => {
    const { result, rerender } = renderHook(
      ({ chatId, versionId }) => usePreviewShowsVersion(chatId, versionId),
      { initialProps: { chatId: "chat_1", versionId: "ver_2" } },
    );
    expect(result.current).toBe(false);

    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "ver_2", state: "starting" }));
    expect(result.current).toBe(false);

    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "ver_2", state: "showing" }));
    expect(result.current).toBe(true);

    rerender({ chatId: "chat_1", versionId: "ver_1" });
    expect(result.current).toBe(false);
    rerender({ chatId: "chat_other", versionId: "ver_2" });
    expect(result.current).toBe(false);
  });

  it("clears on chat change only for the chat that owns the entry", () => {
    setPreviewVisibleVersion({ chatId: "chat_new", versionId: "ver_1", state: "showing" });
    clearPreviewVisibleVersion("chat_old");
    expect(getPreviewVisibleVersion()).toMatchObject({ chatId: "chat_new" });
    clearPreviewVisibleVersion("chat_new");
    expect(getPreviewVisibleVersion()).toBeNull();
  });

  it("does not notify readers when nothing changed", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return usePreviewShowsVersion("chat_1", "ver_1");
    });
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "ver_1", state: "showing" }));
    const afterFirst = renders;
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "ver_1", state: "showing" }));
    expect(renders).toBe(afterFirst);
  });
});
