import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileNode } from "@/lib/builder/types";
import { usePreviewPanelCodeDrafts } from "./usePreviewPanelCodeDrafts";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const file = (path: string, title: string): FileNode => ({
  path, name: path, type: "file", content: `<h1>${title}</h1><p>Intro</p>`,
});

describe("preview code draft recovery", () => {
  it("recovers raw edits and edit mode after file changes and content refreshes", () => {
    const save = vi.fn().mockResolvedValue(true);
    const a = file("app/page.tsx", "A");
    const { result, rerender } = renderHook(
      ({ selectedFile }) => usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent: save }),
      { initialProps: { selectedFile: a } },
    );
    act(() => {
      result.current.setRawEditMode(true);
      result.current.setRawCodeDraft("UNSAVED");
    });
    rerender({ selectedFile: file("app/other/page.tsx", "B") });
    expect(result.current.rawCodeDraft).toContain("B");
    expect(result.current.rawEditMode).toBe(false);
    rerender({ selectedFile: { ...a, content: "SERVER REFRESH" } });
    expect(result.current.rawCodeDraft).toBe("UNSAVED");
    expect(result.current.rawEditMode).toBe(true);
    expect(result.current.rawCodeDirty).toBe(true);
  });

  it("retains structured drafts across new file objects, refresh, and selection", () => {
    const a = file("app/page.tsx", "A");
    const { result, rerender } = renderHook(
      ({ selectedFile }) => usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent: vi.fn() }),
      { initialProps: { selectedFile: a } },
    );
    act(() => result.current.setHeroDraft((previous) => previous && { ...previous, title: "DRAFT" }));
    rerender({ selectedFile: { ...a } });
    expect(result.current.heroDraft?.title).toBe("DRAFT");
    rerender({ selectedFile: file("app/other/page.tsx", "B") });
    expect(result.current.heroDraft?.title).toBe("B");
    rerender({ selectedFile: file(a.path, "REFRESH") });
    expect(result.current.heroDraft?.title).toBe("DRAFT");
    expect(result.current.heroDirty).toBe(true);
  });

  it("acknowledges saved content so later clean refreshes update the editor", async () => {
    const a = file("app/page.tsx", "A");
    const save = vi.fn().mockResolvedValue(true);
    const { result, rerender } = renderHook(
      ({ selectedFile }) => usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent: save }),
      { initialProps: { selectedFile: a } },
    );
    act(() => result.current.setRawCodeDraft("SAVED"));
    await act(async () => { await result.current.handleSaveRawCode(); });
    expect(save).toHaveBeenCalledWith("SAVED");
    rerender({ selectedFile: { ...a, content: "SAVED" } });
    expect(result.current.rawCodeDirty).toBe(false);
    rerender({ selectedFile: { ...a, content: "NEXT SERVER VERSION" } });
    expect(result.current.rawCodeDraft).toBe("NEXT SERVER VERSION");
  });

  it("isolates drafts belonging to different chats with the same path", () => {
    const a = file("app/page.tsx", "A");
    const { result, rerender } = renderHook(
      ({ draftScope }) => usePreviewPanelCodeDrafts({ selectedFile: a, draftScope, saveSelectedFileContent: vi.fn() }),
      { initialProps: { draftScope: "chat-a" } },
    );
    act(() => result.current.setRawCodeDraft("CHAT A DRAFT"));
    rerender({ draftScope: "chat-b" });
    expect(result.current.rawCodeDraft).toBe(a.content);
    rerender({ draftScope: "chat-a" });
    expect(result.current.rawCodeDraft).toBe("CHAT A DRAFT");
  });

  it("keeps unsaved edits recoverable when saving fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Offline. Försök igen."));
    const a = file("app/page.tsx", "A");
    const { result, rerender } = renderHook(
      ({ selectedFile }) => usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent: save }),
      { initialProps: { selectedFile: a } },
    );
    act(() => { result.current.setRawEditMode(true); result.current.setRawCodeDraft("KEEP"); });
    await act(async () => { await result.current.handleSaveRawCode(); });
    expect(result.current.rawCodeSaveError).toBe("Offline. Försök igen.");
    rerender({ selectedFile: file("app/other/page.tsx", "B") });
    rerender({ selectedFile: a });
    expect(result.current.rawCodeDraft).toBe("KEEP");
    expect(result.current.rawEditMode).toBe(true);
    expect(result.current.rawCodeDirty).toBe(true);
  });
});
