import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getProjectByIdForOwner = vi.fn();
const getProjectSiteOverview = vi.fn();
const getCurrentUser = vi.fn();
const getSessionIdFromRequest = vi.fn();

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner: (...args: unknown[]) => getProjectByIdForOwner(...args),
}));
vi.mock("@/lib/projects/site-overview", () => ({
  getProjectSiteOverview: (...args: unknown[]) => getProjectSiteOverview(...args),
}));
vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: (...args: unknown[]) => getSessionIdFromRequest(...args),
}));

import { GET } from "./route";

function request(id = "proj_1") {
  return {
    req: new NextRequest(new URL(`https://sajtmaskin.example/api/projects/${id}/site`)),
    params: Promise.resolve({ id }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1", email: "a@example.com" });
  getSessionIdFromRequest.mockReturnValue("sess_1");
});

describe("GET /api/projects/[id]/site", () => {
  it("returns 404 for a project the requester does not own", async () => {
    // Ownership is resolved server-side; the id in the URL is never authority.
    getProjectByIdForOwner.mockResolvedValue(null);

    const { req, params } = request("someone-elses-project");
    const response = await GET(req, { params });

    expect(response.status).toBe(404);
    expect(getProjectSiteOverview).not.toHaveBeenCalled();
  });

  it("scopes the ownership lookup to the caller's user and session", async () => {
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_1" });
    getProjectSiteOverview.mockResolvedValue({
      projectId: "proj_1",
      chatId: "chat_1",
      address: { liveUrl: "https://kundforetag.se", kind: "custom" },
      state: "ready",
      liveAt: new Date("2026-09-10T08:00:00Z"),
      liveVersionId: "ver_1",
      latestDeploymentId: null,
      publishedSlug: "kundforetag",
      brandedDomain: null,
      brandedDomainVerified: false,
      customDomain: "kundforetag.se",
      customDomainVerified: true,
      vercelProjectId: "prj_x",
    });

    const { req, params } = request();
    const response = await GET(req, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getProjectByIdForOwner).toHaveBeenCalledWith("proj_1", {
      userId: "user_1",
      sessionId: "sess_1",
    });
    expect(body.site.address).toEqual({ liveUrl: "https://kundforetag.se", kind: "custom" });
    // Dates must cross the wire as ISO strings, not as `{}`.
    expect(body.site.liveAt).toBe("2026-09-10T08:00:00.000Z");
    expect(body.site.latestDeploymentId).toBeNull();
  });

  it("forwards an in-flight latestDeploymentId so the portal can watch it", async () => {
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_1" });
    getProjectSiteOverview.mockResolvedValue({
      projectId: "proj_1",
      chatId: "chat_1",
      address: { liveUrl: "https://kundforetag.se", kind: "custom" },
      state: "building",
      liveAt: new Date("2026-09-10T08:00:00Z"),
      liveVersionId: "ver_1",
      latestDeploymentId: "dep_building",
      publishedSlug: "kundforetag",
      brandedDomain: null,
      brandedDomainVerified: false,
      customDomain: "kundforetag.se",
      customDomainVerified: true,
      vercelProjectId: "prj_x",
    });

    const { req, params } = request();
    const body = await (await GET(req, { params })).json();

    expect(body.site.state).toBe("building");
    expect(body.site.latestDeploymentId).toBe("dep_building");
  });

  it("serialises a never-published project without inventing an address", async () => {
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_2" });
    getProjectSiteOverview.mockResolvedValue({
      projectId: "proj_2",
      chatId: null,
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
    });

    const { req, params } = request("proj_2");
    const body = await (await GET(req, { params })).json();

    expect(body.site.state).toBe("never_published");
    expect(body.site.address.liveUrl).toBeNull();
    expect(body.site.liveAt).toBeNull();
  });

  it("returns a generic 500 body and does not leak the raw error message", async () => {
    const leaked = "relation app_projects does not exist";
    getProjectByIdForOwner.mockRejectedValue(new Error(leaked));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { req, params } = request();
    const response = await GET(req, { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to load site overview");
    expect(JSON.stringify(body)).not.toContain(leaked);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
