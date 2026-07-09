import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateDeploymentStatus = vi.hoisted(() => vi.fn());
const dbSelectResult = vi.hoisted<{ rows: Array<Record<string, unknown>> }>(() => ({ rows: [] }));
const createRedisPublisher = vi.hoisted(() => vi.fn());
const logDeployError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => dbSelectResult.rows,
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  deployments: { id: "id", vercelDeploymentId: "vercelDeploymentId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, value: unknown) => value,
}));

vi.mock("@/lib/deployment", () => ({
  updateDeploymentStatus,
}));

vi.mock("@/lib/deploy/deploy-error-log", () => ({
  logDeployError,
}));

vi.mock("@/lib/redis-pubsub", () => ({
  createRedisPublisher,
  deployStatusChannel: (id: string) => `deploy:status:${id}`,
}));

const { POST } = await import("./route");

const SECRET = "test-webhook-secret";

function signedRequest(body: unknown): Request {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha1", SECRET).update(raw, "utf8").digest("hex");
  return new Request("http://localhost/api/webhooks/vercel", {
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
    vi.clearAllMocks();
    process.env.VERCEL_WEBHOOK_SECRET = SECRET;
    dbSelectResult.rows = [];
    createRedisPublisher.mockReturnValue(null);
    logDeployError.mockResolvedValue(undefined);
  });

  // BUG-fix (confirmed in prod): every generated site deploys to its OWN
  // per-customer Vercel project (`sajtmaskin-<chatId>`), never the shared
  // workspace `VERCEL_PROJECT_ID`. A prior version of this handler discarded
  // any webhook whose payload `projectId` did not match the configured
  // `VERCEL_PROJECT_ID`, which silently dropped EVERY webhook for a customer
  // deployment — the deployments row was left stuck at "building" forever
  // even though Vercel had already resolved the deploy. The DB lookup by
  // `vercelDeploymentId` is the real (and sufficient) scoping check.
  it("persists a status update for a deployment whose Vercel project differs from the configured VERCEL_PROJECT_ID", async () => {
    process.env.VERCEL_PROJECT_ID = "prj_workspace_own_project";
    dbSelectResult.rows = [
      { id: "dep_row_1", chatId: "chat_1", versionId: "ver_1" },
    ];

    const res = await POST(
      signedRequest({
        type: "deployment.error",
        payload: {
          deployment: { id: "dpl_customer_site_1" },
          project: { id: "prj_customer_generated_site" },
        },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; ignored?: boolean };
    expect(json.ok).toBe(true);
    expect(json.ignored).toBeFalsy();
    expect(updateDeploymentStatus).toHaveBeenCalledWith(
      "dep_row_1",
      "error",
      expect.objectContaining({ vercelProjectId: "prj_customer_generated_site" }),
    );

    // A3: a failed deploy is logged (DB + RAG + bus) for the version, tagged as
    // the webhook source, so the deploy path has the same traceability as the
    // preview-VM build-error path.
    expect(logDeployError).toHaveBeenCalledTimes(1);
    expect(logDeployError).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        deploymentId: "dep_row_1",
        vercelDeploymentId: "dpl_customer_site_1",
        source: "webhook",
      }),
    );

    delete process.env.VERCEL_PROJECT_ID;
  });

  it("ignores a webhook for a deployment id we never created (no matching row)", async () => {
    dbSelectResult.rows = [];

    const res = await POST(
      signedRequest({
        type: "deployment.succeeded",
        payload: { deployment: { id: "dpl_unknown" } },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; ignored?: boolean; reason?: string };
    expect(json.ok).toBe(true);
    expect(json.ignored).toBe(true);
    expect(json.reason).toBe("no matching deployment");
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
  });

  it("maps deployment.succeeded to ready and persists it", async () => {
    dbSelectResult.rows = [{ id: "dep_row_2" }];

    const res = await POST(
      signedRequest({
        type: "deployment.succeeded",
        payload: { deployment: { id: "dpl_2", url: "my-site.vercel.app" } },
      }),
    );

    expect(res.status).toBe(200);
    expect(updateDeploymentStatus).toHaveBeenCalledWith(
      "dep_row_2",
      "ready",
      expect.objectContaining({ url: "my-site.vercel.app" }),
    );
    // A non-error terminal status must NOT log a deploy error.
    expect(logDeployError).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid signature", async () => {
    const raw = JSON.stringify({ type: "deployment.succeeded" });
    const res = await POST(
      new Request("http://localhost/api/webhooks/vercel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vercel-signature": "deadbeef" },
        body: raw,
      }),
    );
    expect(res.status).toBe(401);
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
  });
});
