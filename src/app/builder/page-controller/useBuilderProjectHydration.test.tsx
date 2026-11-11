// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultPaletteState } from "@/lib/builder/palette";

const createProject = vi.hoisted(() => vi.fn());
const getProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const getProjectSite = vi.hoisted(() => vi.fn());

vi.mock("@/lib/projects/project-client", () => ({
  createProject,
  getProject,
  getProjectSite,
  saveProjectData,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { useBuilderProjectHydration } = await import("./useBuilderProjectHydration");

function ref<T>(current: T) {
  return { current };
}

function blankEntryArgs(overrides: Record<string, unknown> = {}) {
  const setter = () => vi.fn() as never;
  return {
    appProjectId: null,
    chatId: null,
    chatIdParam: null,
    entryKind: "blank" as const,
    forceNew: true,
    hasEntryParams: false,
    isAuthLoading: false,
    paletteState: getDefaultPaletteState(),
    projectParam: null,
    autoProjectInitRef: ref(false),
    lastPaletteSavedRef: ref<string | null>(null),
    lastProjectIdRef: ref<string | null>(null),
    paletteLoadedRef: ref(false),
    router: { replace: vi.fn() },
    searchParams: new URLSearchParams("new=1") as never,
    setAppProjectId: setter(),
    setAppProjectName: setter(),
    setAuthModalReason: setter(),
    setClearedPreviewVersionId: setter(),
    setEntryIntentActive: setter(),
    setPaletteState: setter(),
    setServerProjectChatId: setter(),
    setServerProjectDemoUrl: setter(),
    setServerProjectMessages: setter(),
    setServerProjectPreviewOverrideUrl: setter(),
    setServerProjectPreviewOverrideVersionId: setter(),
    ...overrides,
  };
}

describe("useBuilderProjectHydration new entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    createProject.mockResolvedValue({ id: "project_new" });
  });

  it("ignores the remembered project, creates a new one and consumes new=1", async () => {
    localStorage.setItem("sajtmaskin:lastProjectId", "project_old");
    const setAppProjectId = vi.fn();
    const router = { replace: vi.fn() };
    const setter = () => vi.fn() as never;

    renderHook(() =>
      useBuilderProjectHydration({
        appProjectId: null,
        chatId: null,
        chatIdParam: null,
        entryKind: "blank",
        forceNew: true,
        hasEntryParams: false,
        isAuthLoading: false,
        paletteState: getDefaultPaletteState(),
        projectParam: null,
        autoProjectInitRef: ref(false),
        lastPaletteSavedRef: ref<string | null>(null),
        lastProjectIdRef: ref<string | null>(null),
        paletteLoadedRef: ref(false),
        router,
        searchParams: new URLSearchParams("new=1") as never,
        setAppProjectId: setAppProjectId as never,
        setAppProjectName: setter(),
        setAuthModalReason: setter(),
        setClearedPreviewVersionId: setter(),
        setEntryIntentActive: setter(),
        setPaletteState: setter(),
        setServerProjectChatId: setter(),
        setServerProjectDemoUrl: setter(),
        setServerProjectMessages: setter(),
        setServerProjectPreviewOverrideUrl: setter(),
        setServerProjectPreviewOverrideVersionId: setter(),
      }),
    );

    await waitFor(() => expect(createProject).toHaveBeenCalledWith("Namnlöst projekt"));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/builder?project=project_new"),
    );
    expect(setAppProjectId).toHaveBeenCalledWith("project_new");
    expect(localStorage.getItem("sajtmaskin:lastProjectId")).toBe("project_new");
    expect(router.replace).not.toHaveBeenCalledWith(expect.stringContaining("project_old"));
    expect(localStorage.getItem("sajtmaskin:emptyProjectId")).toBe("project_new");
  });

  // V-06: varje /builder?new=1 och "Ny chatt" skapade ett nytt tomt projekt.
  it("reuses this browser's untouched placeholder instead of creating another", async () => {
    localStorage.setItem("sajtmaskin:emptyProjectId", "project_empty");
    getProject.mockResolvedValue({
      project: { id: "project_empty", name: "Namnlöst projekt" },
      data: { project_id: "project_empty", files: [], messages: [] },
    });
    getProjectSite.mockResolvedValue({ projectId: "project_empty", chatId: null });
    const setAppProjectId = vi.fn();
    const router = { replace: vi.fn() };

    renderHook(() => useBuilderProjectHydration(blankEntryArgs({ setAppProjectId, router }) as never));

    await waitFor(() => expect(setAppProjectId).toHaveBeenCalledWith("project_empty"));
    expect(createProject).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/builder?project=project_empty");
  });

  it("creates a new placeholder when the remembered one already has a chat", async () => {
    localStorage.setItem("sajtmaskin:emptyProjectId", "project_built");
    getProject.mockResolvedValue({
      project: { id: "project_built", name: "Namnlöst projekt" },
      data: { project_id: "project_built", files: [], messages: [] },
    });
    getProjectSite.mockResolvedValue({ projectId: "project_built", chatId: "chat_1" });
    const setAppProjectId = vi.fn();

    renderHook(() => useBuilderProjectHydration(blankEntryArgs({ setAppProjectId }) as never));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith("Namnlöst projekt"));
    await waitFor(() => expect(setAppProjectId).toHaveBeenCalledWith("project_new"));
    expect(localStorage.getItem("sajtmaskin:emptyProjectId")).toBe("project_new");
  });

  it("does not create a second project when startBuild already passed project + new=1", () => {
    localStorage.setItem("sajtmaskin:lastProjectId", "project_old");
    const setAppProjectId = vi.fn();
    const router = { replace: vi.fn() };
    const setter = () => vi.fn() as never;

    renderHook(() =>
      useBuilderProjectHydration({
        appProjectId: null,
        chatId: null,
        chatIdParam: null,
        entryKind: "prompt-handoff",
        forceNew: true,
        hasEntryParams: true,
        isAuthLoading: false,
        paletteState: getDefaultPaletteState(),
        projectParam: "proj_1",
        autoProjectInitRef: ref(false),
        lastPaletteSavedRef: ref<string | null>(null),
        lastProjectIdRef: ref<string | null>(null),
        paletteLoadedRef: ref(false),
        router,
        searchParams: new URLSearchParams(
          "project=proj_1&promptId=prompt_1&buildMethod=freeform&new=1",
        ) as never,
        setAppProjectId: setAppProjectId as never,
        setAppProjectName: setter(),
        setAuthModalReason: setter(),
        setClearedPreviewVersionId: setter(),
        setEntryIntentActive: setter(),
        setPaletteState: setter(),
        setServerProjectChatId: setter(),
        setServerProjectDemoUrl: setter(),
        setServerProjectMessages: setter(),
        setServerProjectPreviewOverrideUrl: setter(),
        setServerProjectPreviewOverrideVersionId: setter(),
      }),
    );

    expect(createProject).not.toHaveBeenCalled();
    expect(setAppProjectId).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      "/builder?project=proj_1&promptId=prompt_1&buildMethod=freeform",
    );
  });

  it("keeps gclid when consuming new=1 from a project handoff URL", () => {
    const router = { replace: vi.fn() };
    const setter = () => vi.fn() as never;

    renderHook(() =>
      useBuilderProjectHydration({
        appProjectId: null,
        chatId: null,
        chatIdParam: null,
        entryKind: "project-restore",
        forceNew: true,
        hasEntryParams: false,
        isAuthLoading: false,
        paletteState: getDefaultPaletteState(),
        projectParam: "proj_1",
        autoProjectInitRef: ref(false),
        lastPaletteSavedRef: ref<string | null>(null),
        lastProjectIdRef: ref<string | null>(null),
        paletteLoadedRef: ref(false),
        router,
        searchParams: new URLSearchParams(
          "project=proj_1&buildMethod=freeform&new=1&gclid=KeepMe",
        ) as never,
        setAppProjectId: setter(),
        setAppProjectName: setter(),
        setAuthModalReason: setter(),
        setClearedPreviewVersionId: setter(),
        setEntryIntentActive: setter(),
        setPaletteState: setter(),
        setServerProjectChatId: setter(),
        setServerProjectDemoUrl: setter(),
        setServerProjectMessages: setter(),
        setServerProjectPreviewOverrideUrl: setter(),
        setServerProjectPreviewOverrideVersionId: setter(),
      }),
    );

    expect(createProject).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      "/builder?project=proj_1&buildMethod=freeform&gclid=KeepMe",
    );
  });
});
