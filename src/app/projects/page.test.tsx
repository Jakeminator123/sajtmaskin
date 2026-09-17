/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectSite } from "@/lib/projects/project-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/projects",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("@/components/layout/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/components/layout/shader-background", () => ({
  ShaderBackground: () => null,
}));

vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: () => null,
}));

const getProjects = vi.fn();
const getProjectSite = vi.fn();
const deleteProject = vi.fn();

vi.mock("@/lib/projects/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/projects/project-client")>(
    "@/lib/projects/project-client",
  );
  return {
    ...actual,
    getProjects: (...args: unknown[]) => getProjects(...args),
    getProjectSite: (...args: unknown[]) => getProjectSite(...args),
    deleteProject: (...args: unknown[]) => deleteProject(...args),
  };
});

const { default: ProjectsPage } = await import("./page");

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj_live",
    name: "Live-sajten",
    category: "website",
    description: "Prompttext som inte ska styra kortet",
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

function site(overrides: Partial<ProjectSite> = {}): ProjectSite {
  return {
    projectId: "proj_live",
    chatId: "chat_1",
    address: { liveUrl: "https://live.example", kind: "branded" },
    state: "ready",
    liveAt: "2026-09-01T12:00:00.000Z",
    liveVersionId: "ver_1",
    latestDeploymentId: null,
    publishedSlug: "live",
    brandedDomain: "live.example",
    brandedDomainVerified: true,
    customDomain: null,
    customDomainVerified: false,
    vercelProjectId: "prj_1",
    ...overrides,
  };
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    getProjects.mockReset();
    getProjectSite.mockReset();
    deleteProject.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows persistent manage/edit actions and filters published vs draft", async () => {
    getProjects.mockResolvedValue([
      project(),
      project({ id: "proj_draft", name: "Utkastet" }),
      project({ id: "proj_old", name: "Gammalt" }),
    ]);
    getProjectSite.mockImplementation(async (id: string) => {
      if (id === "proj_live") return site();
      if (id === "proj_draft") {
        return site({
          projectId: "proj_draft",
          state: "never_published",
          address: { liveUrl: null, kind: "none" },
        });
      }
      return null;
    });

    render(<ProjectsPage />);

    expect(await screen.findByRole("heading", { name: "Live-sajten" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Utkastet" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gammalt" })).toBeTruthy();

    const liveCard = screen.getByRole("heading", { name: "Live-sajten" }).closest("article");
    const draftCard = screen.getByRole("heading", { name: "Utkastet" }).closest("article");
    const oldCard = screen.getByRole("heading", { name: "Gammalt" }).closest("article");
    expect(liveCard && draftCard && oldCard).toBeTruthy();
    expect(within(liveCard!).getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_live",
    );
    expect(within(liveCard!).getByRole("link", { name: "Redigera" }).getAttribute("href")).toBe(
      "/builder?project=proj_live",
    );
    expect(within(draftCard!).getByRole("link", { name: "Fortsätt bygga" }).getAttribute("href")).toBe(
      "/builder?project=proj_draft",
    );
    expect(within(oldCard!).getByRole("link", { name: "Öppna i byggaren" }).getAttribute("href")).toBe(
      "/builder?project=proj_old",
    );
    expect(within(oldCard!).queryByRole("link", { name: "Hantera sajt" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Publicerade/ }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Live-sajten" })).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Utkastet" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Gammalt" })).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /Utkast/ }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Live-sajten" })).toBeNull();
      expect(screen.getByRole("heading", { name: "Utkastet" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Gammalt" })).toBeTruthy();
    });
  });

  it("does not paint a live project as a draft while the overview is in flight", async () => {
    const deferred = Promise.withResolvers<ProjectSite>();
    getProjects.mockResolvedValue([project()]);
    getProjectSite.mockImplementation(() => deferred.promise);

    render(<ProjectsPage />);

    expect(await screen.findByRole("heading", { name: "Live-sajten" })).toBeTruthy();
    expect(screen.getByText("Hämtar status")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Hantera sajt$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Redigera" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Fortsätt bygga" })).toBeNull();

    deferred.resolve(site());
    await waitFor(() => {
      expect(screen.getAllByText("Publicerad").length).toBeGreaterThan(0);
      expect(screen.getByRole("link", { name: /^Hantera sajt$/ }).getAttribute("href")).toBe(
        "/projects/proj_live",
      );
    });
  });

  it("does not paint a failed overview fetch as a confirmed draft", async () => {
    getProjects.mockResolvedValue([project()]);
    getProjectSite.mockRejectedValue(new Error("site overview failed"));

    render(<ProjectsPage />);

    expect(await screen.findByRole("heading", { name: "Live-sajten" })).toBeTruthy();
    const card = screen.getByRole("heading", { name: "Live-sajten" }).closest("article");
    expect(card).toBeTruthy();
    expect(within(card!).getByText("Hämtar status")).toBeTruthy();
    expect(within(card!).queryByText("Utkast")).toBeNull();
    expect(within(card!).getByRole("link", { name: /^Hantera sajt$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Redigera" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Öppna i byggaren" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Fortsätt bygga" })).toBeNull();
  });

  it("still offers delete for a project in the grid", async () => {
    getProjects.mockResolvedValue([project()]);
    getProjectSite.mockResolvedValue(site());
    deleteProject.mockResolvedValue(undefined);

    render(<ProjectsPage />);

    expect(await screen.findByRole("heading", { name: "Live-sajten" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ta bort projektet Live-sajten" }));
    expect(screen.getByText("Ta bort projekt?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith("proj_live");
      expect(screen.queryByRole("heading", { name: "Live-sajten" })).toBeNull();
    });
  });

  it("renders a large grid without requiring hover for the primary actions", async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      project({
        id: `proj_${index}`,
        name: `Projekt ${index + 1}`,
      }),
    );
    getProjects.mockResolvedValue(many);
    getProjectSite.mockImplementation(async (id: string) =>
      site({
        projectId: id,
        address: { liveUrl: `https://${id}.example`, kind: "branded" },
      }),
    );

    render(<ProjectsPage />);

    expect(await screen.findByRole("heading", { name: "Projekt 1" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Hantera sajt" })).toHaveLength(12);
    expect(screen.getAllByRole("link", { name: "Redigera" })).toHaveLength(12);
    expect(screen.queryByRole("link", { name: "Öppna" })).toBeNull();
  });
});
