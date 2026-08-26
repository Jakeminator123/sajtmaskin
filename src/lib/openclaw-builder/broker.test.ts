import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizeBuilderToolCall, BUILDER_TOOL_PAYLOAD_MAX_BYTES } from "./broker";
import {
  issueBuilderJobToken,
  type BuilderJobTokenClaims,
} from "./job-token";

const SECRET = "unit-test-builder-broker-secret";
const NOW = 1_700_000_000_000;

function validClaims(overrides: Partial<BuilderJobTokenClaims> = {}): BuilderJobTokenClaims {
  return {
    tenantId: "tenant-1",
    projectId: "project-1",
    chatId: "chat-1",
    jobId: "job-1",
    baseVersionId: "version-1",
    baseFilesRevision: "rev-1",
    allowedTools: ["job.get", "project.read_file", "preview.status"],
    expiresAtMs: NOW + 60_000,
    ...overrides,
  };
}

function expectedIdentity(
  overrides: Partial<{
    tenantId: string;
    projectId: string;
    chatId: string;
    jobId: string;
    baseVersionId: string;
    baseFilesRevision: string;
    jobStatus:
      | "pending"
      | "running"
      | "completed"
      | "failed"
      | "stale"
      | "cancelled"
      | "superseded"
      | "expired";
  }> = {},
) {
  return {
    tenantId: "tenant-1",
    projectId: "project-1",
    chatId: "chat-1",
    jobId: "job-1",
    baseVersionId: "version-1",
    baseFilesRevision: "rev-1",
    jobStatus: "running" as const,
    ...overrides,
  };
}

function issueToken(claims: BuilderJobTokenClaims = validClaims()) {
  return issueBuilderJobToken({ secret: SECRET, claims, nowMs: NOW });
}

function authorize(
  overrides: Partial<Parameters<typeof authorizeBuilderToolCall>[0]> = {},
) {
  return authorizeBuilderToolCall({
    secret: SECRET,
    token: issueToken(),
    tool: "job.get",
    nowMs: NOW,
    expected: expectedIdentity(),
    payloadBytes: 0,
    budgetRemaining: { toolCalls: 1, readBytes: 4_096 },
    ...overrides,
  });
}

function mintForeignAudienceToken(audience: string): string {
  const claims = validClaims();
  const bodyObj: Record<string, unknown> = {
    allowedTools: claims.allowedTools,
    audience,
    baseFilesRevision: claims.baseFilesRevision,
    baseVersionId: claims.baseVersionId,
    chatId: claims.chatId,
    expiresAtMs: claims.expiresAtMs,
    jobId: claims.jobId,
    projectId: claims.projectId,
    tenantId: claims.tenantId,
  };
  const body = JSON.stringify(bodyObj);
  const mac = createHmac("sha256", SECRET).update(body, "utf8").digest("base64url");
  return `v1.${Buffer.from(body, "utf8").toString("base64url")}.${mac}`;
}

function mintWriteToolToken(): string {
  const claims = validClaims();
  const bodyObj: Record<string, unknown> = {
    allowedTools: ["apply_patch", "job.get"],
    audience: "openclaw-builder",
    baseFilesRevision: claims.baseFilesRevision,
    baseVersionId: claims.baseVersionId,
    chatId: claims.chatId,
    expiresAtMs: claims.expiresAtMs,
    jobId: claims.jobId,
    projectId: claims.projectId,
    tenantId: claims.tenantId,
  };
  const body = JSON.stringify(bodyObj);
  const mac = createHmac("sha256", SECRET).update(body, "utf8").digest("base64url");
  return `v1.${Buffer.from(body, "utf8").toString("base64url")}.${mac}`;
}

