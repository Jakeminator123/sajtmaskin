import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL_HTTPS_PROOF_KIND,
  certificateHostMatches,
  isCanonicalHttpsProof,
  parseCanonicalHttpsCandidate,
  parseCanonicalHttpsIdentity,
  probeCanonicalHttpsOrigin,
  proveCanonicalHttps,
  type CanonicalHttpsObservation,
  type ProbeCanonicalHttpsOrigin,
} from "./canonical-https-proof";

const identity = {
  projectId: "project-1",
  vercelProjectId: "prj_1",
};

const HOST = "www.kund.se";
const ORIGIN = "https://www.kund.se";

function okObservation(
  overrides: Partial<CanonicalHttpsObservation> = {},
): CanonicalHttpsObservation {
  return {
    protocol: "https",
    authorized: true,
    certificateHosts: [HOST],
    serverName: HOST,
    responseHost: HOST,
    statusCode: 200,
    location: null,
    ...overrides,
  };
}

function probeWith(
  observation: CanonicalHttpsObservation | CanonicalHttpsObservation[],
): ProbeCanonicalHttpsOrigin {
  const queue = Array.isArray(observation) ? [...observation] : [observation];
  return vi.fn(async () => {
    if (queue.length > 1) return queue.shift() ?? okObservation();
    return queue[0] ?? okObservation();
  });
}

describe("parseCanonicalHttpsCandidate", () => {
  it("accepts a bare hostname and a clean HTTPS origin", () => {
    expect(parseCanonicalHttpsCandidate(HOST)).toEqual({
      status: "ok",
      origin: ORIGIN,
      hostname: HOST,
    });
    expect(parseCanonicalHttpsCandidate("https://www.kund.se/")).toEqual({
      status: "ok",
      origin: ORIGIN,
      hostname: HOST,
    });
  });

  it("rejects http-only, userinfo, non-default port, path and query", () => {
    expect(parseCanonicalHttpsCandidate("http://www.kund.se")).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "http_only",
    });
    expect(parseCanonicalHttpsCandidate("https://user:pass@www.kund.se")).toMatchObject({
      reason: "invalid_origin",
      verdict: "invalid",
    });
    expect(parseCanonicalHttpsCandidate("https://www.kund.se:8443")).toMatchObject({
      reason: "invalid_origin",
    });
    expect(parseCanonicalHttpsCandidate("https://www.kund.se/app")).toMatchObject({
      reason: "invalid_origin",
    });
    expect(parseCanonicalHttpsCandidate("https://www.kund.se?x=1")).toMatchObject({
      reason: "invalid_origin",
    });
  });

  it("rejects literal loopback, private and link-local hosts without probing", () => {
    const blocked = [
      "localhost",
      "preview.localhost",
      "device.local",
      "svc.internal",
      "127.0.0.1",
      "10.10.1.1",
      "192.168.0.42",
      "169.254.169.254",
      "https://127.0.0.1/",
      "https://169.254.169.254/",
      "8.8.8.8",
      "https://1.1.1.1/",
    ];
    for (const candidate of blocked) {
      expect(parseCanonicalHttpsCandidate(candidate)).toEqual({
        status: "not_ready",
        verdict: "invalid",
        reason: "blocked_destination",
      });
    }
  });
});

describe("parseCanonicalHttpsIdentity", () => {
  it("requires an exact project identity and treats empty vercel id as absent", () => {
    expect(parseCanonicalHttpsIdentity("project-1", "")).toEqual({
      status: "ok",
      projectId: "project-1",
      vercelProjectId: null,
    });
    expect(parseCanonicalHttpsIdentity(" project-1")).toMatchObject({
      reason: "invalid_identity",
      verdict: "invalid",
    });
    expect(parseCanonicalHttpsIdentity("project-1", " prj_1")).toMatchObject({
      reason: "invalid_identity",
    });
  });
});

describe("certificateHostMatches", () => {
  it("matches exact and single-label wildcard names only", () => {
    expect(certificateHostMatches("www.kund.se", ["www.kund.se"])).toBe(true);
    expect(certificateHostMatches("www.kund.se", ["*.kund.se"])).toBe(true);
    expect(certificateHostMatches("a.b.kund.se", ["*.kund.se"])).toBe(false);
    expect(certificateHostMatches("kund.se", ["*.kund.se"])).toBe(false);
  });
});

