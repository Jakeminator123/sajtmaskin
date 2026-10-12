import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useBuilderProjectActions } from "./useBuilderProjectActions";

const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projects/project-client", () => ({ createProject, saveProjectData }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

type Args = Parameters<typeof useBuilderProjectActions>[0];
function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    chatId: "chat_1", chatIdParam: "chat_1", projectParam: "project_1",
    appProjectId: "project_1", appProjectName: "Projekt", pendingProjectName: "Projekt",
    isAuthenticated: true, isSavingProject: false, messages: [], resolvedPrompt: null,
    currentPreviewUrl: "https://preview.example", activeVersionId: "version/1",
    paletteState: { selections: [] },
    pendingInstructionsRef: { current: null }, pendingInstructionsOnceRef: { current: null },
    pendingBriefRef: { current: null }, hasLoadedInstructions: { current: false },
    hasLoadedInstructionsOnce: { current: false }, router: { replace: vi.fn(), push: vi.fn() },
    searchParams: new URLSearchParams(), startUiTransition: vi.fn(),
    setChatId: vi.fn(), setAppProjectId: vi.fn(), setAppProjectName: vi.fn(),
    setPendingProjectName: vi.fn(), setCurrentPreviewUrl: vi.fn(), setPreviewRefreshToken: vi.fn(),
    setMessages: vi.fn(), setIsImportModalOpen: vi.fn(), setIsSavingProject: vi.fn(),
    setSelectedModelTier: vi.fn(), setPromptAssistModel: vi.fn(), setPromptAssistDeep: vi.fn(),
    setEnableImageGenerations: vi.fn(), setDesignTheme: vi.fn(), setScaffoldMode: vi.fn(),
    setScaffoldId: vi.fn(), setCustomInstructions: vi.fn(), setApplyInstructionsOnce: vi.fn(),
    setDeployNameInput: vi.fn(), setDeployNameDialogOpen: vi.fn(), setExternalProjectId: vi.fn(),
    setIsIntentionalReset: vi.fn(), setAuthModalReason: vi.fn(),
    ...overrides,
  };
}

const snapshotFiles = [
  { name: "app/page.tsx", content: 'export default function Page(){return <img src="https://blob.example/hero.jpg"/>}' },
  { name: "public/logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
];

describe("useBuilderProjectActions snapshot-only Save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProject.mockResolvedValue({ id: "created_project", name: "Projekt" });
    saveProjectData.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: snapshotFiles }) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves the exact snapshot and preserves existing images without another media job", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useBuilderProjectActions(args));
    await act(async () => { await result.current.handleSaveProject(); });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/engine/chats/chat_1/files?versionId=version%2F1");
    expect(saveProjectData).toHaveBeenCalledWith("project_1", {
      chatId: "chat_1", previewUrl: args.currentPreviewUrl, files: snapshotFiles,
      messages: args.messages, meta: { palette: args.paletteState },
    });
    expect(saveProjectData.mock.calls[0][1].files).toBe(snapshotFiles);
    expect(createProject).not.toHaveBeenCalled();
    expect(args.setIsSavingProject).toHaveBeenNthCalledWith(1, true);
    expect(args.setIsSavingProject).toHaveBeenLastCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("Projekt sparat.");
  });

  it("new-project Save uses the same snapshot-only path", async () => {
    const args = makeArgs({ appProjectId: null, projectParam: null });
    const { result } = renderHook(() => useBuilderProjectActions(args));
    await act(async () => { await result.current.handleSaveProject(); });
    expect(createProject).toHaveBeenCalledWith("Projekt", undefined, undefined);
    expect(fetch).toHaveBeenCalledWith("/api/engine/chats/chat_1/files?versionId=version%2F1");
    expect(saveProjectData).toHaveBeenCalledWith("created_project", expect.objectContaining({ files: snapshotFiles }));
    expect(args.router.replace).toHaveBeenCalledWith("/builder?project=created_project&chatId=chat_1");
  });
});
