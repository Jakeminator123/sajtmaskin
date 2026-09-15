import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getVercelToken = vi.hoisted(() => vi.fn(() => "secret-token"));

vi.mock("@/lib/vercel", () => ({ getVercelToken }));

const { observeVercelDomain } = await import("./domain-observation");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function providerFetch(responses: { config?: Response | Error; project?: Response | Error }) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret-token");
    if (url.includes("/v6/domains/")) {
      if (responses.config instanceof Error) throw responses.config;
      return responses.config ?? json({}, 500);
    }
    if (url.includes("/v9/projects/")) {
      if (responses.project instanceof Error) throw responses.project;
      return responses.project ?? json({}, 500);
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("observeVercelDomain", () => {
  it.each([
    ["kundensajt.com", "192.0.2.10"],
    ["kundensajt.se", "192.0.2.20"],
  ])("returns the provider's preferred A record for apex %s", async (domain, ip) => {
    providerFetch({
      config: json({
        configuredBy: null,
        acceptedChallenges: ["dns-01"],
        misconfigured: true,
        recommendedIPv4: [
          { rank: 2, value: ["192.0.2.99"] },
          { rank: 1, value: [ip] },
        ],
        recommendedCNAME: [{ rank: 1, value: "project.vercel-dns-017.com" }],
      }),
      project: json({
        name: domain,
        apexName: domain,
        projectId: "vp_customer",
        verified: false,
        verification: [],
      }),
    });

    const result = await observeVercelDomain({
      projectId: "vp_customer",
      domain,
      teamId: "team_server_owned",
    });

    expect(result).toEqual({
      domain,
      connection: "connected",
      ownership: "pending",
      dns: "invalid",
      https: "not_checked",
      activation: "not_started",
      records: [{ type: "A", host: domain, value: ip, purpose: "configuration" }],
    });
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => input.toString());
    expect(urls).toContain(
      `https://api.vercel.com/v6/domains/${domain}/config?projectIdOrName=vp_customer&teamId=team_server_owned`,
    );
    expect(urls).toContain(
      `https://api.vercel.com/v9/projects/vp_customer/domains/${domain}?teamId=team_server_owned`,
    );
  });

  it("uses the provider CNAME only for a subdomain proven on the exact project", async () => {
    providerFetch({
      config: json({
        misconfigured: false,
        recommendedIPv4: [{ rank: 1, value: ["192.0.2.10"] }],
        recommendedCNAME: [
          { rank: 2, value: "old.vercel-dns-017.com" },
          { rank: 1, value: "current.vercel-dns-017.com" },
        ],
      }),
      project: json({
        name: "www.example.co.uk",
        apexName: "example.co.uk",
        projectId: "vp_customer",
        verified: true,
        verification: [],
      }),
    });

    const result = await observeVercelDomain({
      projectId: "vp_customer",
      domain: "www.example.co.uk",
    });

    expect(result).toMatchObject({
      connection: "connected",
      ownership: "verified",
      dns: "valid",
      records: [
        {
          type: "CNAME",
          host: "www.example.co.uk",
          value: "current.vercel-dns-017.com",
          purpose: "configuration",
        },
      ],
    });
  });

  it("keeps an unconnected domain unknown and exposes no raw cross-project data", async () => {
    providerFetch({
      config: json({
        misconfigured: true,
        recommendedIPv4: [{ rank: 1, value: ["192.0.2.44"] }],
        recommendedCNAME: [{ rank: 1, value: "other.vercel-dns-017.com" }],
        conflict: { projectId: "vp_other", teamId: "team_other" },
      }),
      project: json(
        {
          error: {
            projectId: "vp_other",
            verification: [{ type: "TXT", domain: "_vercel.secret", value: "leak-me" }],
          },
        },
        404,
      ),
    });

    const result = await observeVercelDomain({
      projectId: "vp_customer",
      domain: "other-customer.com",
    });

    expect(result).toEqual({
      domain: "other-customer.com",
      connection: "not_connected",
      ownership: "unknown",
      dns: "invalid",
      https: "not_checked",
      activation: "not_started",
      records: [
        {
          type: "A",
          host: "other-customer.com",
          value: "192.0.2.44",
          purpose: "configuration",
        },
      ],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("vp_other");
    expect(serialized).not.toContain("team_other");
    expect(serialized).not.toContain("leak-me");
    expect(serialized).not.toContain("conflict");
  });

  it("rejects a mismatched project-domain payload and its ownership challenge", async () => {
    providerFetch({
      config: json({
        misconfigured: false,
        recommendedIPv4: [{ rank: 1, value: ["192.0.2.30"] }],
      }),
      project: json({
        name: "customer.com",
        apexName: "customer.com",
        projectId: "vp_other",
        verified: true,
        verification: [{ type: "TXT", domain: "_vercel.customer.com", value: "secret" }],
      }),
    });

    const result = await observeVercelDomain({
      projectId: "vp_customer",
      domain: "customer.com",
    });

    expect(result.connection).toBe("unknown");
    expect(result.ownership).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("vp_other");
  });

  it.each([
    [json({ error: "provider failure" }, 500), "unknown"],
    [new Error("network failure"), "unknown"],
    [json({ misconfigured: true }), "invalid"],
    [json({ misconfigured: false }), "valid"],
  ])("maps config failures and verdicts without false invalid (%#)", async (config, expected) => {
    providerFetch({
      config,
      project: json({
        name: "customer.com",
        apexName: "customer.com",
        projectId: "vp_customer",
        verified: true,
      }),
    });

    const result = await observeVercelDomain({
      projectId: "vp_customer",
      domain: "customer.com",
    });

    expect(result.dns).toBe(expected);
    expect(result.ownership).toBe("verified");
    expect(result.https).toBe("not_checked");
    expect(result.activation).toBe("not_started");
  });

  it("allowlists an exact pending ownership challenge without returning its reason", async () => {
    providerFetch({
      config: json({ misconfigured: true, recommendedIPv4: [] }),
      project: json({
        name: "customer.com",
        apexName: "customer.com",
        projectId: "vp_customer",
        verified: false,
        verification: [
          {
            type: "TXT",
            domain: "_vercel.customer.com",
            value: "vc-domain-verify=customer.com,abc",
            reason: "internal provider detail",
          },
        ],
      }),
    });

    const result = await observeVercelDomain({
      projectId: "vp_customer",
      domain: "customer.com",
    });

    expect(result.records).toEqual([
      {
        type: "TXT",
        host: "_vercel.customer.com",
        value: "vc-domain-verify=customer.com,abc",
        purpose: "ownership",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("internal provider detail");
  });

  it.each([undefined, "yes"])(
    "keeps missing or invalid provider verified=%s as unknown",
    async (verified) => {
      providerFetch({
        config: json({ misconfigured: false, recommendedIPv4: [] }),
        project: json({
          name: "customer.com",
          apexName: "customer.com",
          projectId: "vp_customer",
          verified,
          verification: [{ type: "TXT", domain: "_vercel.customer.com", value: "must-not-leak" }],
        }),
      });

      const result = await observeVercelDomain({
        projectId: "vp_customer",
        domain: "customer.com",
      });

      expect(result.connection).toBe("connected");
      expect(result.ownership).toBe("unknown");
      expect(JSON.stringify(result)).not.toContain("must-not-leak");
    },
  );
});
