import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForRequest = vi.hoisted(() => vi.fn());
const selectLimit = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn());
const insertValues = vi.hoisted(() => vi.fn());

vi.mock("nanoid", () => ({ nanoid: () => "integration_new" }));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/tenant", () => ({ getProjectByIdForRequest }));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectLimit }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    }),
    insert: () => ({ values: insertValues }),
  },
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/integrations/marketplace/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/integrations/marketplace/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getProjectByIdForRequest.mockResolvedValue({ id: "project_1", v0ProjectId: "v0_1" });
    selectLimit.mockResolvedValue([]);
    insertValues.mockResolvedValue(undefined);
  });

  it("requires an authenticated user", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(makeRequest({ integrationType: "neon" }));

    expect(response.status).toBe(401);
    expect(selectLimit).not.toHaveBeenCalled();
  });

  it("rejects unsupported integrations before writing", async () => {
    const response = await POST(makeRequest({ integrationType: "stripe" }));

    expect(response.status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("requires project ownership when a project is supplied", async () => {
    getProjectByIdForRequest.mockResolvedValue(null);

    const request = makeRequest({ integrationType: "supabase", projectId: "project_other" });
    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(getProjectByIdForRequest).toHaveBeenCalledWith(request, "project_other");
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("creates a pending project-scoped marketplace record", async () => {
    const response = await POST(
      makeRequest({ integrationType: "upstash", projectId: "project_1" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      integrationType: "upstash",
      projectId: "project_1",
      v0ProjectId: "v0_1",
      installUrl: "https://vercel.com/marketplace/upstash",
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "integration_new",
        user_id: "user_1",
        project_id: "project_1",
        status: "pending",
        ownership_model: "user_managed_vercel",
      }),
    );
  });

  it("refreshes an existing record instead of inserting a duplicate", async () => {
    selectLimit.mockResolvedValue([{ id: "integration_existing" }]);

    const response = await POST(makeRequest({ integrationType: "neon" }));

    expect(response.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        marketplace_slug: "neon",
        install_url: "https://vercel.com/marketplace/neon",
      }),
    );
    expect(insertValues).not.toHaveBeenCalled();
  });
});
