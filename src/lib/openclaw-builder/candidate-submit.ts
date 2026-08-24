/**
 * Idempotent `candidate.submit` against a non-persisted in-memory artifact
 * store. Not a version and not finalize. No I/O, no DB, no version write.
 */
import { createHash } from "node:crypto";

export type CandidateSubmitInput = {
  jobId: string;
  idempotencyKey: string;
  baseVersionId: string;
  baseFilesRevision: string;
  overlayHash: string; // 64 hex
  jobStatus:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "stale"
    | "cancelled"
    | "superseded"
    | "expired";
};

export type CandidateArtifact = {
  artifactId: string;
  jobId: string;
  overlayHash: string;
  persisted: false;
};

export type CandidateSubmitError =
  | "job_not_running"
  | "stale"
  | "cancelled"
  | "expired"
  | "idempotency_conflict"
  | "invalid_input";

export type CandidateSubmitResult =
  | { ok: true; artifact: CandidateArtifact; replayed: boolean }
  | { ok: false; code: CandidateSubmitError };

const HEX64_RE = /^[0-9a-f]{64}$/;

const JOB_STATUSES = new Set<CandidateSubmitInput["jobStatus"]>([
  "pending",
  "running",
  "completed",
  "failed",
  "stale",
  "cancelled",
  "superseded",
  "expired",
]);

type Stored = {
  jobId: string;
  baseVersionId: string;
  baseFilesRevision: string;
  overlayHash: string;
  artifactId: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function artifactIdFor(jobId: string, idempotencyKey: string, overlayHash: string): string {
  return createHash("sha256")
    .update(`${jobId}\0${idempotencyKey}\0${overlayHash}`, "utf8")
    .digest("hex");
}

function denyForJobStatus(
  jobStatus: CandidateSubmitInput["jobStatus"],
): { ok: false; code: Exclude<CandidateSubmitError, "idempotency_conflict" | "invalid_input"> } | null {
  switch (jobStatus) {
    case "running":
      return null;
    case "cancelled":
      return { ok: false, code: "cancelled" };
    case "expired":
      return { ok: false, code: "expired" };
    case "stale":
      return { ok: false, code: "stale" };
    default:
      return { ok: false, code: "job_not_running" };
  }
}

function publicArtifact(stored: Stored): CandidateArtifact {
  return {
    artifactId: stored.artifactId,
    jobId: stored.jobId,
    overlayHash: stored.overlayHash,
    persisted: false,
  };
}

export function createCandidateSubmitStore(): {
  submit(input: CandidateSubmitInput): CandidateSubmitResult;
} {
  const byKey = new Map<string, Stored>();

  return {
    submit(input) {
      if (input == null || typeof input !== "object") {
        return { ok: false, code: "invalid_input" };
      }
      if (!isNonEmptyString(input.jobId)) return { ok: false, code: "invalid_input" };
      if (!isNonEmptyString(input.idempotencyKey)) return { ok: false, code: "invalid_input" };
      if (!isNonEmptyString(input.baseVersionId)) return { ok: false, code: "invalid_input" };
      if (!isNonEmptyString(input.baseFilesRevision)) return { ok: false, code: "invalid_input" };
      if (!isHex64(input.overlayHash)) return { ok: false, code: "invalid_input" };
      if (typeof input.jobStatus !== "string" || !JOB_STATUSES.has(input.jobStatus)) {
        return { ok: false, code: "invalid_input" };
      }

      const statusDenied = denyForJobStatus(input.jobStatus);
      if (statusDenied) return statusDenied;

      const existing = byKey.get(input.idempotencyKey);
      if (existing) {
        const sameFingerprint =
          existing.jobId === input.jobId &&
          existing.baseVersionId === input.baseVersionId &&
          existing.baseFilesRevision === input.baseFilesRevision &&
          existing.overlayHash === input.overlayHash;
        if (!sameFingerprint) {
          return { ok: false, code: "idempotency_conflict" };
        }
        return { ok: true, artifact: publicArtifact(existing), replayed: true };
      }

      const stored: Stored = {
        jobId: input.jobId,
        baseVersionId: input.baseVersionId,
        baseFilesRevision: input.baseFilesRevision,
        overlayHash: input.overlayHash,
        artifactId: artifactIdFor(input.jobId, input.idempotencyKey, input.overlayHash),
      };
      byKey.set(input.idempotencyKey, stored);

      return { ok: true, artifact: publicArtifact(stored), replayed: false };
    },
  };
}
