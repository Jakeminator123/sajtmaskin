/**
 * Live probe tests. DNS and https.request are mocked so no customer host or
 * internal address is contacted. The fake request calls the same agent lookup
 * the production probe installs, then records a connect only if that lookup
 * accepted the address — the pin is the connected record.
 */

import { EventEmitter } from "node:events";
import type { ClientRequest } from "node:http";
import type { RequestOptions } from "node:https";
import type { LookupAddress, LookupAllOptions } from "node:dns";
import type { PeerCertificate } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsLookup = vi.hoisted(() => vi.fn());
const httpsRequest = vi.hoisted(() => vi.fn());

vi.mock("node:dns", () => {
  const mocked = { lookup: dnsLookup };
  return { ...mocked, default: mocked };
});

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return {
    ...actual,
    request: httpsRequest,
    default: {
      ...actual,
      request: httpsRequest,
    },
  };
});

const { probeCanonicalHttpsOrigin } = await import("./canonical-https-proof");

const HOST = "www.kund.se";
const PUBLIC_IP = "93.184.216.34";
const PRIVATE_IP = "10.10.1.1";

type LookupCallback = {
  (err: NodeJS.ErrnoException | null, address: string, family: number): void;
  (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]): void;
};

const connectSpy = vi.fn();

function matchingCert(): PeerCertificate {
  return {
    subjectaltname: `DNS:${HOST}`,
    subject: { CN: HOST },
  } as PeerCertificate;
}

function mismatchCert(): PeerCertificate {
  return {
    subjectaltname: "DNS:other.example",
    subject: { CN: "other.example" },
  } as PeerCertificate;
}

function resolveTo(...addresses: string[]) {
  dnsLookup.mockImplementation(
    (
      _hostname: string,
      _options: unknown,
      callback: (err: Error | null, addresses: LookupAddress[]) => void,
    ) => {
      callback(
        null,
        addresses.map((address) => ({
          address,
          family: address.includes(":") ? 6 : 4,
        })),
      );
    },
  );
}

function agentLookup(options: RequestOptions): ((
  hostname: string,
  options: LookupAllOptions,
  callback: LookupCallback,
) => void) | undefined {
  const agent = options.agent as { options?: { lookup?: typeof dnsLookup } } | undefined;
  return agent?.options?.lookup as
    | ((hostname: string, options: LookupAllOptions, callback: LookupCallback) => void)
    | undefined;
}

