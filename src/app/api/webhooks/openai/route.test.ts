import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  pool: { query },
  dbConfigured: true,
}));

import { POST } from "./route";
import { verifyOpenAiWebhookSignature } from "@/lib/openai-webhooks";

const TEST_SECRET = `whsec_${Buffer.from("sajtmaskin-test-signing-secret").toString("base64")}`;

function signHeaders(
  rawBody: string,
  opts: { id?: string; timestamp?: number; secret?: string } = {},
): Record<string, string> {
  const id = opts.id ?? "wh_test_1";
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = opts.secret ?? TEST_SECRET;
  const decoded = Buffer.from(secret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", decoded)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  };
}

function makeRequest(rawBody: string, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/webhooks/openai", {
    method: "POST",
    body: rawBody,
    headers,
  });
}

const EVENT_BODY = JSON.stringify({
  id: "evt_abc123",
  type: "response.completed",
  created_at: 1753900000,
  data: { id: "resp_xyz789" },
});

beforeEach(() => {
  process.env.OPENAI_WEBHOOK = TEST_SECRET;
  query.mockReset();
});

afterEach(() => {
  delete process.env.OPENAI_WEBHOOK;
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/openai", () => {
  it("stores a correctly signed event and acks", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await POST(makeRequest(EVENT_BODY, signHeaders(EVENT_BODY)));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, stored: true });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("INSERT INTO openai_webhook_events");
    expect(sql).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(params).toEqual([
      "evt_abc123",
      "response.completed",
      "resp_xyz789",
      1753900000,
      EVENT_BODY,
    ]);
  });

  it("acks a redelivered (duplicate) event without a second row", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await POST(makeRequest(EVENT_BODY, signHeaders(EVENT_BODY)));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, stored: false });
  });

  it("rejects a tampered body with 401 and never touches the DB", async () => {
    const headers = signHeaders(EVENT_BODY);
    const tampered = EVENT_BODY.replace("response.completed", "response.failed");

    const res = await POST(makeRequest(tampered, headers));

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp (replay) with 401", async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const res = await POST(
      makeRequest(EVENT_BODY, signHeaders(EVENT_BODY, { timestamp: stale })),
    );

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 500 when OPENAI_WEBHOOK is not configured", async () => {
    delete process.env.OPENAI_WEBHOOK;

    const res = await POST(makeRequest(EVENT_BODY, signHeaders(EVENT_BODY)));

    expect(res.status).toBe(500);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 500 on DB failure so OpenAI redelivers", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValueOnce(new Error("connection refused"));

    const res = await POST(makeRequest(EVENT_BODY, signHeaders(EVENT_BODY)));

    expect(res.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
  });

  it("acks-but-ignores signed JSON that is not an event envelope", async () => {
    const rawBody = JSON.stringify({ hello: "world" });

    const res = await POST(makeRequest(rawBody, signHeaders(rawBody)));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, ignored: true });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("verifyOpenAiWebhookSignature", () => {
  it("accepts when any of several space-separated signatures matches", () => {
    const rawBody = EVENT_BODY;
    const headers = signHeaders(rawBody);
    const combined = `v1,${Buffer.from("not-the-right-signature").toString("base64")} ${headers["webhook-signature"]}`;

    const result = verifyOpenAiWebhookSignature({
      rawBody,
      webhookId: headers["webhook-id"],
      webhookTimestamp: headers["webhook-timestamp"],
      signatureHeader: combined,
      secret: TEST_SECRET,
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects when headers are missing", () => {
    const result = verifyOpenAiWebhookSignature({
      rawBody: EVENT_BODY,
      webhookId: null,
      webhookTimestamp: null,
      signatureHeader: null,
      secret: TEST_SECRET,
    });

    expect(result.ok).toBe(false);
  });
});
