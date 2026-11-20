// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultPaletteState } from "@/lib/builder/palette";

const createProject = vi.hoisted(() => vi.fn());
const getProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/projects/project-client", () => ({ createProject, getProject, saveProjectData }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { useBuilderProjectHydration } = await import("./useBuilderProjectHydration");

function ref<T>(current: T) {
  return { current };
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

  it("two tabs on new=1 each create their own project and never share one (SM-133, R-1744)", async () => {
    // localStorage is shared between tabs. After the first tab the remembered
    // project is the first tab's own, still empty project; a second fresh start
    // must not reuse it, or two builds could land in one project.
    localStorage.setItem("sajtmaskin:lastProjectId", "project_old");
    createProject
      .mockResolvedValueOnce({ id: "project_tab_one" })
      .mockResolvedValueOnce({ id: "project_tab_two" });
    const setter = () => vi.fn() as never;
    const tab = () => {
      const setAppProjectId = vi.fn();
      const router = { replace: vi.fn() };
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
      return { setAppProjectId, router };
    };

    const first = tab();
    await waitFor(() => expect(first.setAppProjectId).toHaveBeenCalledWith("project_tab_one"));
    expect(localStorage.getItem("sajtmaskin:lastProjectId")).toBe("project_tab_one");

    const second = tab();
    await waitFor(() => expect(second.setAppProjectId).toHaveBeenCalledWith("project_tab_two"));

    // Only the placeholder name goes to the server: no project id to reuse.
    expect(createProject.mock.calls).toEqual([["Namnlöst projekt"], ["Namnlöst projekt"]]);
    expect(second.setAppProjectId).not.toHaveBeenCalledWith("project_tab_one");
    expect(second.router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining("project_tab_one"),
    );
    for (const { router } of [first, second]) {
      expect(router.replace).not.toHaveBeenCalledWith(expect.stringContaining("project_old"));
    }
  });
});
