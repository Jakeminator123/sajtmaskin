import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());
const validateSsrfTarget = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  safeFetch,
  validateSsrfTarget,
}));

const { GET } = await import("./route");

const originalCspEnforce = process.env.CSP_ENFORCE;

function request(params = ""): Request {
  return new Request(`http://localhost/api/fetch-html?url=${encodeURIComponent(
    "https://remote.example/path/page",
  )}${params}`);
}

describe("GET /api/fetch-html", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getSessionIdFromRequest.mockReturnValue(null);
    validateSsrfTarget.mockReturnValue({ ok: true });
    safeFetch.mockResolvedValue(
      new Response(
        [
          "<!doctype html><html><head>",
          '<meta http-equiv="Content-Security-Policy" content="script-src *">',
          "</head><body>",
          '<button onclick="globalThis.pwned=true">Open</button>',
          "<script>globalThis.pwned=true</script>",
          "</body></html>",
        ].join(""),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    );
  });

  afterEach(() => {
    if (originalCspEnforce === undefined) {
      delete process.env.CSP_ENFORCE;
    } else {
      process.env.CSP_ENFORCE = originalCspEnforce;
    }
  });

  it("rejects the legacy active-script mode before fetching the remote page", async () => {
    const res = await GET(request("&allowScripts=true"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: expect.stringContaining("no longer supported") }),
    );
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it.each(["false", "true"])(
    "serves third-party markup as inert text when CSP_ENFORCE=%s",
    async (cspEnforce) => {
      process.env.CSP_ENFORCE = cspEnforce;

      const res = await GET(request());
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      expect(body).not.toContain("<script");
      expect(body).not.toContain("onclick=");
      expect(body).not.toContain("Content-Security-Policy");
      expect(body).toContain('<base href="https://remote.example/path/" target="_blank">');
      expect(safeFetch).toHaveBeenCalledTimes(1);
    },
  );
});
