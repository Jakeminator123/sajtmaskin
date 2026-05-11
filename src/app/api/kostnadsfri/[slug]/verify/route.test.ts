import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getKostnadsfriPageBySlug = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug,
}));

vi.mock("@/lib/auth/auth", () => ({
  verifyPassword: vi.fn(() => false),
}));

import { POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

describe("kostnadsfri verify route", () => {
  it("returns a generic 503 when deterministic verification is not configured", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/kostnadsfri/acme/verify", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ slug: "acme" }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: "Länkverifiering är inte konfigurerad.",
    });
  });
});