describe("authorizeBuilderToolCall", () => {
  it("allows a granted read-only tool for a running job", () => {
    expect(authorize()).toEqual({ ok: true });
    expect(authorize({ tool: "project.read_file" })).toEqual({ ok: true });
  });

  it("maps an expired token to expired_token", () => {
    expect(authorize({ nowMs: NOW + 60_000 })).toEqual({
      ok: false,
      code: "expired_token",
    });
  });

  it("maps a tampered mac to invalid_token", () => {
    const token = issueToken();
    const [version, payload, mac] = token.split(".");
    const flipped = mac.endsWith("A") ? `${mac.slice(0, -1)}B` : `${mac.slice(0, -1)}A`;
    expect(authorize({ token: `${version}.${payload}.${flipped}` })).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it("maps the wrong secret to invalid_token", () => {
    expect(authorize({ secret: "not-the-broker-secret" })).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it("maps a foreign-audience token to wrong_audience", () => {
    expect(authorize({ token: mintForeignAudienceToken("openclaw-gateway") })).toEqual({
      ok: false,
      code: "wrong_audience",
    });
  });

  it("denies a known tool that is not in the grant", () => {
    expect(authorize({ tool: "preview.logs" })).toEqual({
      ok: false,
      code: "tool_not_allowed",
    });
  });

  it("denies an unknown or write tool string", () => {
    expect(authorize({ tool: "apply_patch" })).toEqual({
      ok: false,
      code: "tool_not_allowed",
    });
    expect(authorize({ tool: "not.a.tool" })).toEqual({
      ok: false,
      code: "tool_not_allowed",
    });
    expect(authorize({ token: mintWriteToolToken(), tool: "job.get" })).toEqual({
      ok: false,
      code: "invalid_token",
    });
  });

  it.each([
    "tenantId",
    "projectId",
    "chatId",
    "jobId",
    "baseVersionId",
    "baseFilesRevision",
  ] as const)("denies identity mismatch on %s", (field) => {
    expect(authorize({ expected: expectedIdentity({ [field]: `other-${field}` }) })).toEqual({
      ok: false,
      code: "identity_mismatch",
    });
  });

  it("maps cancelled / superseded / stale job status distinctly", () => {
    expect(authorize({ expected: expectedIdentity({ jobStatus: "cancelled" }) })).toEqual({
      ok: false,
      code: "cancelled",
    });
    expect(authorize({ expected: expectedIdentity({ jobStatus: "superseded" }) })).toEqual({
      ok: false,
      code: "superseded",
    });
    expect(authorize({ expected: expectedIdentity({ jobStatus: "stale" }) })).toEqual({
      ok: false,
      code: "stale_revision",
    });
  });

  it("maps pending and terminal statuses to job_not_running", () => {
    for (const jobStatus of ["pending", "completed", "failed", "expired"] as const) {
      expect(authorize({ expected: expectedIdentity({ jobStatus }) })).toEqual({
        ok: false,
        code: "job_not_running",
      });
    }
  });

  it("rejects payloads above 256_000 bytes and accepts the limit", () => {
    expect(authorize({ payloadBytes: BUILDER_TOOL_PAYLOAD_MAX_BYTES })).toEqual({ ok: true });
    expect(authorize({ payloadBytes: BUILDER_TOOL_PAYLOAD_MAX_BYTES + 1 })).toEqual({
      ok: false,
      code: "payload_too_large",
    });
  });

  it("rejects a remaining tool-call budget below 1", () => {
    expect(authorize({ budgetRemaining: { toolCalls: 0, readBytes: 4_096 } })).toEqual({
      ok: false,
      code: "budget_exhausted",
    });
    expect(authorize({ budgetRemaining: { toolCalls: 1, readBytes: 0 } })).toEqual({
      ok: true,
    });
  });

  it("fails closed when payloadBytes or budgetRemaining is missing or not finite", () => {
    expect(
      authorizeBuilderToolCall({
        secret: SECRET,
        token: issueToken(),
        tool: "job.get",
        nowMs: NOW,
        expected: expectedIdentity(),
        budgetRemaining: { toolCalls: 1, readBytes: 4_096 },
      }),
    ).toEqual({ ok: false, code: "payload_too_large" });
    expect(authorize({ payloadBytes: Number.NaN })).toEqual({
      ok: false,
      code: "payload_too_large",
    });
    expect(
      authorizeBuilderToolCall({
        secret: SECRET,
        token: issueToken(),
        tool: "job.get",
        nowMs: NOW,
        expected: expectedIdentity(),
        payloadBytes: 0,
      }),
    ).toEqual({ ok: false, code: "budget_exhausted" });
    expect(authorize({ budgetRemaining: { toolCalls: 1, readBytes: Number.NaN } })).toEqual({
      ok: false,
      code: "budget_exhausted",
    });
  });
});
