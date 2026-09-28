import { createHmac, randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminHandoffSecret,
  consumeHandoffJti,
  DEFAULT_HANDOFF_NEXT,
  resetHandoffJtiStore,
  safeAdminPath,
  verifyAdminHandoff,
} from "./admin-handoff";
import { resetServerEnvCacheForTests } from "@/lib/env";

const redisSet = vi.hoisted(() => vi.fn());

vi.mock("@upstash/redis", () => ({
  Redis: class {
    set = redisSet;
  },
}));

const SECRET = "handoff-test-secret";

type Claims = {
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  jti?: string;
  next?: string;
};

function sign(claims: Claims = {}, secret = SECRET): string {
  const iat = claims.iat ?? Math.floor(Date.now() / 1000);
  const payload = {
    iss: claims.iss ?? "jakobscrape-dash",
    aud: claims.aud ?? "sajtmaskin-admin",
    iat,
    exp: claims.exp ?? iat + 60,
    jti: claims.jti ?? randomBytes(16).toString("hex"),
    next: claims.next ?? "/admin/kostnadsfri",
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64url");
  return `${body}.${signature}`;
}

const REDIS_ENV_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;
const savedRedisEnv = Object.fromEntries(REDIS_ENV_KEYS.map((key) => [key, process.env[key]]));

function hideRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) delete process.env[key];
}

function restoreRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) {
    const value = savedRedisEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  resetHandoffJtiStore();
  restoreRedisEnv();
  redisSet.mockReset();
});

beforeEach(() => {
  hideRedisEnv();
});

describe("verifyAdminHandoff", () => {
  it("accepts a dashboard ticket", () => {
    const payload = verifyAdminHandoff(sign(), SECRET);
    expect(payload?.iss).toBe("jakobscrape-dash");
    expect(payload?.aud).toBe("sajtmaskin-admin");
    expect(payload?.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it("rejects a bad signature, a missing secret, and an expired ticket", () => {
    const token = sign();
    const forged = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyAdminHandoff(forged, SECRET)).toBeNull();
    expect(verifyAdminHandoff(token, "")).toBeNull();
    expect(verifyAdminHandoff(token, "   ")).toBeNull();

    const iat = Math.floor(Date.now() / 1000) - 120;
    expect(verifyAdminHandoff(sign({ iat, exp: iat + 60 }), SECRET)).toBeNull();
  });

  it("rejects the wrong audience and a clock that is more than 30 seconds ahead", () => {
    expect(verifyAdminHandoff(sign({ aud: "other-app" }), SECRET)).toBeNull();
    const iat = Math.floor(Date.now() / 1000) + 31;
    expect(verifyAdminHandoff(sign({ iat, exp: iat + 60 }), SECRET)).toBeNull();
  });

  it("accepts exp equal to now and iat exactly 30 seconds ahead", () => {
    const now = 1_700_000_000_000;
    const seconds = Math.floor(now / 1000);
    expect(verifyAdminHandoff(sign({ iat: seconds, exp: seconds }), SECRET, now)?.exp).toBe(
      seconds,
    );
    expect(
      verifyAdminHandoff(sign({ iat: seconds + 30, exp: seconds + 60 }), SECRET, now)?.iat,
    ).toBe(seconds + 30);
  });

  it("rejects a ticket that outlives the 60 second lifetime", () => {
    const now = 1_700_000_000_000;
    const seconds = Math.floor(now / 1000);
    expect(verifyAdminHandoff(sign({ iat: seconds, exp: seconds + 61 }), SECRET, now)).toBeNull();
    expect(verifyAdminHandoff(sign({ iat: seconds, exp: seconds + 60 }), SECRET, now)?.exp).toBe(
      seconds + 60,
    );
  });

  it("rejects a jti that is not 32 hex characters", () => {
    expect(verifyAdminHandoff(sign({ jti: "abc" }), SECRET)).toBeNull();
    expect(verifyAdminHandoff(sign({ jti: "g".repeat(32) }), SECRET)).toBeNull();
  });
});

describe("adminHandoffSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCacheForTests();
  });

  function secretFor(value: string | undefined): string | null {
    vi.stubEnv("ADMIN_HANDOFF_SECRET", value);
    resetServerEnvCacheForTests();
    return adminHandoffSecret();
  }

  it("treats empty, quoted empty and short values as missing", () => {
    expect(secretFor(undefined)).toBeNull();
    expect(secretFor("")).toBeNull();
    expect(secretFor("   ")).toBeNull();
    expect(secretFor('""')).toBeNull();
    expect(secretFor("''")).toBeNull();
    expect(secretFor(' "" ')).toBeNull();
    expect(secretFor("x".repeat(31))).toBeNull();
  });

  it("returns a long secret without surrounding quotes or whitespace", () => {
    const secret = "k".repeat(64);
    expect(secretFor(secret)).toBe(secret);
    expect(secretFor(`  "${secret}"  `)).toBe(secret);
  });
});

describe("safeAdminPath", () => {
  it("keeps an admin path and drops every off-site target", () => {
    expect(safeAdminPath("/admin")).toBe("/admin");
    expect(safeAdminPath("/admin/kostnadsfri")).toBe("/admin/kostnadsfri");
    expect(safeAdminPath("https://evil.example/admin")).toBe(DEFAULT_HANDOFF_NEXT);
    expect(safeAdminPath("//evil.example")).toBe(DEFAULT_HANDOFF_NEXT);
    expect(safeAdminPath("/admin/../konto")).toBe(DEFAULT_HANDOFF_NEXT);
    expect(safeAdminPath("/admin/kostnadsfri?next=https://evil.example")).toBe(
      DEFAULT_HANDOFF_NEXT,
    );
  });
});

describe("consumeHandoffJti", () => {
  it("remembers a jti for at least two minutes", async () => {
    const now = 1_700_000_000_000;
    const jti = "a".repeat(32);
    expect(await consumeHandoffJti(jti, now)).toBe("fresh");
    expect(await consumeHandoffJti(jti, now + 120_000)).toBe("replay");
    expect(await consumeHandoffJti(jti, now + 120_001)).toBe("fresh");
  });

  it("does not accept a production ticket when redis is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(await consumeHandoffJti("b".repeat(32))).toBe("unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses redis set-if-absent for two minutes when redis is configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    redisSet.mockResolvedValueOnce("OK");
    expect(await consumeHandoffJti("c".repeat(32))).toBe("fresh");
    expect(redisSet).toHaveBeenCalledWith(`admin-handoff:jti:${"c".repeat(32)}`, "1", {
      ex: 120,
      nx: true,
    });
    redisSet.mockResolvedValueOnce(null);
    expect(await consumeHandoffJti("c".repeat(32))).toBe("replay");
  });
});
