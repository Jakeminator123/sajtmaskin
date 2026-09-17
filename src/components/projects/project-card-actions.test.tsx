import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectSite } from "@/lib/projects/project-client";
import { ProjectCardActions } from "./project-card-actions";

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

describe("ProjectCardActions", () => {
  it("makes manage the primary action for a live site", () => {
    render(<ProjectCardActions projectId="proj_1" site={site()} />);

    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_1",
    );
    expect(screen.getByRole("link", { name: "Redigera" }).getAttribute("href")).toBe(
      "/builder?project=proj_1",
    );
  });

  it("keeps a draft in the builder and still offers the portal", () => {
    render(
      <ProjectCardActions
        projectId="proj_2"
        site={site({
          projectId: "proj_2",
          state: "never_published",
          address: { liveUrl: null, kind: "none" },
        })}
      />,
    );

    expect(screen.getByRole("link", { name: "Fortsätt bygga" }).getAttribute("href")).toBe(
      "/builder?project=proj_2",
    );
    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_2",
    );
    expect(screen.queryByRole("link", { name: "Redigera" })).toBeNull();
  });

  it("keeps the portal reachable when the overview is missing", () => {
    render(<ProjectCardActions projectId="proj_old" site={null} />);

    expect(screen.getByRole("link", { name: "Öppna i byggaren" }).getAttribute("href")).toBe(
      "/builder?project=proj_old",
    );
    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_old",
    );
  });

  it("does not pretend a loading overview is a draft", () => {
    render(<ProjectCardActions projectId="proj_1" site={undefined} />);

    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_1",
    );
    expect(screen.getByRole("link", { name: "Redigera" }).getAttribute("href")).toBe(
      "/builder?project=proj_1",
    );
    expect(screen.queryByRole("link", { name: "Fortsätt bygga" })).toBeNull();
  });

  it("still offers manage while a publish is in progress or broken", () => {
    const { rerender } = render(
      <ProjectCardActions projectId="proj_3" site={site({ projectId: "proj_3", state: "building" })} />,
    );
    expect(screen.getByRole("link", { name: "Hantera sajt" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Redigera" })).toBeTruthy();

    rerender(
      <ProjectCardActions projectId="proj_3" site={site({ projectId: "proj_3", state: "error" })} />,
    );
    expect(screen.getByRole("link", { name: "Hantera sajt" }).getAttribute("href")).toBe(
      "/projects/proj_3",
    );
  });
});
