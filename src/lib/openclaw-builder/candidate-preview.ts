/**
 * Candidate-preview contract beside live preview.
 * Library-only: no I/O, no Fly, no preview-host. This function must
 * refuse to move `preview_url` or the live session pointer.
 */

export type CandidatePreviewRequest = {
  jobId: string;
  candidateWorkspaceRevision: string;
  livePreviewUrl: string | null;
  liveSessionPointer: string | null;
};

export type CandidatePreviewResult =
  | {
      ok: true;
      tool: "candidate.preview";
      identity: "candidate";
      workspaceRevision: string;
      movedLivePreviewUrl: false;
      movedLiveSessionPointer: false;
      livePreviewUrl: string | null;
      liveSessionPointer: string | null;
    }
  | { ok: false; code: "invalid_input" | "would_mutate_live" };

/** Hex-ish (0-9a-f) or opaque token; max 64 chars. */
export const WORKSPACE_REVISION_RE = /^[A-Za-z0-9._:-]{1,64}$/;

const INVALID = { ok: false, code: "invalid_input" } as const;
const WOULD_MUTATE_LIVE = { ok: false, code: "would_mutate_live" } as const;

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWorkspaceRevision(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_REVISION_RE.test(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function openCandidatePreview(
  input: CandidatePreviewRequest & {
    attemptedLivePreviewUrl?: string | null;
    attemptedLiveSessionPointer?: string | null;
  },
): CandidatePreviewResult {
  if (input == null || typeof input !== "object") return INVALID;
  if (!isNonEmptyId(input.jobId)) return INVALID;
  if (!isWorkspaceRevision(input.candidateWorkspaceRevision)) return INVALID;
  if (!isNullableString(input.livePreviewUrl)) return INVALID;
  if (!isNullableString(input.liveSessionPointer)) return INVALID;

  if (input.attemptedLivePreviewUrl !== undefined) {
    if (!isNullableString(input.attemptedLivePreviewUrl)) return INVALID;
    if (input.attemptedLivePreviewUrl !== input.livePreviewUrl) {
      return WOULD_MUTATE_LIVE;
    }
  }
  if (input.attemptedLiveSessionPointer !== undefined) {
    if (!isNullableString(input.attemptedLiveSessionPointer)) return INVALID;
    if (input.attemptedLiveSessionPointer !== input.liveSessionPointer) {
      return WOULD_MUTATE_LIVE;
    }
  }

  return {
    ok: true,
    tool: "candidate.preview",
    identity: "candidate",
    workspaceRevision: input.candidateWorkspaceRevision,
    movedLivePreviewUrl: false,
    movedLiveSessionPointer: false,
    livePreviewUrl: input.livePreviewUrl,
    liveSessionPointer: input.liveSessionPointer,
  };
}
