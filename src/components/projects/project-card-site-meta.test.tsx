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
  it("shows publish state, address kind and a live host that opens the site", () => {
    render(<ProjectCardSiteMeta projectId="proj_1" site={site()} />);

    expect(screen.getByText("Publicerad")).toBeTruthy();
    expect(screen.getByText("Din egen domän")).toBeTruthy();
    expect(screen.getByRole("link", { name: /butik\.example/i }).getAttribute("href")).toBe(
      "https://butik.example",
    );
    expect(screen.queryByRole("link", { name: "Visa sajt" })).toBeNull();
  });

  it("does not invent an address for an unpublished site", () => {
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
    expect(screen.getByText("Ännu inte en publicerad hemsida")).toBeTruthy();
    expect(screen.queryByText("Ingen adress än")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing until an overview is available", () => {
    const { container } = render(<ProjectCardSiteMeta projectId="proj_1" site={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("surfaces a failed publish instead of a generic idle state", () => {
    render(
      <ProjectCardSiteMeta
        projectId="proj_3"
        site={site({
          projectId: "proj_3",
          state: "error",
          address: { liveUrl: "https://butik.example", kind: "custom" },
        })}
      />,
    );

    expect(screen.getByText("Publiceringen misslyckades")).toBeTruthy();
    expect(screen.getByRole("link", { name: /butik\.example/i })).toBeTruthy();
  });
});
