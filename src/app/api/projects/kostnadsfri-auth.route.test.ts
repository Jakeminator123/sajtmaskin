import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn(async () => null as { id: string } | null));
const ensureSessionIdFromRequest = vi.hoisted(() =>
  vi.fn(() => ({ sessionId: "sess_1", setCookie: null, setCookies: [] })),
);
const createProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest,
  getSessionIdFromRequest: () => "sess_1",
}));
vi.mock("@/lib/db/services/projects", () => ({
  createProject,
  getAllProjectsForOwner: vi.fn(),
  getProjectData: vi.fn(),
}));
vi.mock("@/lib/data/redis", () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
}));
vi.mock("@/lib/projects/project-cleanup", () => ({
  canCreateProject: vi.fn(async () => ({ allowed: true })),
}));

import { POST } from "./route";

describe("POST /api/projects — kostnadsfri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
  });

  it("rejects an anonymous kostnadsfri project", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Zax - Kostnadsfri",
          category: "kostnadsfri",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(createProject).not.toHaveBeenCalled();
  });
});
