// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectSite, ProjectWithData } from "@/lib/projects/project-client";

const getProject = vi.hoisted(() => vi.fn());
const getProjectSite = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projects/project-client", () => ({ getProject, getProjectSite, updateProject }));

const { isReusableEmptyProject, nameDefaultProjectFromPrompt, useNameProjectOnFirstBuild } =
  await import("./project-naming");

const CAFE_PROMPT =
  "Bygg en hemsida för Café Lindgren, ett familjeägt kafé i Uppsala med surdegsbröd.";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    name: "Namnlöst projekt",
    created_at: "2026-11-11T14:14:00.000Z",
    updated_at: "2026-11-11T14:14:00.000Z",
    ...overrides,
  };
}

function withData(p: Project, data: Partial<ProjectWithData["data"]> = {}): ProjectWithData {
  return { project: p, data: { project_id: p.id, files: [], messages: [], ...data } };
}

function site(chatId: string | null): ProjectSite {
  return { projectId: "proj_1", chatId } as ProjectSite;
}

describe("nameDefaultProjectFromPrompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("döper ett projekt med platshållarnamn efter verksamheten", async () => {
    updateProject.mockResolvedValue(project({ name: "Café Lindgren" }));
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Namnlöst projekt",
      prompt: CAFE_PROMPT,
      client: { getProject, updateProject },
    });
    expect(name).toBe("Café Lindgren");
    expect(updateProject).toHaveBeenCalledWith("proj_1", { name: "Café Lindgren" });
    expect(getProject).not.toHaveBeenCalled();
  });

  it("skriver aldrig över ett namn användaren har satt", async () => {
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Mitt kafé",
      prompt: CAFE_PROMPT,
      client: { getProject, updateProject },
    });
    expect(name).toBeNull();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("läser serverraden när namnet inte är laddat än", async () => {
    getProject.mockResolvedValue(withData(project({ name: "Eget namn" })));
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: null,
      prompt: CAFE_PROMPT,
      client: { getProject, updateProject },
    });
    expect(name).toBeNull();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("lämnar projektet när prompten inte ger något namn", async () => {
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Namnlöst projekt",
      prompt: "Bygg en hemsida",
      client: { getProject, updateProject },
    });
    expect(name).toBeNull();
    expect(updateProject).not.toHaveBeenCalled();
  });
});

describe("isReusableEmptyProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("återanvänder bara ett orört platshållarprojekt", async () => {
    getProject.mockResolvedValue(withData(project()));
    getProjectSite.mockResolvedValue(site(null));
    await expect(isReusableEmptyProject("proj_1", { getProject, getProjectSite })).resolves.toBe(true);
  });

  it.each([
    ["har en chatt", withData(project()), site("chat_1")],
    ["har chat_id i projektdata", withData(project(), { chat_id: "chat_1" }), site(null)],
    ["har en preview", withData(project(), { demo_url: "https://demo.example" }), site(null)],
    ["har en miniatyr", withData(project({ thumbnail_path: "/t.png" })), site(null)],
    ["har ett eget namn", withData(project({ name: "Frisör Malmö" })), site(null)],
    ["finns inte (404)", withData(project()), null],
  ])("nej när projektet %s", async (_label, row, overview) => {
    getProject.mockResolvedValue(row);
    getProjectSite.mockResolvedValue(overview);
    await expect(isReusableEmptyProject("proj_1", { getProject, getProjectSite })).resolves.toBe(
      false,
    );
  });

  it("nej när en läsning fallerar", async () => {
    getProject.mockRejectedValue(new Error("Project not found"));
    getProjectSite.mockResolvedValue(site(null));
    await expect(isReusableEmptyProject("proj_1", { getProject, getProjectSite })).resolves.toBe(
      false,
    );
  });
});

describe("useNameProjectOnFirstBuild", () => {
  beforeEach(() => vi.clearAllMocks());

  it("döper projektet en gång och uppdaterar builderns namn", async () => {
    updateProject.mockResolvedValue(project({ name: "Café Lindgren" }));
    const setAppProjectName = vi.fn();
    const { result } = renderHook(() =>
      useNameProjectOnFirstBuild({
        appProjectId: "proj_1",
        appProjectName: "Namnlöst projekt",
        setAppProjectName,
      }),
    );
    act(() => {
      result.current(CAFE_PROMPT);
      result.current(CAFE_PROMPT);
    });
    await waitFor(() => expect(setAppProjectName).toHaveBeenCalledWith("Café Lindgren"));
    expect(updateProject).toHaveBeenCalledTimes(1);
  });

  it("rör inte ett projekt med eget namn", () => {
    const { result } = renderHook(() =>
      useNameProjectOnFirstBuild({
        appProjectId: "proj_1",
        appProjectName: "Mitt kafé",
        setAppProjectName: vi.fn(),
      }),
    );
    act(() => result.current(CAFE_PROMPT));
    expect(getProject).not.toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
  });
});
