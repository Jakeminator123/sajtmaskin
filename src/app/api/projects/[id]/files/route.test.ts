import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner, getProjectData }));

const { GET } = await import("./route");
const context = { params: Promise.resolve({ id: "project_1" }) };

function request(): NextRequest {
  return new NextRequest("http://localhost/api/projects/project_1/files");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: "project_1" });
});

describe("GET /api/projects/[id]/files", () => {
  it("rejects an oversized project id before authentication", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ id: "x".repeat(201) }),
    });

    expect(response.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });

  it("rejects malformed stored file entries", async () => {
    getProjectData.mockResolvedValue({
      files: [null, { name: "app/page.tsx", content: { nested: true } }, { content: "no name" }],
    });

    const response = await GET(request(), context);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      success: false,
      error: "Inga giltiga filer hittades i projektet.",
    });
  });

  it("does not expose read failures", async () => {
    getProjectData.mockRejectedValue(new Error("database host secret"));

    const response = await GET(request(), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Kunde inte hämta projektfiler",
    });
  });
});
