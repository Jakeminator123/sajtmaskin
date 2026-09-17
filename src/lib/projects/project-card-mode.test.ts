import { describe, expect, it } from "vitest";
import type { ProjectSite } from "./project-client";
import {
  countProjectListSegments,
  isDraftSegment,
  isPublishedSegment,
  matchesProjectListSegment,
  projectCardMode,
  projectCardPrimaryHref,
} from "./project-card-mode";

function site(overrides: Partial<ProjectSite> = {}): ProjectSite {
  return {
    projectId: "proj_1",
    chatId: "chat_1",
    address: { liveUrl: null, kind: "none" },
    state: "never_published",
    liveAt: null,
    liveVersionId: null,
    latestDeploymentId: null,
    publishedSlug: null,
    brandedDomain: null,
    brandedDomainVerified: false,
    customDomain: null,
    customDomainVerified: false,
    vercelProjectId: null,
    ...overrides,
  };
}

describe("projectCardMode", () => {
  it("treats a missing overview as a legacy draft, not as a live site", () => {
    expect(projectCardMode(undefined)).toBe("loading");
    expect(projectCardMode(null)).toBe("legacy");
  });

  it("separates live, in-flight and broken publishes", () => {
    expect(projectCardMode(site({ state: "ready" }))).toBe("live");
    expect(projectCardMode(site({ state: "building" }))).toBe("progress");
    expect(projectCardMode(site({ state: "pending" }))).toBe("progress");
    expect(projectCardMode(site({ state: "error" }))).toBe("problem");
    expect(projectCardMode(site({ state: "cancelled" }))).toBe("problem");
    expect(projectCardMode(site({ state: "never_published" }))).toBe("draft");
  });
});

describe("projectCardPrimaryHref", () => {
  it("sends a known site to the existing portal and a draft to the builder", () => {
    expect(projectCardPrimaryHref("proj_1", "live")).toBe("/projects/proj_1");
    expect(projectCardPrimaryHref("proj_1", "progress")).toBe("/projects/proj_1");
    expect(projectCardPrimaryHref("proj_1", "problem")).toBe("/projects/proj_1");
    expect(projectCardPrimaryHref("proj_1", "draft")).toBe("/builder?project=proj_1");
    expect(projectCardPrimaryHref("proj_1", "legacy")).toBe("/builder?project=proj_1");
    expect(projectCardPrimaryHref("proj_1", "loading")).toBe("/builder?project=proj_1");
  });
});

describe("project list segments", () => {
  it("counts a live URL as published even while a republish is in flight", () => {
    const live = site({
      state: "ready",
      address: { liveUrl: "https://butik.example", kind: "custom" },
    });
    const republishing = site({
      state: "building",
      address: { liveUrl: "https://butik.example", kind: "custom" },
    });
    const draft = site();
    const legacy = null;

    expect(isPublishedSegment(live)).toBe(true);
    expect(isPublishedSegment(republishing)).toBe(true);
    expect(isDraftSegment(draft)).toBe(true);
    expect(isDraftSegment(legacy)).toBe(true);
    expect(isPublishedSegment(legacy)).toBe(false);
    expect(isDraftSegment(undefined)).toBe(false);

    expect(countProjectListSegments([live, republishing, draft, legacy, undefined])).toEqual({
      all: 5,
      published: 2,
      drafts: 2,
    });
  });

  it("keeps cards visible in every segment while the overview is still loading", () => {
    expect(matchesProjectListSegment(undefined, "published")).toBe(true);
    expect(matchesProjectListSegment(undefined, "drafts")).toBe(true);
    expect(matchesProjectListSegment(site(), "published")).toBe(false);
    expect(matchesProjectListSegment(site(), "drafts")).toBe(true);
    expect(
      matchesProjectListSegment(
        site({
          state: "error",
          address: { liveUrl: null, kind: "none" },
        }),
        "drafts",
      ),
    ).toBe(false);
  });
});