function installPinnedRequestMock(input: {
  statusCode?: number;
  location?: string | null;
  cert?: PeerCertificate;
  authorized?: boolean;
  tlsError?: NodeJS.ErrnoException;
}) {
  httpsRequest.mockImplementation(
    (options: RequestOptions, callback?: (response: unknown) => void) => {
      const req = new EventEmitter() as ClientRequest & EventEmitter;
      req.setTimeout = vi.fn() as unknown as ClientRequest["setTimeout"];
      req.destroy = vi.fn(() => {
        req.emit("close");
        return req;
      }) as unknown as ClientRequest["destroy"];
      req.end = vi.fn(() => {
        const lookup = agentLookup(options);
        if (!lookup) {
          req.emit("error", new Error("probe request missing pinned agent lookup"));
          return req;
        }
        lookup(String(options.host ?? options.hostname), { all: true }, ((
          error: NodeJS.ErrnoException | null,
          addresses: LookupAddress[],
        ) => {
          if (error) {
            req.emit("error", error);
            return;
          }
          const address = addresses[0]?.address;
          connectSpy({
            address,
            host: options.host,
            servername: options.servername,
            path: options.path,
          });
          if (input.tlsError) {
            req.emit("error", input.tlsError);
            return;
          }
          const cert = input.cert ?? matchingCert();
          const socket = {
            authorized: input.authorized ?? true,
            authorizationError: input.authorized === false ? "UNABLE_TO_VERIFY_LEAF_SIGNATURE" : null,
            getPeerCertificate: () => cert,
          };
          callback?.({
            socket,
            statusCode: input.statusCode ?? 200,
            headers: { location: input.location ?? undefined },
            resume: () => undefined,
          });
        }) as LookupCallback);
        return req;
      }) as unknown as ClientRequest["end"];
      return req;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  connectSpy.mockReset();
  resolveTo(PUBLIC_IP);
  installPinnedRequestMock({});
});

afterEach(() => {
  httpsRequest.mockReset();
  dnsLookup.mockReset();
});

describe("probeCanonicalHttpsOrigin pinning", () => {
  it("does not look up or connect for a literal loopback host", async () => {
    const observation = await probeCanonicalHttpsOrigin({
      hostname: "localhost",
      url: "https://localhost/",
      timeoutMs: 50,
    });

    expect(observation).toMatchObject({ errorKind: "blocked_destination" });
    expect(httpsRequest).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("does not look up or connect for a literal private or link-local IP", async () => {
    for (const hostname of ["127.0.0.1", "192.168.1.20", "169.254.169.254", "10.0.0.8"]) {
      vi.clearAllMocks();
      connectSpy.mockReset();
      const observation = await probeCanonicalHttpsOrigin({
        hostname,
        url: `https://${hostname}/`,
        timeoutMs: 50,
      });
      expect(observation.errorKind).toBe("blocked_destination");
      expect(httpsRequest).not.toHaveBeenCalled();
      expect(dnsLookup).not.toHaveBeenCalled();
      expect(connectSpy).not.toHaveBeenCalled();
    }
  });

  it("blocks a public DNS name that resolves to a private IP before connect", async () => {
    resolveTo(PRIVATE_IP);

    const observation = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/`,
      timeoutMs: 50,
    });

    expect(observation).toMatchObject({ errorKind: "blocked_destination" });
    expect(dnsLookup).toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("uses the connect-time lookup as the pin so a rebound private address never connects", async () => {
    let calls = 0;
    dnsLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (err: Error | null, addresses: LookupAddress[]) => void,
      ) => {
        calls += 1;
        const address = calls === 1 ? PUBLIC_IP : PRIVATE_IP;
        callback(null, [{ address, family: 4 }]);
      },
    );

    const first = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/`,
      timeoutMs: 50,
    });
    expect(first.errorKind).toBeUndefined();
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy.mock.calls[0]?.[0]).toMatchObject({
      address: PUBLIC_IP,
      host: HOST,
      servername: HOST,
    });

    const rebound = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/hem/`,
      timeoutMs: 50,
    });
    expect(rebound).toMatchObject({ errorKind: "blocked_destination" });
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(rebound).not.toHaveProperty("statusCode");
  });

  it("re-pins a redirect hop so a new hostname that resolves private never connects", async () => {
    dnsLookup.mockImplementation(
      (
        hostname: string,
        _options: unknown,
        callback: (err: Error | null, addresses: LookupAddress[]) => void,
      ) => {
        callback(null, [
          {
            address: hostname === "evil.example" ? PRIVATE_IP : PUBLIC_IP,
            family: 4,
          },
        ]);
      },
    );

    const first = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/`,
      timeoutMs: 50,
    });
    expect(first.errorKind).toBeUndefined();
    expect(connectSpy).toHaveBeenCalledTimes(1);

    const redirected = await probeCanonicalHttpsOrigin({
      hostname: "evil.example",
      url: "https://evil.example/",
      timeoutMs: 50,
    });
    expect(redirected).toMatchObject({ errorKind: "blocked_destination" });
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy.mock.calls.some((call) => call[0].host === "evil.example")).toBe(false);
  });

  it("keeps TLS servername on the hostname when the pin accepts a public address", async () => {
    const observation = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/`,
      timeoutMs: 50,
    });

    expect(observation).toMatchObject({
      protocol: "https",
      authorized: true,
      certificateHosts: [HOST],
      serverName: HOST,
      statusCode: 200,
    });
    expect(connectSpy).toHaveBeenCalledWith({
      address: PUBLIC_IP,
      host: HOST,
      servername: HOST,
      path: "/",
    });
    expect(httpsRequest.mock.calls[0]?.[0]).toMatchObject({
      host: HOST,
      servername: HOST,
    });
  });

  it("classifies a certificate identity failure without treating it as destination pinning", async () => {
    const tlsError = Object.assign(new Error("Hostname/IP does not match certificate's altnames"), {
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    installPinnedRequestMock({ tlsError });

    const observation = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/`,
      timeoutMs: 50,
    });

    expect(observation).toMatchObject({
      errorKind: "cert_mismatch",
      authorized: false,
      protocol: "https",
    });
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects an authorized socket whose certificate names do not match the host", async () => {
    installPinnedRequestMock({ cert: mismatchCert(), authorized: true });

    const observation = await probeCanonicalHttpsOrigin({
      hostname: HOST,
      url: `https://${HOST}/`,
      timeoutMs: 50,
    });

    expect(observation.authorized).toBe(false);
    expect(observation.certificateHosts).toEqual(["other.example"]);
    expect(observation.serverName).toBe(HOST);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("maps a pinned-address block to the typed observation instead of a raw throw", async () => {
    dnsLookup.mockImplementation(
      (
        _hostname: string,
        _options: unknown,
        callback: (err: Error | null, addresses: LookupAddress[]) => void,
      ) => {
        callback(null, [{ address: PRIVATE_IP, family: 4 }]);
      },
    );

    await expect(
      probeCanonicalHttpsOrigin({
        hostname: HOST,
        url: `https://${HOST}/`,
        timeoutMs: 50,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        errorKind: "blocked_destination",
      }),
    );
    expect(connectSpy).not.toHaveBeenCalled();
  });
});

describe("proveCanonicalHttps live probe wiring", () => {
  it("classifies a connect-time pin failure as blocked_destination", async () => {
    const { proveCanonicalHttps } = await import("./canonical-https-proof");
    resolveTo(PRIVATE_IP);

    const result = await proveCanonicalHttps(
      { candidate: HOST, projectId: "project-1" },
      { probe: probeCanonicalHttpsOrigin },
    );

    expect(result).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "blocked_destination",
    });
    expect(connectSpy).not.toHaveBeenCalled();
    expect(dnsLookup).toHaveBeenCalled();
  });

  it("does not fetch an off-host redirect even when that name would resolve private", async () => {
    const { proveCanonicalHttps } = await import("./canonical-https-proof");
    installPinnedRequestMock({
      statusCode: 302,
      location: "https://evil.example/",
    });
    dnsLookup.mockImplementation(
      (
        hostname: string,
        _options: unknown,
        callback: (err: Error | null, addresses: LookupAddress[]) => void,
      ) => {
        callback(null, [
          { address: hostname === "evil.example" ? PRIVATE_IP : PUBLIC_IP, family: 4 },
        ]);
      },
    );

    const result = await proveCanonicalHttps(
      { candidate: HOST, projectId: "project-1" },
      { probe: probeCanonicalHttpsOrigin },
    );

    expect(result).toEqual({
      status: "not_ready",
      verdict: "invalid",
      reason: "host_mismatch",
    });
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(dnsLookup.mock.calls.some((call) => call[0] === "evil.example")).toBe(false);
  });
});
