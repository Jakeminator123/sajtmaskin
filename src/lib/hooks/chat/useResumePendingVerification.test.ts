import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESUME_VERIFY_MAX_AGE_MS,
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
const TOO_OLD = new Date(NOW - RESUME_VERIFY_MAX_AGE_MS - 60_000).toISOString();

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
    previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
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
  it("returns the latest stranded F2 draft with its persisted previewUrl", () => {
    expect(findResumablePendingVersion([pendingRow(), promotedRow()], NOW)).toEqual({
      versionId: "ver_pending",
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });
  });

  it("returns null previewUrl when the row has none persisted", () => {
    expect(
      findResumablePendingVersion([pendingRow({ previewUrl: null })], NOW),
    ).toEqual({ versionId: "ver_pending", previewUrl: null });
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

  it("returns null for rows older than the max resume age (stale history)", () => {
    expect(
      findResumablePendingVersion([pendingRow({ createdAt: TOO_OLD })], NOW),
    ).toBeNull();
  });

  it("returns null for F3 integrations rows (server-verify owns them)", () => {
    expect(
      findResumablePendingVersion([pendingRow({ lifecycleStage: "integrations" })], NOW),
    ).toBeNull();
  });

  it("returns null for every non-null editKind provenance (quick_edit/import/restore)", () => {
    for (const editKind of ["quick_edit", "imported_repo", "restore", "anything_future"]) {
      expect(
        findResumablePendingVersion([pendingRow({ editKind })], NOW),
      ).toBeNull();
    }
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

  function mockRoutes(params: {
    postcheck?: { ok?: boolean; body?: unknown };
    qualityGate?: { ok?: boolean; status?: number; body?: unknown };
  }) {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/product-postcheck")) {
        return {
          ok: params.postcheck?.ok ?? true,
          status: (params.postcheck?.ok ?? true) ? 200 : 500,
          json: async () =>
            params.postcheck?.body ?? { skipped: false, productBlocked: false },
        };
      }
      if (String(url).includes("/validate-images") || String(url).includes("/error-log")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return {
        ok: params.qualityGate?.ok ?? true,
        status: params.qualityGate?.status ?? 200,
        json: async () => params.qualityGate?.body ?? { passed: true },
      };
    });
  }

  function callsTo(pathFragment: string): Array<[string, RequestInit]> {
    return fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(pathFragment),
    ) as Array<[string, RequestInit]>;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    mockRoutes({});
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("runs image-validation, then product-postcheck, then /quality-gate exactly once", async () => {
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

    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));

    const postcheckCalls = callsTo("/product-postcheck");
    expect(postcheckCalls).toHaveLength(1);
    expect(JSON.parse(String(postcheckCalls[0][1].body))).toEqual({
      versionId: "ver_pending",
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });
    // Order: image validation → postcheck → gate (normal-lane parity).
    const order = fetchMock.mock.calls.map(([url]) => String(url));
    const imageIdx = order.findIndex((u) => u.includes("/validate-images"));
    const postcheckIdx = order.findIndex((u) => u.includes("/product-postcheck"));
    const gateIdx = order.findIndex((u) => u.includes("/quality-gate"));
    expect(imageIdx).toBeGreaterThanOrEqual(0);
    expect(imageIdx).toBeLessThan(postcheckIdx);
    expect(postcheckIdx).toBeLessThan(gateIdx);
    expect(JSON.parse(String(callsTo("/validate-images")[0][1].body))).toEqual({
      versionId: "ver_pending",
      autoFix: true,
    });
    // The postcheck result is persisted as error-log rows (incl. the
    // `product_postcheck.summary` row the F3 trigger reads).
    const errorLogCalls = callsTo("/error-log");
    expect(errorLogCalls).toHaveLength(1);
    const persisted = JSON.parse(String(errorLogCalls[0][1].body)) as {
      logs: Array<{ category: string; meta?: { productBlocked?: boolean } }>;
    };
    expect(persisted.logs.some((l) => l.category === "product_postcheck.summary")).toBe(true);
    expect(JSON.parse(String(callsTo("/quality-gate")[0][1].body))).toEqual({
      versionId: "ver_pending",
    });

    // Re-render with a fresh array identity (poll tick) — the attempted-set
    // must prevent a second run for the same versionId.
    rerender({ versions: [pendingRow(), promotedRow()] });
    await waitFor(() => expect(mutateVersions).toHaveBeenCalled());
    expect(callsTo("/quality-gate")).toHaveLength(1);
  });

  it("still runs the gate on productBlocked and persists the blocking summary row", async () => {
    mockRoutes({
      postcheck: {
        body: {
          skipped: false,
          productBlocked: true,
          warnings: [{ code: "mobile_menu_failed", message: "Mobilmeny kunde inte verifieras" }],
          warningCount: 1,
        },
      },
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

    // Normal-lane parity (Codex P2 round 2): productBlocked is a warning, the
    // verify lane STILL runs so the row settles instead of staying pending.
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    expect(callsTo("/product-postcheck")).toHaveLength(1);
    // The F3 lift is blocked via the persisted summary row (Codex P1 round 2):
    // `PreviewPanelF3Trigger` reads `product_postcheck.summary` from /error-log.
    const errorLogCalls = callsTo("/error-log");
    expect(errorLogCalls).toHaveLength(1);
    const persisted = JSON.parse(String(errorLogCalls[0][1].body)) as {
      logs: Array<{ category: string; meta?: { productBlocked?: boolean } }>;
    };
    const summary = persisted.logs.find((l) => l.category === "product_postcheck.summary");
    expect(summary?.meta?.productBlocked).toBe(true);
  });

  it("continues to the gate when product-postcheck fails transport-level (normal-lane parity)", async () => {
    mockRoutes({ postcheck: { ok: false } });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow()],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
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

  it("stays quiet on non-200 quality gate (busy/unconfigured) but still refetches versions", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.success).mockClear();
    mockRoutes({
      qualityGate: { ok: false, status: 409, body: { code: "version_busy" } },
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
