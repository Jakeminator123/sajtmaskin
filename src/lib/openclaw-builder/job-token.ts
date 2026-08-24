import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived P1 builder job token. This is the only credential a future
 * builder agent may present to Sajtmaskin tools. No I/O, no env, no writes.
 */

export const BUILDER_JOB_TOKEN_AUDIENCE = "openclaw-builder" as const;

export const BUILDER_TOOL_NAMES = [
  "job.get",
  "job.heartbeat",
  "job.cancel",
  "project.snapshot",
  "project.list_files",
  "project.read_file",
  "project.search",
  "project.diff",
  "orchestration.explain",
  "preview.status",
  "preview.logs",
  "preview.screenshot",
] as const;

export type BuilderToolName = (typeof BUILDER_TOOL_NAMES)[number];

export type BuilderJobTokenClaims = {
  tenantId: string;
  projectId: string;
  chatId: string;
  jobId: string;
  baseVersionId: string;
  baseFilesRevision: string;
  allowedTools: BuilderToolName[];
  expiresAtMs: number;
};

export type VerifyBuilderJobTokenResult =
  | { ok: true; claims: BuilderJobTokenClaims }
  | { ok: false; code: "invalid" | "expired" | "wrong_audience" };

const TOKEN_VERSION = "v1";
const CLAIM_ID_KEYS = [
  "tenantId",
  "projectId",
  "chatId",
  "jobId",
  "baseVersionId",
  "baseFilesRevision",
] as const;

const BUILDER_TOOL_NAME_SET: ReadonlySet<string> = new Set(BUILDER_TOOL_NAMES);

export function isBuilderToolName(tool: string): tool is BuilderToolName {
  return BUILDER_TOOL_NAME_SET.has(tool);
}

export function issueBuilderJobToken(input: {
  secret: string;
  claims: BuilderJobTokenClaims;
  nowMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const secret = requireNonEmptySecret(input.secret);
  const claims = normalizeIssuableClaims(input.claims, nowMs);
  const body = canonicalize(signedBody(BUILDER_JOB_TOKEN_AUDIENCE, claims));
  const mac = hmacSha256(secret, body);
  return `${TOKEN_VERSION}.${toBase64Url(body)}.${mac}`;
}

export function verifyBuilderJobToken(input: {
  secret: string;
  token: string;
  nowMs?: number;
  expectedAudience?: "openclaw-builder";
}): VerifyBuilderJobTokenResult {
  if (typeof input.secret !== "string" || input.secret.length === 0) {
    return { ok: false, code: "invalid" };
  }
  if (typeof input.token !== "string") {
    return { ok: false, code: "invalid" };
  }

  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) {
    return { ok: false, code: "invalid" };
  }

  const payloadBytes = fromBase64Url(parts[1]);
  const macBytes = fromBase64Url(parts[2]);
  if (!payloadBytes || !macBytes) {
    return { ok: false, code: "invalid" };
  }

  const expectedMac = Buffer.from(
    hmacSha256(input.secret, payloadBytes.toString("utf8")),
    "base64url",
  );
  if (macBytes.length !== expectedMac.length || !timingSafeEqual(macBytes, expectedMac)) {
    return { ok: false, code: "invalid" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { ok: false, code: "invalid" };
  }

  if (!isRecord(parsed) || typeof parsed.audience !== "string") {
    return { ok: false, code: "invalid" };
  }

  const expectedAudience = input.expectedAudience ?? BUILDER_JOB_TOKEN_AUDIENCE;
  if (parsed.audience !== expectedAudience) {
    return { ok: false, code: "wrong_audience" };
  }

  const claims = parseClaims(parsed);
  if (!claims) {
    return { ok: false, code: "invalid" };
  }

  const nowMs = input.nowMs ?? Date.now();
  if (nowMs >= claims.expiresAtMs) {
    return { ok: false, code: "expired" };
  }

  return { ok: true, claims };
}

function requireNonEmptySecret(secret: string): string {
  if (typeof secret !== "string" || secret.length === 0 || secret.trim() === "") {
    throw new Error("secret must be non-empty");
  }
  return secret;
}

function normalizeIssuableClaims(
  claims: BuilderJobTokenClaims,
  nowMs: number,
): BuilderJobTokenClaims {
  if (!isRecord(claims)) {
    throw new Error("claims are invalid");
  }

  const normalizedIds = {} as Pick<
    BuilderJobTokenClaims,
    (typeof CLAIM_ID_KEYS)[number]
  >;
  for (const key of CLAIM_ID_KEYS) {
    const value = claims[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${key} must be a non-empty string`);
    }
    normalizedIds[key] = value;
  }

  if (!Number.isFinite(claims.expiresAtMs)) {
    throw new Error("expiresAtMs must be a finite number");
  }
  if (claims.expiresAtMs <= nowMs) {
    throw new Error("expiresAtMs must be in the future");
  }

  if (!Array.isArray(claims.allowedTools)) {
    throw new Error("allowedTools must be an array");
  }

  const allowedTools: BuilderToolName[] = [];
  const seen = new Set<string>();
  for (const tool of claims.allowedTools) {
    if (typeof tool !== "string" || !isBuilderToolName(tool)) {
      throw new Error("allowedTools must be unique read-only builder tools");
    }
    if (seen.has(tool)) {
      throw new Error("allowedTools must not contain duplicates");
    }
    seen.add(tool);
    allowedTools.push(tool);
  }

  return {
    ...normalizedIds,
    allowedTools,
    expiresAtMs: claims.expiresAtMs,
  };
}

function parseClaims(body: Record<string, unknown>): BuilderJobTokenClaims | null {
  const normalizedIds = {} as Pick<
    BuilderJobTokenClaims,
    (typeof CLAIM_ID_KEYS)[number]
  >;
  for (const key of CLAIM_ID_KEYS) {
    const value = body[key];
    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }
    normalizedIds[key] = value;
  }

  if (!Number.isFinite(body.expiresAtMs) || typeof body.expiresAtMs !== "number") {
    return null;
  }

  if (!Array.isArray(body.allowedTools)) {
    return null;
  }

  const allowedTools: BuilderToolName[] = [];
  const seen = new Set<string>();
  for (const tool of body.allowedTools) {
    if (typeof tool !== "string" || !isBuilderToolName(tool) || seen.has(tool)) {
      return null;
    }
    seen.add(tool);
    allowedTools.push(tool);
  }

  return {
    ...normalizedIds,
    allowedTools,
    expiresAtMs: body.expiresAtMs,
  };
}

function signedBody(audience: string, claims: BuilderJobTokenClaims): Record<string, unknown> {
  return {
    audience,
    tenantId: claims.tenantId,
    projectId: claims.projectId,
    chatId: claims.chatId,
    jobId: claims.jobId,
    baseVersionId: claims.baseVersionId,
    baseFilesRevision: claims.baseFilesRevision,
    allowedTools: claims.allowedTools,
    expiresAtMs: claims.expiresAtMs,
  };
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

function hmacSha256(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64url");
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0) return null;
  if (decoded.toString("base64url") !== value) return null;
  return decoded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
