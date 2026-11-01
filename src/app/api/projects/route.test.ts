import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createProject = vi.hoisted(() => vi.fn());
const getAllProjectsForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const getCache = vi.hoisted(() => vi.fn());
const setCache = vi.hoisted(() => vi.fn());
const deleteCache = vi.hoisted(() => vi.fn());
const canCreateProject = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  createProject,
  getAllProjectsForOwner,
  getProjectData,
}));
vi.mock("@/lib/data/redis", () => ({ getCache, setCache, deleteCache }));
vi.mock("@/lib/projects/project-cleanup", () => ({ canCreateProject }));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookies: [] }),
  getSessionIdFromRequest: () => "sess_1",
}));

const { GET, POST } = await import("./route");

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1", diamonds: 200 });
  canCreateProject.mockResolvedValue({ allowed: true, current: 0, limit: 10 });
  createProject.mockResolvedValue({ id: "project_1", name: "Example" });
  getCache.mockResolvedValue(null);
  getAllProjectsForOwner.mockResolvedValue([]);
  setCache.mockResolvedValue(undefined);
  deleteCache.mockResolvedValue(undefined);
});

describe("POST /api/projects", () => {
  it.each([
    ["invalid JSON", "not-json"],
    ["null", "null"],
    ["array", "[]"],
    ["object name", '{"name":{}}'],
    ["object category", '{"name":"Example","category":{}}'],
    ["object description", '{"name":"Example","description":{}}'],
  ])("rejects %s before limit checks or writes", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(canCreateProject).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
  });

  it("normalizes project text before persistence", async () => {
    const response = await POST(
      request('{"name":" Example ","category":" app ","description":" Text "}'),
    );

    expect(response.status).toBe(200);
    expect(createProject).toHaveBeenCalledWith("Example", "app", "Text", undefined, "user_1");
  });

  it("does not expose persistence errors", async () => {
    createProject.mockRejectedValue(new Error("relation app_projects does not exist"));

    const response = await POST(request('{"name":"Example"}'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Failed to create project" });
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});

describe("GET /api/projects", () => {
  it("does not expose read errors", async () => {
    getAllProjectsForOwner.mockRejectedValue(new Error("relation app_projects does not exist"));

    const response = await GET(new NextRequest("http://localhost/api/projects"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Failed to get projects" });
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});
