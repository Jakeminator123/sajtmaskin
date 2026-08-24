import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BUILDER_JOB_TOKEN_AUDIENCE,
  BUILDER_JOB_TOKEN_MAX_TTL_MS,
  BUILDER_TOOL_NAMES,
  issueBuilderJobToken,
  verifyBuilderJobToken,
  type BuilderJobTokenClaims,
} from "./job-token";

const SECRET = "unit-test-builder-job-secret";
const NOW = 1_700_000_000_000;

function validClaims(overrides: Partial<BuilderJobTokenClaims> = {}): BuilderJobTokenClaims {
  return {
    tenantId: "tenant-1",
    projectId: "project-1",
    chatId: "chat-1",
    jobId: "job-1",
    baseVersionId: "version-1",
    baseFilesRevision: "rev-1",
    allowedTools: ["job.get", "project.read_file"],
    expiresAtMs: NOW + 60_000,
    ...overrides,
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function mintSignedToken(input: {
  secret: string;
  audience: string;
  claims: BuilderJobTokenClaims;
}): string {
  const body = JSON.stringify(
    sortKeys({
      audience: input.audience,
      tenantId: input.claims.tenantId,
      projectId: input.claims.projectId,
      chatId: input.claims.chatId,
      jobId: input.claims.jobId,
      baseVersionId: input.claims.baseVersionId,
      baseFilesRevision: input.claims.baseFilesRevision,
      allowedTools: input.claims.allowedTools,
      expiresAtMs: input.claims.expiresAtMs,
    }),
  );
  const mac = createHmac("sha256", input.secret).update(body, "utf8").digest("base64url");
  return `v1.${Buffer.from(body, "utf8").toString("base64url")}.${mac}`;
}

describe("issueBuilderJobToken / verifyBuilderJobToken", () => {
  it("issues a v1 token that verifies back to the same claims", () => {
    const claims = validClaims();
    const token = issueBuilderJobToken({ secret: SECRET, claims, nowMs: NOW });

    expect(token.startsWith("v1.")).toBe(true);
    expect(token.split(".")).toHaveLength(3);
    expect(token.includes(SECRET)).toBe(false);

    const verified = verifyBuilderJobToken({ secret: SECRET, token, nowMs: NOW });
    expect(verified).toEqual({ ok: true, claims });
  });

  it("rejects an expired token", () => {
    const token = issueBuilderJobToken({ secret: SECRET, claims: validClaims(), nowMs: NOW });
    expect(verifyBuilderJobToken({ secret: SECRET, token, nowMs: NOW + 60_000 })).toEqual({
      ok: false,
      code: "expired",
    });
  });

  it("rejects a tampered mac as invalid", () => {
    const token = issueBuilderJobToken({ secret: SECRET, claims: validClaims(), nowMs: NOW });
    const [version, payload, mac] = token.split(".");
    const flipped = mac.endsWith("A") ? `${mac.slice(0, -1)}B` : `${mac.slice(0, -1)}A`;
    expect(
      verifyBuilderJobToken({
        secret: SECRET,
        token: `${version}.${payload}.${flipped}`,
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, code: "invalid" });
  });

  it("rejects the wrong secret as invalid", () => {
    const token = issueBuilderJobToken({ secret: SECRET, claims: validClaims(), nowMs: NOW });
    expect(
      verifyBuilderJobToken({ secret: "other-secret", token, nowMs: NOW }),
    ).toEqual({ ok: false, code: "invalid" });
  });

  it("rejects a valid token minted for another audience", () => {
    const token = mintSignedToken({
      secret: SECRET,
      audience: "openclaw-gateway",
      claims: validClaims(),
    });
    expect(verifyBuilderJobToken({ secret: SECRET, token, nowMs: NOW })).toEqual({
      ok: false,
      code: "wrong_audience",
    });
  });

  it("rejects bad token formats as invalid", () => {
    for (const token of ["", "v1", "v1.only", "v2.a.b", "v1..mac", "not-a-token"]) {
      expect(verifyBuilderJobToken({ secret: SECRET, token, nowMs: NOW })).toEqual({
        ok: false,
        code: "invalid",
      });
    }
  });

  it("rejects an empty or whitespace verify secret as invalid", () => {
    const token = issueBuilderJobToken({ secret: SECRET, claims: validClaims(), nowMs: NOW });
    expect(verifyBuilderJobToken({ secret: "", token, nowMs: NOW })).toEqual({
      ok: false,
      code: "invalid",
    });
    expect(verifyBuilderJobToken({ secret: "   ", token, nowMs: NOW })).toEqual({
      ok: false,
      code: "invalid",
    });
  });

  it("rejects a non-finite nowMs as invalid", () => {
    const token = issueBuilderJobToken({ secret: SECRET, claims: validClaims(), nowMs: NOW });
    expect(
      verifyBuilderJobToken({ secret: SECRET, token, nowMs: Number.NaN }),
    ).toEqual({ ok: false, code: "invalid" });
    expect(
      verifyBuilderJobToken({ secret: SECRET, token, nowMs: Number.POSITIVE_INFINITY }),
    ).toEqual({ ok: false, code: "invalid" });
  });

  it("signs canonical JSON so key order does not affect verification", () => {
    const token = issueBuilderJobToken({ secret: SECRET, claims: validClaims(), nowMs: NOW });
    const reconstructed = mintSignedToken({
      secret: SECRET,
      audience: BUILDER_JOB_TOKEN_AUDIENCE,
      claims: validClaims(),
    });
    expect(token).toBe(reconstructed);
  });
});

describe("issueBuilderJobToken validation", () => {
  it("rejects an empty secret", () => {
    expect(() =>
      issueBuilderJobToken({ secret: "", claims: validClaims(), nowMs: NOW }),
    ).toThrow(/secret must be non-empty/);
    expect(() =>
      issueBuilderJobToken({ secret: "   ", claims: validClaims(), nowMs: NOW }),
    ).toThrow(/secret must be non-empty/);
  });

  it.each([
    "tenantId",
    "projectId",
    "chatId",
    "jobId",
    "baseVersionId",
    "baseFilesRevision",
  ] as const)("rejects empty %s", (field) => {
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({ [field]: "" }),
        nowMs: NOW,
      }),
    ).toThrow(new RegExp(`${field} must be a non-empty string`));
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({ [field]: "   " }),
        nowMs: NOW,
      }),
    ).toThrow(new RegExp(`${field} must be a non-empty string`));
  });

  it("rejects duplicate tools", () => {
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({ allowedTools: ["job.get", "job.get"] }),
        nowMs: NOW,
      }),
    ).toThrow(/duplicates/);
  });

  it("rejects write and unknown tools at issue time", () => {
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({
          allowedTools: ["apply_patch"] as unknown as BuilderJobTokenClaims["allowedTools"],
        }),
        nowMs: NOW,
      }),
    ).toThrow(/read-only builder tools/);
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({
          allowedTools: ["project.write_file"] as unknown as BuilderJobTokenClaims["allowedTools"],
        }),
        nowMs: NOW,
      }),
    ).toThrow(/read-only builder tools/);
  });

  it("rejects a ttl longer than 15 minutes", () => {
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({ expiresAtMs: NOW + BUILDER_JOB_TOKEN_MAX_TTL_MS + 1 }),
        nowMs: NOW,
      }),
    ).toThrow(/expiresAtMs exceeds max ttl/);
  });

  it("rejects expiresAtMs in the past or equal to now", () => {
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({ expiresAtMs: NOW }),
        nowMs: NOW,
      }),
    ).toThrow(/expiresAtMs must be in the future/);
    expect(() =>
      issueBuilderJobToken({
        secret: SECRET,
        claims: validClaims({ expiresAtMs: NOW - 1 }),
        nowMs: NOW,
      }),
    ).toThrow(/expiresAtMs must be in the future/);
  });

  it("accepts every known read-only builder tool", () => {
    const token = issueBuilderJobToken({
      secret: SECRET,
      claims: validClaims({ allowedTools: [...BUILDER_TOOL_NAMES] }),
      nowMs: NOW,
    });
    const verified = verifyBuilderJobToken({ secret: SECRET, token, nowMs: NOW });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.allowedTools).toEqual([...BUILDER_TOOL_NAMES]);
    }
  });
});
