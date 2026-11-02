import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deleteProject = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());
const getCache = vi.hoisted(() => vi.fn());
const setCache = vi.hoisted(() => vi.fn());
const deleteCache = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  deleteProject,
  getProjectByIdForOwner,
  getProjectData,
  updateProject,
}));
vi.mock("@/lib/data/redis", () => ({ getCache, setCache, deleteCache }));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest: () => "session_1" }));

const { DELETE, GET, PUT } = await import("./route");
const context = { params: Promise.resolve({ id: "project_1" }) };

function request(method: string, body?: string): NextRequest {
  return new NextRequest("http://localhost/api/projects/project_1", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getCache.mockResolvedValue(null);
  getProjectByIdForOwner.mockResolvedValue({ id: "project_1", name: "Example" });
  getProjectData.mockResolvedValue(null);
  updateProject.mockResolvedValue({ id: "project_1", name: "Updated" });
  deleteProject.mockResolvedValue(true);
  setCache.mockResolvedValue(undefined);
  deleteCache.mockResolvedValue(undefined);
});

describe("PUT /api/projects/[id]", () => {
  it.each(["not-json", "null", "[]", '{"name":{}}', '{"description":12}'])(
    "rejects malformed project data before reads or writes: %s",
    async (body) => {
      const response = await PUT(request("PUT", body), context);

      expect(response.status).toBe(400);
      expect(getProjectByIdForOwner).not.toHaveBeenCalled();
      expect(updateProject).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["name", "x".repeat(201)],
    ["category", "x".repeat(101)],
    ["description", "x".repeat(5_001)],
    ["thumbnail_path", "x".repeat(4_097)],
  ])("rejects an oversized %s before reads or writes", async (field, value) => {
    const response = await PUT(request("PUT", JSON.stringify({ [field]: value })), context);

    expect(response.status).toBe(400);
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("does not expose update errors", async () => {
    updateProject.mockRejectedValue(new Error("relation app_projects does not exist"));

    const response = await PUT(request("PUT", '{"name":"Updated"}'), context);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Failed to update project" });
  });
});

describe("project read and delete failures", () => {
  it.each([
    ["GET", GET],
    ["PUT", PUT],
    ["DELETE", DELETE],
  ])("rejects an oversized project id before %s work", async (method, handler) => {
    const response = await handler(request(method, method === "PUT" ? "{}" : undefined), {
      params: Promise.resolve({ id: "x".repeat(201) }),
    });

    expect(response.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });

  it("does not expose read errors", async () => {
    getProjectByIdForOwner.mockRejectedValue(new Error("database host secret"));

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Failed to get project",
    });
  });

  it("does not expose delete errors", async () => {
    deleteProject.mockRejectedValue(new Error("database host secret"));

    const response = await DELETE(request("DELETE"), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Failed to delete project",
    });
  });
});
