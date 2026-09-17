import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectSite } from "@/lib/projects/project-client";
import { ProjectCardSiteMeta } from "./project-card-site-meta";

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

describe("ProjectCardSiteMeta", () => {
  it("shows publish state, address kind, host and a site-view link", () => {
    render(<ProjectCardSiteMeta projectId="proj_1" site={site()} />);

    expect(screen.getByText("Publicerad")).toBeTruthy();
    expect(screen.getByText("Din egen domän")).toBeTruthy();
    expect(screen.getByText("butik.example")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Visa sajt" }).getAttribute("href")).toBe(
      "/projects/proj_1",
    );
  });

  it("uses the same unpublished copy as the site view", () => {
    render(
      <ProjectCardSiteMeta
        projectId="proj_2"
        site={site({
          projectId: "proj_2",
          address: { liveUrl: null, kind: "none" },
          state: "never_published",
        })}
      />,
    );

    expect(screen.getByText("Inte publicerad")).toBeTruthy();
    expect(screen.getAllByText("Ingen adress än").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Visa sajt" }).getAttribute("href")).toBe(
      "/projects/proj_2",
    );
  });

  it("renders nothing until an overview is available", () => {
    const { container } = render(<ProjectCardSiteMeta projectId="proj_1" site={null} />);
    expect(container.firstChild).toBeNull();
  });
});
