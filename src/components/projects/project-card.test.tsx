/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project, ProjectSite } from "@/lib/projects/project-client";
import { ProjectCard } from "./project-card";

vi.mock("next/image", () => ({
  default: () => null,
}));

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    name: "Butiken",
    category: "website",
    description: "En prompt om en blomsterbutik i Göteborg",
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

function site(overrides: Partial<ProjectSite> = {}): ProjectSite {
  return {
    projectId: "proj_1",
    chatId: "chat_1",
    address: { liveUrl: "https://butik.example", kind: "custom" },
    state: "ready",
    liveAt: "2026-09-01T12:00:00.000Z",
    liveVersionId: "ver_1",
    latestDeploymentId: null,
    publishedSlug: "butik",
    brandedDomain: null,
    brandedDomainVerified: false,
    customDomain: "butik.example",
    customDomainVerified: true,
    vercelProjectId: "prj_1",
    ...overrides,
  };
}

describe("ProjectCard", () => {
  it("renders a live site as a management card without hover-only actions", () => {
    render(<ProjectCard project={project()} site={site()} onDelete={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Butiken" })).toBeTruthy();
    expect(screen.getAllByText("Publicerad").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /butik\.example/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_1",
    );
    expect(screen.getByRole("link", { name: "Redigera" }).getAttribute("href")).toBe(
      "/builder?project=proj_1",
    );
    expect(screen.getByRole("link", { name: "Hantera sajten Butiken" }).getAttribute("href")).toBe(
      "/projects/proj_1",
    );
    expect(screen.queryByText("En prompt om en blomsterbutik i Göteborg")).toBeNull();
    expect(screen.getByRole("button", { name: "Ta bort projektet Butiken" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Öppna" })).toBeNull();
  });

  it("keeps an unpublished project honest and points the primary action at the builder", () => {
    render(
      <ProjectCard
        project={project({ id: "proj_2", name: "Utkastet" })}
        site={site({
          projectId: "proj_2",
          state: "never_published",
          address: { liveUrl: null, kind: "none" },
        })}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Inte publicerad").length).toBeGreaterThan(0);
    expect(screen.getByText("En prompt om en blomsterbutik i Göteborg")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Fortsätt bygga" }).getAttribute("href")).toBe(
      "/builder?project=proj_2",
    );
    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_2",
    );
    expect(screen.getByRole("link", { name: "Öppna Utkastet i byggaren" }).getAttribute("href")).toBe(
      "/builder?project=proj_2",
    );
  });

  it("renders an old project without site data without inventing a live address", () => {
    render(
      <ProjectCard
        project={project({ id: "proj_old", name: "Gammalt projekt" })}
        site={null}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Gammalt projekt" })).toBeTruthy();
    expect(screen.getAllByText("Utkast").length).toBeGreaterThan(0);
    expect(screen.queryByText("Publicerad")).toBeNull();
    expect(screen.queryByRole("link", { name: /example/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Öppna i byggaren" }).getAttribute("href")).toBe(
      "/builder?project=proj_old",
    );
    expect(screen.queryByRole("link", { name: "Hantera sajt" })).toBeNull();
  });
});
