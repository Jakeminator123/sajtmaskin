import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const lookupWhois = vi.hoisted(() => vi.fn());

vi.mock("@/lib/domains/rdap-client", () => ({ lookupWhois }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { GET, POST } = await import("./route");

function result(domain: string) {
  return {
    ok: true,
    domain,
    registered: true,
    rdapSupported: true,
    registrarName: null,
    registrarHandle: null,
    registrarEmails: [],
    created: null,
    updated: null,
    expires: null,
    status: [],
    nameservers: [],
    queryUrl: `https://rdap.example/domain/${domain}`,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupWhois.mockImplementation(async (domain: string) => result(domain));
});

describe("/api/domains/whois", () => {
  it("rejects oversized query and body inputs before lookup", async () => {
    const getResponse = await GET(
      new NextRequest(`http://localhost/api/domains/whois?domain=${"x".repeat(513)}`),
    );
    const postRequest = new NextRequest("http://localhost/api/domains/whois", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "2049" },
    });
    const postResponse = await POST(postRequest);

    expect(getResponse.status).toBe(400);
    expect(postResponse.status).toBe(413);
    expect(lookupWhois).not.toHaveBeenCalled();
  });

  it("normalizes a URL before the RDAP lookup", async () => {
    const request = new NextRequest(
      "http://localhost/api/domains/whois?domain=https%3A%2F%2Fwww.Example.com%2Fabout",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(lookupWhois).toHaveBeenCalledWith("example.com");
  });

  it.each(["bad_label.example", "example.com:443", "-bad.example"])(
    "rejects an invalid hostname before lookup: %s",
    async (domain) => {
      const request = new NextRequest("http://localhost/api/domains/whois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(lookupWhois).not.toHaveBeenCalled();
    },
  );

  it.each(["GET", "POST"])("masks RDAP failures for %s", async (method) => {
    lookupWhois.mockRejectedValue(new Error("https://rdap.secret.internal/token"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request =
      method === "GET"
        ? new NextRequest("http://localhost/api/domains/whois?domain=example.com")
        : new NextRequest("http://localhost/api/domains/whois", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: "example.com" }),
          });

    try {
      const response = method === "GET" ? await GET(request) : await POST(request);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "WHOIS lookup failed" });
    } finally {
      error.mockRestore();
    }
  });
});
