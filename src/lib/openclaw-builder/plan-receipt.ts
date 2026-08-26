/**
 * Deterministic receipt for a validated shadow plan. Binds hashes and job
 * identity only — never stores plan text and is not a GenerationInputPackage.
 * No I/O besides node:crypto hashing.
 */
import { createHash } from "node:crypto";

export type PlanReceipt = {
  schemaVersion: 1;
  generationInputPackageHash: string;
  lineageHash: string;
  planHash: string;
  modelLane: "shadow";
  jobId: string;
  createdAt: string;
};

const HEX64_RE = /^[0-9a-f]{64}$/;
const JOB_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/;
const ISO_DATETIME_OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const SECRET_LEAK_RE = /bearer|sk-|BEGIN PRIVATE|https:\/\//i;

const INVALID = { ok: false, code: "invalid_input" } as const;

export function createPlanReceipt(input: {
  generationInputPackageHash: string;
  lineageHash: string;
  plan: unknown;
  jobId: string;
  createdAt: string;
}): { ok: true; receipt: PlanReceipt } | { ok: false; code: "invalid_input" } {
  if (!isHex64(input.generationInputPackageHash)) return INVALID;
  if (!isHex64(input.lineageHash)) return INVALID;
  if (!isJobId(input.jobId)) return INVALID;
  if (!isIsoDateTimeWithOffset(input.createdAt)) return INVALID;

  const canonical = canonicalize(input.plan);
  if (canonical === null) return INVALID;
  if (SECRET_LEAK_RE.test(canonical)) return INVALID;

  const planHash = createHash("sha256").update(canonical, "utf8").digest("hex");
  if (!HEX64_RE.test(planHash)) return INVALID;

  return {
    ok: true,
    receipt: {
      schemaVersion: 1,
      generationInputPackageHash: input.generationInputPackageHash,
      lineageHash: input.lineageHash,
      planHash,
      modelLane: "shadow",
      jobId: input.jobId,
      createdAt: input.createdAt,
    },
  };
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function isJobId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID_RE.test(value);
}

function isIsoDateTimeWithOffset(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATETIME_OFFSET_RE.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function canonicalize(value: unknown): string | null {
  try {
    if (value === undefined) return null;
    const json = JSON.stringify(sortKeys(value));
    return typeof json === "string" ? json : null;
  } catch {
    return null;
  }
}

function sortKeys(value: unknown): unknown {
  if (typeof value === "function" || typeof value === "bigint" || typeof value === "symbol") {
    throw new Error("non_json");
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sortKeys(item)));
  }
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) continue;
      sorted[key] = sortKeys(child);
    }
    return sorted;
  }
  if (value !== null && typeof value === "object") {
    throw new Error("non_json");
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
