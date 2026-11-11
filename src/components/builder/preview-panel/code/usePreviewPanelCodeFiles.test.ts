import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewPanelCodeFiles } from "./usePreviewPanelCodeFiles";

const fetchFiles = vi.hoisted(() => vi.fn());
vi.mock("./chat-version-files-fetch", () => ({ fetchChatVersionFilesJson: fetchFiles }));

describe("code file refresh selection", () => {
  beforeEach(() => {
    fetchFiles.mockReset();
    fetchFiles.mockResolvedValue({
      response: { ok: true },
      data: { files: [{ name: "app/page.tsx", content: "A" }, { name: "app/other/page.tsx", content: "B" }] },
    });
  });

  it("keeps the selected file on refresh and falls back only when it disappears", async () => {
    const { result, rerender } = renderHook(
      ({ refreshToken }) => usePreviewPanelCodeFiles({ isCodeView: true, chatId: "A", versionId: "v1", refreshToken }),
      { initialProps: { refreshToken: 0 } },
    );
    await waitFor(() => expect(result.current.selectedPath).toBe("app/page.tsx"));
    act(() => result.current.setSelectedPath("app/other/page.tsx"));
    rerender({ refreshToken: 1 });
    await waitFor(() => expect(fetchFiles).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.filesLoading).toBe(false));
    expect(result.current.selectedPath).toBe("app/other/page.tsx");
    fetchFiles.mockResolvedValueOnce({ response: { ok: true }, data: { files: [{ name: "app/page.tsx", content: "NEXT" }] } });
    rerender({ refreshToken: 2 });
    await waitFor(() => expect(result.current.selectedPath).toBe("app/page.tsx"));
  });
});
