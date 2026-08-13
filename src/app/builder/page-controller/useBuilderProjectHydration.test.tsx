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

    await waitFor(() => expect(createProject).toHaveBeenCalledWith("Untitled Project"));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/builder?project=project_new"),
    );
    expect(setAppProjectId).toHaveBeenCalledWith("project_new");
    expect(localStorage.getItem("sajtmaskin:lastProjectId")).toBe("project_new");
    expect(router.replace).not.toHaveBeenCalledWith(expect.stringContaining("project_old"));
  });
});
