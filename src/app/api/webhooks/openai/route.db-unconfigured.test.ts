/**
 * Egen fil för att `dbConfigured` mockas på modulnivå och måste vara `false`
 * här — den enda vägen där ett verifierat event tidigare kvitterades bort.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  pool: null,
  dbConfigured: false,
}));

import { POST } from "./route";

const TEST_SECRET = `whsec_${Buffer.from("sajtmaskin-test-signing-secret").toString("base64")}`;

const EVENT_BODY = JSON.stringify({
  id: "evt_abc123",
  type: "response.completed",
  created_at: 1753900000,
  data: { id: "resp_xyz789" },
});

function signedRequest(rawBody: string): Request {
  const id = "wh_test_1";
  const timestamp = Math.floor(Date.now() / 1000);
  const decoded = Buffer.from(TEST_SECRET.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", decoded)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");
  return new Request("http://localhost/api/webhooks/openai", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
  });
}

beforeEach(() => {
  process.env.OPENAI_WEBHOOK = TEST_SECRET;
  query.mockReset();
});

afterEach(() => {
  delete process.env.OPENAI_WEBHOOK;
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/openai utan konfigurerad databas", () => {
  it("ber OpenAI leverera om i stället för att kvittera bort eventet", async () => {
    // Tidigare svarade den 200. OpenAI levererar bara om vid icke-2xx, och det
    // finns ingen kö, blob eller replay bakom endpointen — ett kvitto här
    // betydde att ett giltigt signerat event var permanent borta, med en
    // console.warn som enda spår.
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(signedRequest(EVENT_BODY));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ stored: false, retry: true });
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(consoleWarn).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("svarar fortfarande 401 på en manipulerad body, före DB-läget", async () => {
    // Ordningen spelar roll: en osignerad request ska aldrig kunna trigga
    // OpenAI:s retry-loop genom att få 503.
    const tampered = EVENT_BODY.replace("response.completed", "response.failed");
    const req = signedRequest(EVENT_BODY);
    const res = await POST(
      new Request(req.url, { method: "POST", body: tampered, headers: req.headers }),
    );

    expect(res.status).toBe(401);
  });
});
