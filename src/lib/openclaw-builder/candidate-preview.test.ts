import { describe, expect, it } from "vitest";

import { openCandidatePreview } from "./candidate-preview";

const LIVE_URL = "https://preview.example.invalid/live";
const LIVE_POINTER = "sess-live-1";
const HEX_REVISION = "a".repeat(64);

function request(
  overrides: Partial<Parameters<typeof openCandidatePreview>[0]> = {},
): Parameters<typeof openCandidatePreview>[0] {
  return {
    jobId: "job-1",
    candidateWorkspaceRevision: HEX_REVISION,
    livePreviewUrl: LIVE_URL,
    liveSessionPointer: LIVE_POINTER,
    ...overrides,
  };
}

describe("openCandidatePreview", () => {
  it("leaves the live preview URL and session pointer untouched", () => {
    const result = openCandidatePreview(request());
    expect(result).toEqual({
      ok: true,
      tool: "candidate.preview",
      identity: "candidate",
      workspaceRevision: HEX_REVISION,
      movedLivePreviewUrl: false,
      movedLiveSessionPointer: false,
      livePreviewUrl: LIVE_URL,
      liveSessionPointer: LIVE_POINTER,
    });
  });

  it("echoes null live fields unchanged and never claims they moved", () => {
    const result = openCandidatePreview(
      request({ livePreviewUrl: null, liveSessionPointer: null }),
    );
    expect(result).toEqual({
      ok: true,
      tool: "candidate.preview",
      identity: "candidate",
      workspaceRevision: HEX_REVISION,
      movedLivePreviewUrl: false,
      movedLiveSessionPointer: false,
      livePreviewUrl: null,
      liveSessionPointer: null,
    });
  });

  it("allows attempted live fields that already match the live pointers", () => {
    const result = openCandidatePreview(
      request({
        attemptedLivePreviewUrl: LIVE_URL,
        attemptedLiveSessionPointer: LIVE_POINTER,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      identity: "candidate",
      movedLivePreviewUrl: false,
      movedLiveSessionPointer: false,
      livePreviewUrl: LIVE_URL,
      liveSessionPointer: LIVE_POINTER,
    });
  });

  it("denies an attempted live preview URL change", () => {
    expect(
      openCandidatePreview(
        request({ attemptedLivePreviewUrl: "https://preview.example.invalid/candidate" }),
      ),
    ).toEqual({ ok: false, code: "would_mutate_live" });
  });

  it("denies an attempted live session pointer change", () => {
    expect(
      openCandidatePreview(request({ attemptedLiveSessionPointer: "sess-candidate" })),
    ).toEqual({ ok: false, code: "would_mutate_live" });
  });

  it("denies clearing a live pointer", () => {
    expect(openCandidatePreview(request({ attemptedLivePreviewUrl: null }))).toEqual({
      ok: false,
      code: "would_mutate_live",
    });
    expect(openCandidatePreview(request({ attemptedLiveSessionPointer: null }))).toEqual({
      ok: false,
      code: "would_mutate_live",
    });
  });

  it("returns invalid_input for empty ids", () => {
    expect(openCandidatePreview(request({ jobId: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(openCandidatePreview(request({ jobId: "   " }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(openCandidatePreview(request({ candidateWorkspaceRevision: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("accepts opaque workspace revisions and rejects overlong or illegal ones", () => {
    expect(
      openCandidatePreview(request({ candidateWorkspaceRevision: "rev-candidate.1:foo" })),
    ).toMatchObject({ ok: true, workspaceRevision: "rev-candidate.1:foo" });
    expect(
      openCandidatePreview(request({ candidateWorkspaceRevision: "a".repeat(65) })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      openCandidatePreview(request({ candidateWorkspaceRevision: "rev/../x" })),
    ).toEqual({ ok: false, code: "invalid_input" });
  });
});
