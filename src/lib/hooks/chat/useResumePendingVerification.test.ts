import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESUME_VERIFY_MIN_AGE_MS,
  findResumablePendingVersion,
  useResumePendingVerification,
} from "./useResumePendingVerification";

vi.mock("sonner", () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
  },
}));

// The hook reads the REAL clock (`Date.now()`), so row timestamps are derived
// from it too — a fixed fake "now" here would put createdAt in the future and
// silently fail the age gate.
const NOW = Date.now();
const OLD_ENOUGH = new Date(NOW - RESUME_VERIFY_MIN_AGE_MS - 60_000).toISOString();
const TOO_FRESH = new Date(NOW - 30_000).toISOString();

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ver_pending",
    versionId: "ver_pending",
    releaseState: "draft",
    verificationState: "pending",
    lifecycleStage: "design",
    editKind: null,
    createdAt: OLD_ENOUGH,
    versionNumber: 2,
    ...overrides,
  };
}

function promotedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ver_promoted",
    versionId: "ver_promoted",
    releaseState: "promoted",
    verificationState: "passed",
    lifecycleStage: "design",
    createdAt: OLD_ENOUGH,
    versionNumber: 1,
    ...overrides,
  };
}

describe("findResumablePendingVersion", () => {
  it("returns the latest stranded F2 draft", () => {
    expect(findResumablePendingVersion([pendingRow(), promotedRow()], NOW)).toBe(
      "ver_pending",
    );
  });

  it("returns null when the latest row is promoted (older pending rows are history)", () => {
    const stalePending = pendingRow({ id: "ver_old", versionId: "ver_old", versionNumber: 1 });
    const newerPromoted = promotedRow({ versionNumber: 2 });
    expect(findResumablePendingVersion([stalePending, newerPromoted], NOW)).toBeNull();
  });

  it("returns null while the row is younger than the resume age gate", () => {
    expect(
      findResumablePendingVersion([pendingRow({ createdAt: TOO_FRESH })], NOW),
    ).toBeNull();
  });

  it("returns null for F3 integrations rows (server-verify owns them)", () => {
    expect(
      findResumablePendingVersion([pendingRow({ lifecycleStage: "integrations" })], NOW),
    ).toBeNull();
  });

  it("returns null for quick_edit minor versions", () => {
    expect(
      findResumablePendingVersion([pendingRow({ editKind: "quick_edit" })], NOW),
    ).toBeNull();
  });

  it("returns null for legacy rows without releaseState", () => {
    expect(
      findResumablePendingVersion(
        [pendingRow({ releaseState: undefined, verificationState: undefined })],
        NOW,
      ),
    ).toBeNull();
  });

  it("returns null for non-pending verification states", () => {
    for (const state of ["verifying", "repairing", "repair_available", "passed", "failed"]) {
      expect(
        findResumablePendingVersion([pendingRow({ verificationState: state })], NOW),
      ).toBeNull();
    }
  });

  it("returns null on empty/invalid input", () => {
    expect(findResumablePendingVersion([], NOW)).toBeNull();
    expect(findResumablePendingVersion(null, NOW)).toBeNull();
    expect(findResumablePendingVersion([pendingRow({ createdAt: null })], NOW)).toBeNull();
  });
});

describe("useResumePendingVerification", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ passed: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts /quality-gate exactly once for a stranded version", async () => {
    const mutateVersions = vi.fn();
    const { rerender } = renderHook(
      (props: { versions: unknown[] }) =>
        useResumePendingVerification({
          chatId: "chat_1",
          versions: props.versions,
          isStreaming: false,
          mutateVersions,
        }),
      { initialProps: { versions: [pendingRow(), promotedRow()] } },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/quality-gate");
    expect(JSON.parse(String(init.body))).toEqual({ versionId: "ver_pending" });

    // Re-render with a fresh array identity (poll tick) — the attempted-set
    // must prevent a second POST for the same versionId.
    rerender({ versions: [pendingRow(), promotedRow()] });
    await waitFor(() => expect(mutateVersions).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing while streaming", async () => {
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow()],
        isStreaming: true,
      }),
    );
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without a resumable candidate", async () => {
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [promotedRow()],
        isStreaming: false,
      }),
    );
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays quiet on non-200 (busy/unconfigured) but still refetches versions", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.success).mockClear();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: "version_busy" }),
    });
    const mutateVersions = vi.fn();
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow()],
        isStreaming: false,
        mutateVersions,
      }),
    );
    await waitFor(() => expect(mutateVersions).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