describe("proveCanonicalHttps", () => {
  it("returns a trusted proof when HTTPS and optional provider status match", async () => {
    const now = () => new Date("2026-09-15T01:00:00.000Z");
    const probe = probeWith(okObservation());
    const result = await proveCanonicalHttps(
      { candidate: HOST, ...identity, providerStatus: "verified" },
      { probe, now },
    );

    expect(result).toEqual({
      status: "ready",
      proof: {
        kind: CANONICAL_HTTPS_PROOF_KIND,
        version: 1,
        origin: ORIGIN,
        hostname: HOST,
        projectId: "project-1",
        vercelProjectId: "prj_1",
        verifiedAt: "2026-09-15T01:00:00.000Z",
        certificateHosts: [HOST],
        serverName: HOST,
        statusCode: 200,
      },
    });
    expect(result.status === "ready" && isCanonicalHttpsProof(result.proof)).toBe(true);
    expect(probe).toHaveBeenCalledWith({
      hostname: HOST,
      url: ORIGIN,
      timeoutMs: 8_000,
    });
  });

  it("can issue a transport proof when provider status is omitted", async () => {
    const result = await proveCanonicalHttps(
      { candidate: "https://www.kund.se", projectId: "project-1" },
      { probe: probeWith(okObservation()) },
    );
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.proof.vercelProjectId).toBeNull();
    }
  });

  it("follows a same-host path redirect and then proves the original origin", async () => {
    const probe = probeWith([
      okObservation({ statusCode: 302, location: "https://www.kund.se/hem" }),
      okObservation({ statusCode: 200 }),
    ]);
    const result = await proveCanonicalHttps({ candidate: ORIGIN, ...identity }, { probe });
    expect(result.status).toBe("ready");
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenLastCalledWith({
      hostname: HOST,
      url: "https://www.kund.se/hem",
      timeoutMs: 8_000,
    });
    if (result.status === "ready") {
      expect(result.proof.origin).toBe(ORIGIN);
    }
  });

  it("keeps a trailing slash on the URL that is actually fetched", async () => {
    const probe = probeWith([
      okObservation({ statusCode: 302, location: "https://www.kund.se/hem/" }),
      okObservation({ statusCode: 200 }),
    ]);
    const result = await proveCanonicalHttps({ candidate: ORIGIN, ...identity }, { probe });
    expect(result.status).toBe("ready");
    expect(probe).toHaveBeenNthCalledWith(1, {
      hostname: HOST,
      url: ORIGIN,
      timeoutMs: 8_000,
    });
    expect(probe).toHaveBeenNthCalledWith(2, {
      hostname: HOST,
      url: "https://www.kund.se/hem/",
      timeoutMs: 8_000,
    });
  });

  it("follows /hem to /hem/ without collapsing the slash into a self-redirect", async () => {
    const probe = probeWith([
      okObservation({ statusCode: 302, location: "https://www.kund.se/hem" }),
      okObservation({ statusCode: 301, location: "https://www.kund.se/hem/" }),
      okObservation({ statusCode: 200 }),
    ]);
    const result = await proveCanonicalHttps({ candidate: ORIGIN, ...identity }, { probe });
    expect(result.status).toBe("ready");
    expect(probe).toHaveBeenNthCalledWith(2, {
      hostname: HOST,
      url: "https://www.kund.se/hem",
      timeoutMs: 8_000,
    });
    expect(probe).toHaveBeenNthCalledWith(3, {
      hostname: HOST,
      url: "https://www.kund.se/hem/",
      timeoutMs: 8_000,
    });
  });

  it("preserves query on the fetched redirect target", async () => {
    const probe = probeWith([
      okObservation({ statusCode: 302, location: "https://www.kund.se/hem/?utm=1" }),
      okObservation({ statusCode: 200 }),
    ]);
    const result = await proveCanonicalHttps({ candidate: ORIGIN, ...identity }, { probe });
    expect(result.status).toBe("ready");
    expect(probe).toHaveBeenLastCalledWith({
      hostname: HOST,
      url: "https://www.kund.se/hem/?utm=1",
      timeoutMs: 8_000,
    });
  });

  it("still stops a real two-way redirect loop after slash-preserving fetches", async () => {
    const loop = await proveCanonicalHttps(
      { candidate: HOST, ...identity },
      {
        probe: probeWith([
          okObservation({ statusCode: 302, location: "https://www.kund.se/a/" }),
          okObservation({ statusCode: 302, location: "https://www.kund.se/" }),
        ]),
      },
    );
    expect(loop).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "redirect_loop",
    });
  });

  it("still rejects an off-host redirect without fetching the new host", async () => {
    const probe = probeWith(
      okObservation({ statusCode: 302, location: "https://annan.se/hem/" }),
    );
    const result = await proveCanonicalHttps({ candidate: HOST, ...identity }, { probe });
    expect(result).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "host_mismatch",
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith({
      hostname: HOST,
      url: ORIGIN,
      timeoutMs: 8_000,
    });
  });

  it("rejects a blocked candidate before the injected probe runs", async () => {
    const probe = probeWith(okObservation());
    const result = await proveCanonicalHttps(
      { candidate: "127.0.0.1", ...identity },
      { probe },
    );
    expect(result).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "blocked_destination",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("classifies confirmed broken hosts as invalid, not unknown", async () => {
    const cases: Array<[CanonicalHttpsObservation, string]> = [
      [okObservation({ authorized: false }), "cert_mismatch"],
      [okObservation({ certificateHosts: ["other.example"] }), "cert_mismatch"],
      [okObservation({ serverName: "other.example" }), "host_mismatch"],
      [okObservation({ responseHost: "other.example" }), "host_mismatch"],
      [okObservation({ statusCode: 301, location: ORIGIN }), "self_redirect"],
      [okObservation({ statusCode: 302, location: "http://www.kund.se/next" }), "http_only"],
      [okObservation({ statusCode: 302, location: "https://annan.se/" }), "host_mismatch"],
      [okObservation({ statusCode: 302, location: "" }), "http_error"],
      [okObservation({ statusCode: 404 }), "http_error"],
      [okObservation({ statusCode: 500 }), "http_error"],
      [{ errorKind: "http_only", protocol: "http" }, "http_only"],
      [{ errorKind: "cert_mismatch", authorized: false }, "cert_mismatch"],
    ];

    for (const [observation, reason] of cases) {
      const result = await proveCanonicalHttps(
        { candidate: HOST, ...identity },
        { probe: probeWith(observation) },
      );
      expect(result).toEqual({ status: "not_ready", verdict: "invalid", reason });
    }
  });

  it("classifies timeout and unknown network as unknown so last identity is kept", async () => {
    const timeout = await proveCanonicalHttps(
      { candidate: HOST, ...identity, providerStatus: "verified" },
      { probe: probeWith({ timedOut: true, errorKind: "timeout" }) },
    );
    const unknown = await proveCanonicalHttps(
      { candidate: HOST, ...identity, providerStatus: "verified" },
      { probe: probeWith({ errorKind: "network" }) },
    );
    expect(timeout).toEqual({ status: "not_ready", verdict: "unknown", reason: "timeout" });
    expect(unknown).toEqual({
      status: "not_ready",
      verdict: "unknown",
      reason: "unknown_status",
    });
  });

  it("does not emit a proof when provider status is unknown or invalid", async () => {
    const unknown = await proveCanonicalHttps(
      { candidate: HOST, ...identity, providerStatus: "unknown" },
      { probe: probeWith(okObservation()) },
    );
    const invalid = await proveCanonicalHttps(
      { candidate: HOST, ...identity, providerStatus: "invalid" },
      { probe: probeWith(okObservation()) },
    );
    expect(unknown).toEqual({
      status: "not_ready",
      verdict: "unknown",
      reason: "provider_unknown",
    });
    expect(invalid).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "provider_invalid",
    });
  });

  it("detects a redirect loop without following off-host", async () => {
    const loop = await proveCanonicalHttps(
      { candidate: HOST, ...identity },
      {
        probe: probeWith([
          okObservation({ statusCode: 302, location: "https://www.kund.se/a" }),
          okObservation({ statusCode: 302, location: "https://www.kund.se/" }),
        ]),
      },
    );
    expect(loop).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "redirect_loop",
    });
  });

  it("never mutates env or contacts the network when a probe is injected", async () => {
    const envBefore = { ...process.env };
    const probe = probeWith(okObservation());
    await proveCanonicalHttps({ candidate: HOST, ...identity }, { probe });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(process.env).toEqual(envBefore);
  });

  it("refuses the default live probe under Vitest", async () => {
    await expect(proveCanonicalHttps({ candidate: HOST, ...identity })).rejects.toThrow(
      /refused to probe the network under Vitest/,
    );
  });

  it("does not let a caller-controlled URL host steer the socket", async () => {
    await expect(
      probeCanonicalHttpsOrigin({
        hostname: HOST,
        url: "https://evil.example/",
        timeoutMs: 50,
      }),
    ).resolves.toEqual({ errorKind: "blocked_destination" });
  });

  it("does not accept a forged proof object as a type-guard pass", () => {
    expect(
      isCanonicalHttpsProof({
        kind: CANONICAL_HTTPS_PROOF_KIND,
        version: 1,
        origin: "https://www.kund.se",
        hostname: "www.kund.se",
        projectId: "project-1",
      }),
    ).toBe(false);
  });

  it("rejects a complete form-valid object and a JSON clone of a real proof", async () => {
    const result = await proveCanonicalHttps(
      { candidate: HOST, ...identity },
      { probe: probeWith(okObservation()) },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const forged = {
      kind: CANONICAL_HTTPS_PROOF_KIND,
      version: 1,
      origin: ORIGIN,
      hostname: HOST,
      projectId: "project-1",
      vercelProjectId: "prj_1",
      verifiedAt: "2026-09-15T01:00:00.000Z",
      certificateHosts: [HOST],
      serverName: HOST,
      statusCode: 200,
    };
    expect(isCanonicalHttpsProof(forged)).toBe(false);
    expect(isCanonicalHttpsProof(JSON.parse(JSON.stringify(result.proof)))).toBe(false);
    expect(isCanonicalHttpsProof(result.proof)).toBe(true);
  });
});
