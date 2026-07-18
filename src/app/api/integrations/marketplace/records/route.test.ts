import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForRequest = vi.hoisted(() => vi.fn());
const selectRows = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/tenant", () => ({ getProjectByIdForRequest }));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: selectRows }),
      }),
    }),
  },
}));

const { GET } = await import("./route");

function makeRequest(projectId?: string): Request {
  const query = projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`;
  return new Request(`http://localhost/api/integrations/marketplace/records${query}`);
}

describe("GET /api/integrations/marketplace/records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    selectRows.mockResolvedValue([{ id: "integration_1" }]);
  });

  it("requires an authenticated user", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(selectRows).not.toHaveBeenCalled();
  });

  it("lists user-level integration records when no project is selected", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      records: [{ id: "integration_1" }],
    });
    expect(getProjectByIdForRequest).not.toHaveBeenCalled();
  });

  it("rejects projects outside the requester's tenant scope", async () => {
    getProjectByIdForRequest.mockResolvedValue(null);

    const response = await GET(makeRequest("project_other"));

    expect(response.status).toBe(404);
    expect(selectRows).not.toHaveBeenCalled();
  });

  it("lists records after the project ownership check passes", async () => {
    getProjectByIdForRequest.mockResolvedValue({ id: "project_1" });

    const request = makeRequest("project_1");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(getProjectByIdForRequest).toHaveBeenCalledWith(request, "project_1");
    expect(selectRows).toHaveBeenCalledTimes(1);
  });
});
