import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVercelDeployment = vi.hoisted(() => vi.fn());
const mapVercelReadyStateToStatus = vi.hoisted(() => vi.fn(() => ({ status: "ready" })));
const updateDeploymentStatus = vi.hoisted(() => vi.fn());
const logDeployError = vi.hoisted(() => vi.fn(async () => {}));

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
  getVercelDeployment,
  mapVercelReadyStateToStatus,
}));

vi.mock("@/lib/deployment", () => ({
  updateDeploymentStatus,
}));

vi.mock("@/lib/deploy/deploy-error-log", () => ({
  logDeployError,
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
    // A#25: negativ-assert — en ägd engine-chat får ALDRIG falla igenom till
    // legacy-lookupen (annars kan "engine-first" tyst regrediera till v0-first
    // utan att testet märker det).
    expect(getChatByIdForRequest).not.toHaveBeenCalled();
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

// BB#deploy2 (granska-svärmen på #469): poll-loopens kärnkontrakt var otestat —
// (a) loggen gate:as på den atomiska DB-övergången, (b) om just error-persisten
// kastar hålls strömmen ÖPPEN så nästa iteration kan göra om övergången och
// logga exakt en gång, (c) efter lyckad terminal iteration stängs strömmen
// (inga fler Vercel-poll).
describe("poll loop (BB#deploy2: transition-gate + persist-retry)", () => {
  const buildingDeployment = {
    id: "dep_p1",
    chatId: "chat_1",
    versionId: "ver_1",
    status: "building",
    url: null,
    inspectorUrl: null,
    vercelDeploymentId: "vdep_p1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    dbState.rows = [buildingDeployment];
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVercelDeployment.mockResolvedValue({
      readyState: "ERROR",
      url: "site.vercel.app",
      inspectorUrl: "https://vercel.com/i/vdep_p1",
    });
    mapVercelReadyStateToStatus.mockReturnValue({ status: "error" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries after a failed error-persist and logs exactly once when the transition lands", async () => {
    updateDeploymentStatus
      .mockRejectedValueOnce(new Error("transient db error"))
      .mockResolvedValueOnce({ transitionedToError: true });

    const { req, ctx } = makeRequest("dep_p1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);

    // Iteration 1: persisten kastar → errorPersistPending → strömmen stängs
    // INTE och inget loggas ännu.
    await vi.advanceTimersByTimeAsync(4000);
    expect(getVercelDeployment).toHaveBeenCalledTimes(1);
    expect(logDeployError).not.toHaveBeenCalled();

    // Iteration 2: övergången lyckas → exakt en logg, och strömmen stänger.
    await vi.advanceTimersByTimeAsync(4000);
    expect(getVercelDeployment).toHaveBeenCalledTimes(2);
    expect(logDeployError).toHaveBeenCalledTimes(1);
    expect(logDeployError).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "dep_p1", source: "poll" }),
    );

    // Stängd ström → inga fler poll-iterationer.
    await vi.advanceTimersByTimeAsync(8000);
    expect(getVercelDeployment).toHaveBeenCalledTimes(2);
  });

  it("does not log when the poll loses the transition (already error in DB — e.g. webhook won)", async () => {
    updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });

    const { req, ctx } = makeRequest("dep_p1");
    await GET(req, ctx);

    await vi.advanceTimersByTimeAsync(4000);
    expect(updateDeploymentStatus).toHaveBeenCalledTimes(1);
    expect(logDeployError).not.toHaveBeenCalled();

    // Terminal status som persisterades OK → strömmen stängde.
    await vi.advanceTimersByTimeAsync(8000);
    expect(getVercelDeployment).toHaveBeenCalledTimes(1);
  });
});
