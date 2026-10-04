import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const listKostnadsfriMailEventsAfter = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({ listKostnadsfriMailEventsAfter }));

import { GET } from "./route";

function request(query = "", key: string | null = "test-key") {
  const headers: Record<string, string> = {};
  if (key !== null) headers["x-api-key"] = key;
  return new NextRequest(`http://localhost/api/kostnadsfri/mail-events${query}`, { headers });
}

function event(messageId: string, createdAt: string, cursorCreatedAt = createdAt) {
  return {
    message_id: messageId,
    slug: "acme-ab",
    recipient: "hej@acme.example",
    sender: "hej@sajtmaskin.se",
    flow_id: "flow_1",
    step: "first",
    variant: "text",
    scheduled_at: new Date("2026-10-03T08:29:00Z"),
    smtp_accepted_at: new Date("2026-10-03T08:30:00Z"),
    outcome: "accepted",
    source: "render-mail-flow:text",
    created_at: new Date(createdAt),
    cursor_created_at: cursorCreatedAt,
  };
}

beforeEach(() => {
  process.env.KOSTNADSFRI_API_KEY = "test-key";
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.KOSTNADSFRI_API_KEY;
});

describe("GET /api/kostnadsfri/mail-events", () => {
  it("requires the shared machine credential", async () => {
    expect((await GET(request("", null))).status).toBe(401);
    expect(listKostnadsfriMailEventsAfter).not.toHaveBeenCalled();
  });

  it("returns a complete per-message page with SMTP acceptance distinct from creation", async () => {
    listKostnadsfriMailEventsAfter.mockResolvedValueOnce([
      event("a".repeat(32), "2026-10-03T08:31:00Z", "2026-10-03T08:31:00.000000Z"),
    ]);
    const res = await GET(request("?limit=2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listKostnadsfriMailEventsAfter).toHaveBeenCalledWith(null, null, 3);
    expect(body.complete).toBe(true);
    expect(body.mailEvents[0]).toMatchObject({
      messageId: "a".repeat(32),
      smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
      createdAt: "2026-10-03T08:31:00.000Z",
      outcome: "accepted",
    });
  });

  it("keeps microsecond precision in the opaque cursor so the cursor row is not repeated", async () => {
    const first = event("a".repeat(32), "2026-10-03T08:31:00.123Z", "2026-10-03T08:31:00.123456Z");
    const second = event("b".repeat(32), "2026-10-03T08:31:00.123Z", "2026-10-03T08:31:00.123789Z");
    listKostnadsfriMailEventsAfter.mockResolvedValueOnce([first, second]);
    const firstPage = await (await GET(request("?limit=1"))).json();
    expect(firstPage.complete).toBe(false);
    expect(Buffer.from(firstPage.nextCursor, "base64url").toString("utf8")).toBe(
      `2026-10-03T08:31:00.123456Z|${"a".repeat(32)}`,
    );

    listKostnadsfriMailEventsAfter.mockResolvedValueOnce([second]);
    const secondPage = await GET(request(`?limit=1&cursor=${firstPage.nextCursor}`));
    expect(secondPage.status).toBe(200);
    expect(listKostnadsfriMailEventsAfter).toHaveBeenLastCalledWith(
      "2026-10-03T08:31:00.123456Z",
      "a".repeat(32),
      2,
    );
  });

  it("rejects a millisecond-precision cursor instead of silently repeating rows", async () => {
    const legacy = Buffer.from(`2026-10-03T08:31:00.123Z|${"a".repeat(32)}`).toString("base64url");
    const res = await GET(request(`?cursor=${legacy}`));
    expect(res.status).toBe(400);
    expect(listKostnadsfriMailEventsAfter).not.toHaveBeenCalled();
  });

  it("rejects calendar-invalid cursor timestamps with 400 instead of a database 500", async () => {
    for (const time of [
      "2026-02-31T08:31:00.123456Z",
      "2026-13-01T08:31:00.123456Z",
      "2026-10-03T24:00:00.000000Z",
      "2026-10-03T08:60:00.123456Z",
    ]) {
      const cursor = Buffer.from(`${time}|${"a".repeat(32)}`).toString("base64url");
      const res = await GET(request(`?cursor=${cursor}`));
      expect(res.status).toBe(400);
    }
    expect(listKostnadsfriMailEventsAfter).not.toHaveBeenCalled();
  });
});
