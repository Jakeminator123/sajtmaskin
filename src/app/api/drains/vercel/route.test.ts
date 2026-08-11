import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const query = vi.hoisted(() => vi.fn());
const dbState = vi.hoisted(() => ({ configured: true }));
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock("@/lib/db/client", () => ({
  get pool() {
    return dbState.configured ? { query } : null;
  },
  get dbConfigured() {
    return dbState.configured;
  },
}));

// `after()` throws outside a real request scope, so capture the callbacks
// instead and run them explicitly where a test cares about the side effect.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});

import { POST } from "./route";
import { resetPruneScheduleForTests } from "@/lib/vercel-log-drain";

const SECRET = "test-drain-secret";

function makeRequest(rawBody: string, opts: { signature?: string | null } = {}): Request {
  const signature =
    opts.signature === undefined
      ? createHmac("sha1", SECRET).update(rawBody, "utf8").digest("hex")
      : opts.signature;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-vercel-signature"] = signature;
  return new Request("http://localhost/api/drains/vercel", {
    method: "POST",
    body: rawBody,
    headers,
  });
}

const ERROR_LOG = {
  id: "1573817187330377061717300000",
  deploymentId: "dpl_test",
  projectId: "prj_test",
  source: "lambda",
  host: "sajtmaskin.vercel.app",
  timestamp: 1573817187330,
  level: "error",
  type: "stderr",
  message: "[product-postcheck] skipped reason=navigation_failed",
  path: "/api/engine/chats",
};

const BORING_LOG = {
  ...ERROR_LOG,
  id: "1573817187330377061717300001",
  level: "info",
  type: "stdout",
  message: "API request processed",
  statusCode: 200,
};

const SELF_LOG = {
  ...ERROR_LOG,
  id: "1573817187330377061717300002",
  path: "/api/drains/vercel",
};

beforeEach(() => {
  process.env.VERCEL_LOG_DRAIN_SECRET = SECRET;
  process.env.VERCEL_PROJECT_ID = "prj_test";
  query.mockReset();
  dbState.configured = true;
  afterCallbacks.length = 0;
  resetPruneScheduleForTests();
});

afterEach(() => {
  delete process.env.VERCEL_LOG_DRAIN_SECRET;
  delete process.env.VERCEL_PROJECT_ID;
  vi.restoreAllMocks();
});

describe("POST /api/drains/vercel", () => {
  it("echoes x-vercel-verify for the unsigned ownership probe", async () => {
    delete process.env.VERCEL_LOG_DRAIN_SECRET;
    const res = await POST(
      new Request("http://localhost/api/drains/vercel", {
        method: "POST",
        body: "",
        headers: { "x-vercel-verify": "probe-token-abc" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-vercel-verify")).toBe("probe-token-abc");
    expect(query).not.toHaveBeenCalled();
  });
  it("stores the interesting lines of a signed delivery", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    const body = JSON.stringify([ERROR_LOG, BORING_LOG]);

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, received: 2, stored: 1 });
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe(ERROR_LOG.id);
  });

  it("acks a delivery where everything was filtered out, without hitting the DB", async () => {
    const body = JSON.stringify([BORING_LOG, SELF_LOG]);

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, received: 2, stored: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an unsigned delivery", async () => {
    const res = await POST(makeRequest(JSON.stringify([ERROR_LOG]), { signature: null }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "invalid_signature" });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    const body = JSON.stringify([ERROR_LOG]);
    const wrong = createHmac("sha1", "not-the-secret").update(body, "utf8").digest("hex");

    const res = await POST(makeRequest(body, { signature: wrong }));

    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses to accept anything when no secret is configured", async () => {
    delete process.env.VERCEL_LOG_DRAIN_SECRET;

    const res = await POST(makeRequest(JSON.stringify([ERROR_LOG])));

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(query).not.toHaveBeenCalled();
  });

  it("answers 400 on a malformed body", async () => {
    const res = await POST(makeRequest("this is not json"));
    expect(res.status).toBe(400);
  });

  it("asks for redelivery instead of acking when the DB is unconfigured", async () => {
    dbState.configured = false;

    const res = await POST(makeRequest(JSON.stringify([ERROR_LOG])));

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    await expect(res.json()).resolves.toMatchObject({ retry: true });
  });

  it("asks for redelivery when the insert fails", async () => {
    query.mockRejectedValueOnce(new Error("connection terminated"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(JSON.stringify([ERROR_LOG])));

    expect(res.status).toBe(500);
  });

  it("schedules the retention prune once, off the response path", async () => {
    query.mockResolvedValue({ rowCount: 1 });

    await POST(makeRequest(JSON.stringify([ERROR_LOG])));
    expect(afterCallbacks).toHaveLength(1);

    // Second delivery within the hour must not schedule another DELETE.
    await POST(makeRequest(JSON.stringify([{ ...ERROR_LOG, id: "another" }])));
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();
    const deleteCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("DELETE FROM vercel_log_drain_events"),
    );
    expect(deleteCall).toBeDefined();
  });
});
