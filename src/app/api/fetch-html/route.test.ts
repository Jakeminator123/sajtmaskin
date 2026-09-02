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

const REMOTE_HTML = [
  "<!doctype html><html><head>",
  '<base href="https://evil.example/hijack/">',
  '<meta http-equiv="Content-Security-Policy" content="script-src *">',
  "<title>Keep title</title>",
  '<link rel="stylesheet" href="/assets/app.css">',
  "</head><body>",
  "<h1>Visible copy</h1>",
  "<p>Needed text</p>",
  '<a href="/about">About</a>',
  '<a href="javascript:alert(1)">xss link</a>',
  '<img src="photo.jpg" alt="keep">',
  '<button onclick="globalThis.pwned=true">Open</button>',
  "<script>globalThis.pwned=true</script>",
  '<iframe src="https://evil.example/frame"></iframe>',
  '<object data="https://evil.example/swf"></object>',
  '<embed src="https://evil.example/plugin">',
  "</body></html>",
].join("");

function request(params = ""): Request {
  return new Request(`http://localhost/api/fetch-html?url=${encodeURIComponent(
    "https://remote.example/path/page",
  )}${params}`);
}

function expectInertHeaders(res: Response) {
  expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(res.headers.get("content-security-policy")).toContain("sandbox");
  expect(res.headers.get("content-security-policy-report-only")).toBeNull();
}

function expectSanitizedBody(body: string) {
  expect(body).not.toContain("<script");
  expect(body).not.toContain("</script>");
  expect(body).not.toContain("onclick=");
  expect(body).not.toContain("javascript:");
  expect(body).not.toContain("Content-Security-Policy");
  expect(body).not.toContain("<iframe");
  expect(body).not.toContain("<object");
  expect(body).not.toContain("<embed");
  expect(body).not.toContain("evil.example");
  expect(body).not.toContain('href="https://evil.example/hijack/"');
  expect(body).toContain('<base href="https://remote.example/path/" target="_blank">');
  expect(body).toContain("Keep title");
  expect(body).toContain("Visible copy");
  expect(body).toContain("Needed text");
  expect(body).toContain("https://remote.example/about");
  expect(body).toContain("https://remote.example/path/photo.jpg");
}

describe("GET /api/fetch-html", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getSessionIdFromRequest.mockReturnValue(null);
    validateSsrfTarget.mockReturnValue({ ok: true });
    safeFetch.mockResolvedValue(
      new Response(REMOTE_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  });

  afterEach(() => {
    if (originalCspEnforce === undefined) {
      delete process.env.CSP_ENFORCE;
    } else {
      process.env.CSP_ENFORCE = originalCspEnforce;
    }
  });

  it.each(["true", "1"])(
    "rejects allowScripts=%s with script+CSP payload before any network call",
    async (value) => {
      const res = await GET(request(`&allowScripts=${value}`));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: expect.stringContaining("no longer supported") }),
      );
      expect(safeFetch).not.toHaveBeenCalled();
      expect(validateSsrfTarget).not.toHaveBeenCalled();
    },
  );

  it.each(["false", "true"])(
    "serves third-party markup as inert text when CSP_ENFORCE=%s",
    async (cspEnforce) => {
      process.env.CSP_ENFORCE = cspEnforce;

      const res = await GET(request());
      const body = await res.text();

      expect(res.status).toBe(200);
      expectInertHeaders(res);
      expectSanitizedBody(body);
      expect(safeFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["<img/onerror=alert(1) src=x>", /onerror/i],
    ["<svg/onload=alert(1)>", /onload/i],
    ["<svg\tonload=alert(1)>", /onload/i],
    ["<svg\nonload=alert(1)>", /onload/i],
    ["<svg ONERROR=alert(1)>", /onerror/i],
    ["<svg onload>", /onload/i],
  ])("strips HTML5 slash/whitespace event handler %j", async (snippet, handler) => {
    safeFetch.mockResolvedValue(
      new Response(`<!doctype html><html><body>${snippet}<p>safe</p></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const body = await (await GET(request())).text();
    expect(body).not.toMatch(handler);
    expect(body).not.toContain("alert(1)");
    expect(body).toContain("safe");
  });

  it("does not treat /onclick inside a quoted URL as an event handler", async () => {
    safeFetch.mockResolvedValue(
      new Response(
        '<!doctype html><html><body><a href="https://cdn.example/onclick=keep">keep-url</a></body></html>',
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    );

    const body = await (await GET(request())).text();
    expect(body).toContain("https://cdn.example/onclick=keep");
    expect(body).toContain("keep-url");
  });

  it("treats slash after a tag name as the attribute boundary for javascript: and base", async () => {
    safeFetch.mockResolvedValue(
      new Response(
        [
          "<!doctype html><html><head>",
          '<base/href="https://evil.example/hijack/">',
          "</head><body>",
          "<a/href=javascript:alert(1)>xss</a>",
          "</body></html>",
        ].join(""),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    );

    const body = await (await GET(request())).text();
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("evil.example");
    expect(body).toContain('<base href="https://remote.example/path/" target="_blank">');
  });

  it("keeps the raw-text contract for clients that call response.text()", async () => {
    const res = await GET(request());
    const body = await res.text();

    expect(typeof body).toBe("string");
    expect(body.startsWith("{")).toBe(false);
    expect(() => JSON.parse(body)).toThrow();
    expect(body).toContain("<h1>Visible copy</h1>");
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
});
