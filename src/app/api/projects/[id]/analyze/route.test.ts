import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const responsesCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner, getProjectData }));
vi.mock("openai", () => ({
  default: class {
    responses = { create: responsesCreate };
  },
}));

const { POST } = await import("./route");
const context = { params: Promise.resolve({ id: "project_1" }) };

function request(): NextRequest {
  return new NextRequest("http://localhost/api/projects/project_1/analyze", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: "project_1", name: "Example" });
  getProjectData.mockResolvedValue({
    files: [{ name: "app/page.tsx", content: "export default function Page() {}" }],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/projects/[id]/analyze", () => {
  it("rejects an oversized project id before authentication or model work", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: "x".repeat(201) }),
    });

    expect(response.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed stored files before calling the model", async () => {
    getProjectData.mockResolvedValue({
      files: [null, { name: "app/page.tsx", content: { nested: true } }, { content: "missing name" }],
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      success: false,
      error: "Inga giltiga filer hittades i projektet",
    });
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("does not expose provider failures", async () => {
    responsesCreate.mockRejectedValue(new Error("provider request-id secret"));

    const response = await POST(request(), context);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Kunde inte analysera projektet",
    });
  });
});
