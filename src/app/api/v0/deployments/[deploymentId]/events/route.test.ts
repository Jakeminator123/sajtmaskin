import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => dbState.rows,
        }),
      }),
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getChatByIdForRequest,
}));

vi.mock("@/lib/vercelDeploy", () => ({
  getVercelDeployment: vi.fn(),
  mapVercelReadyStateToStatus: vi.fn(() => ({ status: "ready" })),
}));

vi.mock("@/lib/deployment", () => ({
  updateDeploymentStatus: vi.fn(),
}));

vi.mock("@/lib/deploy/deploy-error-log", () => ({
  logDeployError: vi.fn(async () => {}),
}));

vi.mock("@/lib/redis-pubsub", () => ({
  createRedisSubscriber: () => null,
  deployStatusChannel: (id: string) => `deploy:${id}`,
}));

const { GET } = await import("./route");

function makeRequest(deploymentId: string) {
  const req = new NextRequest(`http://localhost/api/v0/deployments/${deploymentId}/events`);
  const params = Promise.resolve({ deploymentId });
  return { req, ctx: { params } };
}

// Terminal rad → streamen skickar snapshotten och stänger direkt (ingen poll
// startar), så testerna läser hela bodyn utan hängande timers.
const failedDeployment = {
  id: "dep_1",
  chatId: "chat_1",
  status: "error",
  url: null,
  inspectorUrl: "https://vercel.com/inspect/dep_1",
  vercelDeploymentId: "vdep_1",
};

describe("GET /api/v0/deployments/[deploymentId]/events auth (A#3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [failedDeployment];
  });

  it("authorizes own-engine chats (engine-first lookup)", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getChatByIdForRequest.mockResolvedValue(null);

    const { req, ctx } = makeRequest("dep_1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const body = await res.text();
    expect(body).toContain('"status":"error"');
    expect(body).toContain("https://vercel.com/inspect/dep_1");
    // Regressionens kärna: v0-fallbacken ska inte behövas för engine-chattar.
    expect(getEngineChatByIdForRequest).toHaveBeenCalledWith(req, "chat_1");
  });

  it("falls back to the legacy v0 chat lookup", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue({ id: "chat_1" });

    const { req, ctx } = makeRequest("dep_1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(getChatByIdForRequest).toHaveBeenCalledWith(req, "chat_1");
  });

  it("returns 404 when neither engine nor legacy chat owns the deployment", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue(null);

    const { req, ctx } = makeRequest("dep_1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown deployment id", async () => {
    dbState.rows = [];

    const { req, ctx } = makeRequest("dep_missing");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(getEngineChatByIdForRequest).not.toHaveBeenCalled();
  });
});
