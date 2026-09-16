import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const markKostnadsfriPageUnsubscribed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  markKostnadsfriPageUnsubscribed,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: unknown, _key: string, handler: () => Promise<Response>) => handler(),
}));

import { createUnsubscribeToken } from "@/lib/kostnadsfri/unsubscribe";
import { POST } from "./route";

const ENV = { KOSTNADSFRI_PASSWORD_SEED: "test-unsub-seed" };

function post(token: string | null) {
  const url = token
    ? `http://localhost/api/kostnadsfri/unsubscribe?token=${encodeURIComponent(token)}`
    : "http://localhost/api/kostnadsfri/unsubscribe";
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
}

beforeEach(() => {
  process.env.KOSTNADSFRI_PASSWORD_SEED = ENV.KOSTNADSFRI_PASSWORD_SEED;
  markKostnadsfriPageUnsubscribed.mockResolvedValue({ slug: "acme-ab" });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
});

describe("POST /api/kostnadsfri/unsubscribe", () => {
  it("marks the page when the token is valid", async () => {
    const token = createUnsubscribeToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    const res = await POST(post(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(markKostnadsfriPageUnsubscribed).toHaveBeenCalledWith("acme-ab");
  });

  it("rejects a missing or forged token without touching the register", async () => {
    expect((await POST(post(null))).status).toBe(400);
    expect((await POST(post("not-a-token"))).status).toBe(400);
    expect(markKostnadsfriPageUnsubscribed).not.toHaveBeenCalled();
  });

  it("succeeds when the slug was never saved", async () => {
    markKostnadsfriPageUnsubscribed.mockResolvedValueOnce(null);
    const token = createUnsubscribeToken({ email: "ada@acme.se", slug: "ghost-ab" }, ENV);
    const res = await POST(post(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
