import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({ deployments: { id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/lib/vercel/vercel-deploy", () => ({
  getVercelDeployment: vi.fn(),
  mapVercelReadyStateToStatus: vi.fn(),
}));
vi.mock("@/lib/deployment", () => ({
  resolveDeploymentLiveUrlForChat: vi.fn(),
  updateDeploymentStatus: vi.fn(),
}));
vi.mock("@/lib/deploy/deploy-error-log", () => ({ logDeployError: vi.fn() }));
vi.mock("@/lib/tenant", () => ({
  getChatByIdForRequest: vi.fn(),
  getEngineChatByIdForRequest: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _key: string, handler: () => unknown) => handler(),
}));

import { GET } from "./route";

describe("GET deployment", () => {
  it("rejects an oversized deployment id before querying", async () => {
    const response = await GET(new Request("http://localhost/api/v0/deployments/invalid"), {
      params: Promise.resolve({ deploymentId: "d".repeat(201) }),
    });

    expect(response.status).toBe(400);
  });

  it("does not expose unexpected internal errors", async () => {
    const response = await GET(new Request("http://localhost/api/v0/deployments/dep-1"), {
      params: Promise.reject(new Error("postgres://user:secret@private-db/internal")),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load deployment" });
  });
});
