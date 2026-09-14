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

const SESSION_ID = "sess_ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

function verifyRequest(slug: string, password: string) {
  return new NextRequest(`http://localhost/api/kostnadsfri/${slug}/verify`, {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: {
      "content-type": "application/json",
      "x-real-ip": "10.0.0.1",
      cookie: `sajtmaskin_session=${SESSION_ID}`,
    },
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
    const slug = "jakobs-foretag-ab";
    const params = { params: Promise.resolve({ slug }) };
    // Härlett ur testseeden ovan — inget riktigt lösenord (GitGuardian på #1306
    // flaggade den tidigare inline-raden som "Generic Password").
    const derived = generatePassword(slug);

    const wrong = await POST(verifyRequest(slug, "fel"), params);
    expect(wrong.status).toBe(401);
    expect(recordPageView).not.toHaveBeenCalled();

    const ok = await POST(verifyRequest(slug, derived), params);
    const body = await ok.json();

    expect(ok.status).toBe(200);
    expect(body.companyData.companyName).toBe("Jakobs Foretag AB");
    expect(ok.headers.get("set-cookie")).toContain("sajtmaskin_kostnadsfri_campaign=");
    expect(ok.headers.get("set-cookie")).toContain("HttpOnly");
    expect(recordPageView).toHaveBeenCalledWith(
      "/kostnadsfri/jakobs-foretag-ab/verifierad",
      SESSION_ID,
      undefined,
      "10.0.0.1",
      undefined,
    );
  });

  it("returns the host session and expires an HTTPS parent-domain leftover", async () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
    getKostnadsfriPageBySlug.mockResolvedValue(null);
    const slug = "legacy-cookie-company";
    const request = new NextRequest(
      `https://preview.sajtmaskin.se/api/kostnadsfri/${slug}/verify`,
      {
        method: "POST",
        body: JSON.stringify({ password: generatePassword(slug) }),
        headers: {
          "content-type": "application/json",
          "x-real-ip": "10.0.0.2",
          host: "preview.sajtmaskin.se",
          cookie: `sajtmaskin_session=${SESSION_ID}`,
        },
      },
    );

    const response = await POST(request, { params: Promise.resolve({ slug }) });

    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(3);
    expect(setCookies.some((header) => header.startsWith("__Host-sajtmaskin_session=sess_"))).toBe(
      true,
    );
    expect(
      setCookies.some(
        (header) =>
          header.startsWith("sajtmaskin_session=;") &&
          header.includes("Domain=.sajtmaskin.se") &&
          header.includes("Max-Age=0"),
      ),
    ).toBe(true);
  });
});
