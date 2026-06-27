import { createHash } from "node:crypto";
import type { CodeFile } from "@/lib/gen/parser";

/**
 * Repair payload envelope (issue #260 / Codex P2 #5 — repair-vs-user-edit clobber).
 *
 * A server/manual repair computes `repaired_files_json` from a snapshot of
 * `engine_versions.files_json` read at repair start ("base A"). If a user edits
 * the same version (via `/files`, normalize-text, validate-css, validate-images
 * -> `updateVersionFiles`) while the repair runs, `files_json` becomes "B". The
 * repair must NOT then publish/promote `repair(A)` over "B" — that silently
 * loses the user's edit.
 *
 * Fix without a migration: persist the SHA-256 of the EXACT `files_json` string
 * the repair was based on alongside the repaired files, in the existing
 * `repaired_files_json` TEXT column, using this envelope. `saveRepairedFiles`
 * binds its write to the base (atomic WHERE) and `acceptRepair` re-checks the
 * base hash before promoting — so a stale repair no-ops instead of clobbering.
 *
 * The hash is taken over the literal DB string (never a re-serialized
 * `JSON.stringify(codeFiles)`), so it is stable and comparison-safe.
 */
export const REPAIRED_FILES_ENVELOPE_VERSION = 1 as const;

export interface RepairedFilesEnvelope {
  /** Envelope schema version. */
  v: typeof REPAIRED_FILES_ENVELOPE_VERSION;
  /** SHA-256 (hex) of the exact `files_json` string the repair was based on. */
  baseFilesHash: string;
  /** The repaired files. */
  files: CodeFile[];
}

/** SHA-256 (hex) of the exact `files_json` string as stored in the DB. */
export function hashFilesJson(filesJson: string): string {
  return createHash("sha256").update(filesJson, "utf8").digest("hex");
}

/**
 * Build the envelope persisted in `repaired_files_json`. `repairedFilesJson` is
 * `JSON.stringify(repairedFiles)` (a CodeFile[] JSON string); `baseFilesJson` is
 * the exact `files_json` string the repair was computed from. Throws if
 * `repairedFilesJson` is not a valid JSON array (callers `.catch` -> no save).
 */
export function encodeRepairedFilesEnvelope(params: {
  repairedFilesJson: string;
  baseFilesJson: string;
}): string {
  const files = JSON.parse(params.repairedFilesJson) as unknown;
  if (!Array.isArray(files)) {
    throw new Error("encodeRepairedFilesEnvelope: repairedFilesJson is not an array");
  }
  const envelope: RepairedFilesEnvelope = {
    v: REPAIRED_FILES_ENVELOPE_VERSION,
    baseFilesHash: hashFilesJson(params.baseFilesJson),
    files: files as CodeFile[],
  };
  return JSON.stringify(envelope);
}

export type DecodedRepairPayload =
  | { kind: "envelope"; baseFilesHash: string; filesJson: string }
  | { kind: "legacy"; filesJson: string };

/**
 * Parse a stored `repaired_files_json` value. Handles both the new envelope
 * (`{ v, baseFilesHash, files }`) and a legacy plain `CodeFile[]` array written
 * before this change. Returns null for empty/garbage payloads.
 *
 * For both shapes `filesJson` is the promotable files-array JSON string:
 *   - envelope -> `JSON.stringify(envelope.files)`
 *   - legacy   -> the raw array string (unchanged)
 */
export function decodeRepairedFilesPayload(raw: string | null | undefined): DecodedRepairPayload | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    return { kind: "legacy", filesJson: raw };
  }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    (parsed as { v?: unknown }).v === REPAIRED_FILES_ENVELOPE_VERSION &&
    typeof (parsed as { baseFilesHash?: unknown }).baseFilesHash === "string" &&
    Array.isArray((parsed as { files?: unknown }).files)
  ) {
    const env = parsed as RepairedFilesEnvelope;
    return {
      kind: "envelope",
      baseFilesHash: env.baseFilesHash,
      filesJson: JSON.stringify(env.files),
    };
  }
  return null;
}
