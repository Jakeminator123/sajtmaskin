import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbLimit = vi.hoisted(() => vi.fn());
const updateDeploymentStatus = vi.hoisted(() => vi.fn());
const publish = vi.hoisted(() => vi.fn());
const disconnect = vi.hoisted(() => vi.fn());
const createRedisPublisher = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbLimit,
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  deployments: {
    id: Symbol("deployments.id"),
    vercelDeploymentId: Symbol("deployments.vercelDeploymentId"),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/deployment", () => ({
  updateDeploymentStatus,
}));

vi.mock("@/lib/redis-pubsub", () => ({
  createRedisPublisher,
  deployStatusChannel: (deploymentId: string) => `deploy:status:${deploymentId}`,
}));

import { POST } from "./route";

const SECRET = "vercel-webhook-secret";

function signedRequest(body: unknown, secret = SECRET): Request {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha1", secret).update(raw, "utf8").digest("hex");
  return new Request("https://example.com/api/webhooks/vercel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-signature": signature,
    },
    body: raw,
  });
}

describe("POST /api/webhooks/vercel", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_expected");
    dbLimit.mockReset();
    updateDeploymentStatus.mockReset();
    publish.mockReset();
    disconnect.mockReset();
    createRedisPublisher.mockReset();
    createRedisPublisher.mockReturnValue({ publish, disconnect });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects missing webhook secret configuration", async () => {
    vi.stubEnv("VERCEL_WEBHOOK_SECRET", "");

    const response = await POST(
      new Request("https://example.com/api/webhooks/vercel", {
        method: "POST",
        headers: { "x-vercel-signature": "anything" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("rejects invalid signatures before parsing deployment payload", async () => {
    const response = await POST(
      new Request("https://example.com/api/webhooks/vercel", {
        method: "POST",
        headers: { "x-vercel-signature": "bad-signature" },
        body: JSON.stringify({ type: "deployment.succeeded" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(dbLimit).not.toHaveBeenCalled();
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
  });

  it("ignores deployment events for a different Vercel project", async () => {
    const response = await POST(
      signedRequest({
        type: "deployment.succeeded",
        payload: {
          deployment: { id: "dpl_1", url: "https://preview.example" },
          project: { id: "prj_other" },
        },
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      ok: true,
      ignored: true,
      reason: "project mismatch",
      projectId: "prj_other",
    });
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
  });

  it("ignores deployment events without a Vercel project id", async () => {
    const response = await POST(
      signedRequest({
        type: "deployment.succeeded",
        payload: {
          deployment: { id: "dpl_1", url: "https://preview.example" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      ignored: true,
      reason: "missing project id",
    });
    expect(dbLimit).not.toHaveBeenCalled();
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
  });

  it("keeps webhook success non-fatal when Redis publish fails", async () => {
    dbLimit.mockResolvedValue([{ id: "deploy_row_1" }]);
    publish.mockRejectedValue(new Error("redis down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const response = await POST(
        signedRequest({
          type: "deployment.succeeded",
          payload: {
            deployment: { id: "dpl_1", url: "https://preview.example" },
            project: { id: "prj_expected" },
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(updateDeploymentStatus).toHaveBeenCalledWith("deploy_row_1", "ready", {
        url: "https://preview.example",
        vercelProjectId: "prj_expected",
      });
      expect(warnSpy).toHaveBeenCalledWith(
        "[webhook] Redis publish failed (non-fatal):",
        expect.any(Error),
      );
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("rejects webhook processing when project filtering is not configured", async () => {
    vi.stubEnv("VERCEL_PROJECT_ID", "");

    const response = await POST(
      signedRequest({
        type: "deployment.succeeded",
        payload: {
          deployment: { id: "dpl_1", url: "https://preview.example" },
          project: { id: "prj_expected" },
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Missing VERCEL_PROJECT_ID" });
    expect(dbLimit).not.toHaveBeenCalled();
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
  });

  it("updates matching deployment status and publishes Redis fanout", async () => {
    dbLimit.mockResolvedValue([{ id: "deploy_row_1" }]);

    const response = await POST(
      signedRequest({
        type: "deployment.succeeded",
        payload: {
          deployment: { id: "dpl_1", url: "https://preview.example" },
          links: { deployment: "https://vercel.com/acme/project/deployments/dpl_1" },
          project: { id: "prj_expected" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(updateDeploymentStatus).toHaveBeenCalledWith("deploy_row_1", "ready", {
      url: "https://preview.example",
      inspectorUrl: "https://vercel.com/acme/project/deployments/dpl_1",
      vercelProjectId: "prj_expected",
    });
    expect(publish).toHaveBeenCalledWith(
      "deploy:status:dpl_1",
      JSON.stringify({
        status: "ready",
        url: "https://preview.example",
        inspectorUrl: "https://vercel.com/acme/project/deployments/dpl_1",
        projectId: "prj_expected",
      }),
    );
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
