import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getKostnadsfriPageBySlug = vi.hoisted(() => vi.fn());
const recordPageView = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug,
}));

vi.mock("@/lib/db/services/analytics", () => ({
  recordPageView,
}));

vi.mock("@/lib/auth/auth", () => ({
  verifyPassword: vi.fn(() => false),
}));

// `after()` needs a request scope in Next; run the callback inline in tests.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb() };
});

import { POST } from "./route";
import { generatePassword } from "@/lib/kostnadsfri";

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

function verifyRequest(slug: string, password: string) {
  return new NextRequest(`http://localhost/api/kostnadsfri/${slug}/verify`, {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: { "content-type": "application/json", "x-real-ip": "10.0.0.1" },
  });
}

describe("kostnadsfri verify route", () => {
  it("returns a generic 503 when deterministic verification is not configured", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);

    const res = await POST(verifyRequest("acme", "secret"), {
      params: Promise.resolve({ slug: "acme" }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: "Länkverifiering är inte konfigurerad.",
    });
    expect(recordPageView).not.toHaveBeenCalled();
  });

  it("records a `verifierad` event only when the deterministic password matches", async () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
    getKostnadsfriPageBySlug.mockResolvedValue(null);

    const wrong = await POST(verifyRequest("jakobs-foretag-ab", "fel"), {
      params: Promise.resolve({ slug: "jakobs-foretag-ab" }),
    });
    expect(wrong.status).toBe(401);
    expect(recordPageView).not.toHaveBeenCalled();

    const ok = await POST(
      verifyRequest("jakobs-foretag-ab", generatePassword("jakobs-foretag-ab")),
      { params: Promise.resolve({ slug: "jakobs-foretag-ab" }) },
    );
    const body = await ok.json();

    expect(ok.status).toBe(200);
    expect(body.companyData.companyName).toBe("Jakobs Foretag AB");
    expect(recordPageView).toHaveBeenCalledWith(
      "/kostnadsfri/jakobs-foretag-ab/verifierad",
      undefined,
      undefined,
      "10.0.0.1",
      undefined,
    );
  });
});
