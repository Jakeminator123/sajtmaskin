// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/projects/project-client";

const renameProjectIfNameIs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projects/project-client", () => ({ renameProjectIfNameIs }));

const { nameDefaultProjectFromPrompt, useNameProjectOnFirstBuild } = await import("./project-naming");

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

describe("nameDefaultProjectFromPrompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ber servern döpa platshållaren efter verksamheten", async () => {
    renameProjectIfNameIs.mockResolvedValue({
      renamed: true,
      project: project({ name: "Café Lindgren" }),
    });
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Namnlöst projekt",
      prompt: CAFE_PROMPT,
      client: { renameProjectIfNameIs },
    });
    expect(name).toBe("Café Lindgren");
    expect(renameProjectIfNameIs).toHaveBeenCalledWith(
      "proj_1",
      "Namnlöst projekt",
      "Café Lindgren",
    );
  });

  // R-1744: fliken har platshållaren laddad, men servern har redan ett riktigt
  // namn (en annan flik byggde, eller användaren döpte om i portalen).
  it("ett inaktuellt namn i fliken skriver aldrig över serverns namn", async () => {
    renameProjectIfNameIs.mockResolvedValue({
      renamed: false,
      project: project({ name: "Café Lindgren" }),
    });
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Namnlöst projekt",
      prompt: "Bygg en hemsida för Frisör Klipp i Malmö",
      client: { renameProjectIfNameIs },
    });
    expect(name).toBeNull();
    expect(renameProjectIfNameIs).toHaveBeenCalledWith(
      "proj_1",
      "Namnlöst projekt",
      "Frisör Klipp i Malmö",
    );
  });

  it("frågar inte servern när fliken redan visar ett eget namn", async () => {
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Mitt kafé",
      prompt: CAFE_PROMPT,
      client: { renameProjectIfNameIs },
    });
    expect(name).toBeNull();
    expect(renameProjectIfNameIs).not.toHaveBeenCalled();
  });

  it("låter servern avgöra när namnet inte är laddat än", async () => {
    renameProjectIfNameIs.mockResolvedValue({ renamed: false, project: null });
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: null,
      prompt: CAFE_PROMPT,
      client: { renameProjectIfNameIs },
    });
    expect(name).toBeNull();
    expect(renameProjectIfNameIs).toHaveBeenCalledTimes(1);
  });

  it("lämnar projektet när prompten inte ger något namn", async () => {
    const name = await nameDefaultProjectFromPrompt({
      projectId: "proj_1",
      knownName: "Namnlöst projekt",
      prompt: "Bygg en hemsida",
      client: { renameProjectIfNameIs },
    });
    expect(name).toBeNull();
    expect(renameProjectIfNameIs).not.toHaveBeenCalled();
  });
});

describe("useNameProjectOnFirstBuild", () => {
  beforeEach(() => vi.clearAllMocks());

  it("döper projektet en gång och uppdaterar builderns namn", async () => {
    renameProjectIfNameIs.mockResolvedValue({
      renamed: true,
      project: project({ name: "Café Lindgren" }),
    });
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
    expect(renameProjectIfNameIs).toHaveBeenCalledTimes(1);
  });

  it("rör inte builderns namn när servern vägrade", async () => {
    renameProjectIfNameIs.mockResolvedValue({ renamed: false, project: null });
    const setAppProjectName = vi.fn();
    const { result } = renderHook(() =>
      useNameProjectOnFirstBuild({
        appProjectId: "proj_1",
        appProjectName: "Namnlöst projekt",
        setAppProjectName,
      }),
    );
    act(() => result.current(CAFE_PROMPT));
    await waitFor(() => expect(renameProjectIfNameIs).toHaveBeenCalledTimes(1));
    expect(setAppProjectName).not.toHaveBeenCalled();
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
    expect(renameProjectIfNameIs).not.toHaveBeenCalled();
  });
});
