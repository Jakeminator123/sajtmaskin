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

function event(messageId: string, createdAt: string) {
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
      event("a".repeat(32), "2026-10-03T08:31:00Z"),
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

  it("provides an opaque composite cursor without dropping a same-timestamp row", async () => {
    const first = event("a".repeat(32), "2026-10-03T08:31:00Z");
    const second = event("b".repeat(32), "2026-10-03T08:31:00Z");
    listKostnadsfriMailEventsAfter.mockResolvedValueOnce([first, second]);
    const firstPage = await (await GET(request("?limit=1"))).json();
    expect(firstPage.complete).toBe(false);

    listKostnadsfriMailEventsAfter.mockResolvedValueOnce([second]);
    const secondPage = await GET(request(`?limit=1&cursor=${firstPage.nextCursor}`));
    expect(secondPage.status).toBe(200);
    expect(listKostnadsfriMailEventsAfter).toHaveBeenLastCalledWith(
      new Date("2026-10-03T08:31:00.000Z"),
      "a".repeat(32),
      2,
    );
  });
});
