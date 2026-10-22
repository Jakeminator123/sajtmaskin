import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createGitHubAppJwt,
  createInstallationTokenClient,
  normalizePrivateKey,
} from "./app-installation-token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
}

describe("createGitHubAppJwt", () => {
  it("signs an RS256 JWT with GitHub's iat/exp window and the app id as issuer", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const jwt = createGitHubAppJwt({ appId: "12345", privateKey: PEM }, now);
    const [header, payload, signature] = jwt.split(".");

    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = decodeSegment(payload);
    const seconds = Math.floor(now.getTime() / 1000);
    expect(claims).toEqual({ iat: seconds - 60, exp: seconds + 540, iss: "12345" });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    const normalizedSignature = signature.replace(/-/g, "+").replace(/_/g, "/");
    expect(verifier.verify(publicKey, Buffer.from(normalizedSignature, "base64"))).toBe(true);
  });

  it("accepts a single-line PEM with escaped newlines (Vercel copy/paste)", () => {
    const escaped = PEM.replace(/\n/g, "\\n");
    expect(normalizePrivateKey(escaped)).toBe(PEM);
    expect(() => createGitHubAppJwt({ appId: "1", privateKey: escaped })).not.toThrow();
  });
});

describe("createInstallationTokenClient", () => {
  const config = { appId: "12345", privateKey: PEM, installationId: "777" };

  it("exchanges the JWT for an installation token and caches it until near expiry", async () => {
    let clock = new Date("2026-10-22T10:00:00Z");
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.github.com/app/installations/777/access_tokens");
      expect(init?.method).toBe("POST");
      expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^Bearer /);
      return new Response(
        JSON.stringify({ token: "ghs_abc", expires_at: "2026-10-22T11:00:00Z" }),
        { status: 201 },
      );
    });
    const client = createInstallationTokenClient(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock,
    });

    const first = await client.getToken();
    const second = await client.getToken();
    expect(first.token).toBe("ghs_abc");
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Within the refresh margin → mint again.
    clock = new Date("2026-10-22T10:59:30Z");
    await client.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent callers into one mint", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: "ghs_x", expires_at: "2026-10-22T11:00:00Z" }), {
          status: 201,
        }),
    );
    const client = createInstallationTokenClient(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-10-22T10:00:00Z"),
    });
    await Promise.all([client.getToken(), client.getToken(), client.getToken()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces GitHub's error message instead of a token", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    );
    const client = createInstallationTokenClient(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getToken()).rejects.toThrow(/401.*Bad credentials/);
  });
});
