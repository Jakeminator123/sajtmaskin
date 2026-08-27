import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESUME_VERIFY_IMPORT_MIN_AGE_MS,
  RESUME_VERIFY_MAX_AGE_MS,
  RESUME_VERIFY_MIN_AGE_MS,
  RESUME_VERIFY_RUNTIME_RETRY_MS,
  findResumablePendingVersion,
  findResumeEligibleAtMs,
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
// Import lane: old enough for the 90 s import gate but too young for the
// normal 3 min gate — proves the lanes read different thresholds.
const IMPORT_OLD_ENOUGH = new Date(
  NOW - RESUME_VERIFY_IMPORT_MIN_AGE_MS - 30_000,
).toISOString();

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
      lane: "generated",
    });
  });

  it("returns null previewUrl when the row has none persisted", () => {
    expect(
      findResumablePendingVersion([pendingRow({ previewUrl: null })], NOW),
    ).toEqual({ versionId: "ver_pending", previewUrl: null, lane: "generated" });
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

  it("returns null for intentional-draft provenances (quick_edit/restore/unknown)", () => {
    for (const editKind of ["quick_edit", "restore", "anything_future"]) {
      expect(
        findResumablePendingVersion([pendingRow({ editKind })], NOW),
      ).toBeNull();
    }
  });

  it("resumes imported_repo rows on the import lane (no lane ever ran for them)", () => {
    expect(
      findResumablePendingVersion(
        [pendingRow({ editKind: "imported_repo", previewUrl: "https://preview.example/chat_1" })],
        NOW,
      ),
    ).toEqual({
      versionId: "ver_pending",
      previewUrl: "https://preview.example/chat_1",
      lane: "imported",
    });
  });

  it("uses the shorter import age gate: old enough for import, too young for generated", () => {
    // 90 s < age < 3 min → import lane resumes, generated lane does not.
    expect(
      findResumablePendingVersion(
        [pendingRow({ editKind: "imported_repo", createdAt: IMPORT_OLD_ENOUGH })],
        NOW,
      ),
    ).toMatchObject({ versionId: "ver_pending", lane: "imported" });
    expect(
      findResumablePendingVersion([pendingRow({ createdAt: IMPORT_OLD_ENOUGH })], NOW),
    ).toBeNull();
  });

  it("holds an imported_repo row younger than the import age gate", () => {
    expect(
      findResumablePendingVersion(
        [pendingRow({ editKind: "imported_repo", createdAt: TOO_FRESH })],
        NOW,
      ),
    ).toBeNull();
  });

  it("never resumes imported_repo rows older than the max resume age", () => {
    expect(
      findResumablePendingVersion(
        [pendingRow({ editKind: "imported_repo", createdAt: TOO_OLD })],
        NOW,
      ),
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

describe("findResumeEligibleAtMs", () => {
  it("returns the min-age deadline for a too-young candidate, per lane", () => {
    const createdMs = NOW - 30_000;
    const createdAt = new Date(createdMs).toISOString();
    expect(
      findResumeEligibleAtMs([pendingRow({ createdAt })], NOW),
    ).toBe(createdMs + RESUME_VERIFY_MIN_AGE_MS);
    expect(
      findResumeEligibleAtMs([pendingRow({ editKind: "imported_repo", createdAt })], NOW),
    ).toBe(createdMs + RESUME_VERIFY_IMPORT_MIN_AGE_MS);
  });

  it("returns null when the row is already eligible or can never be", () => {
    // Already eligible → candidate instead, no deadline.
    expect(findResumeEligibleAtMs([pendingRow()], NOW)).toBeNull();
    // Too old / wrong provenance / promoted → never eligible.
    expect(findResumeEligibleAtMs([pendingRow({ createdAt: TOO_OLD })], NOW)).toBeNull();
    expect(
      findResumeEligibleAtMs([pendingRow({ editKind: "quick_edit", createdAt: TOO_FRESH })], NOW),
    ).toBeNull();
    expect(findResumeEligibleAtMs([promotedRow()], NOW)).toBeNull();
  });
});

describe("useResumePendingVerification", () => {
  const fetchMock = vi.fn();
  const currentAttestation = {
    previewSessionId: "ps_n",
    lifecycleToken: "life_n",
    filesRevision: "rev_n",
  };

  function mockRoutes(params: {
    postcheck?: { ok?: boolean; body?: unknown };
    qualityGate?: { ok?: boolean; status?: number; body?: unknown };
    errorLog?: { ok?: boolean };
    previewSession?: { ok?: boolean; body?: unknown };
    previewStatus?: { ok?: boolean; body?: unknown };
  }) {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/preview-status")) {
        return {
          ok: params.previewStatus?.ok ?? true,
          status: (params.previewStatus?.ok ?? true) ? 200 : 500,
          json: async () =>
            params.previewStatus?.body ?? { ok: true, status: "running" },
        };
      }
      if (u.includes("/product-postcheck")) {
        return {
          ok: params.postcheck?.ok ?? true,
          status: (params.postcheck?.ok ?? true) ? 200 : 500,
          json: async () =>
            params.postcheck?.body ?? {
              skipped: false,
              productBlocked: false,
              attestation: currentAttestation,
            },
        };
      }
      if (u.includes("/preview-session")) {
        return {
          ok: params.previewSession?.ok ?? true,
          status: (params.previewSession?.ok ?? true) ? 200 : 503,
          json: async () =>
            params.previewSession?.body ?? {
              previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            },
        };
      }
      if (u.includes("/error-log")) {
        const ok = params.errorLog?.ok ?? true;
        return { ok, status: ok ? 200 : 500, json: async () => ({ ok }) };
      }
      if (u.includes("/validate-images")) {
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
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("runs image-validation, then product-postcheck, then /quality-gate exactly once", async () => {
    const mutateVersions = vi.fn();
    const onVersionStatusRefresh = vi.fn();
    const { rerender } = renderHook(
      (props: { versions: unknown[] }) =>
        useResumePendingVerification({
          chatId: "chat_1",
          versions: props.versions,
          isStreaming: false,
          mutateVersions,
          onVersionStatusRefresh,
        }),
      { initialProps: { versions: [pendingRow(), promotedRow()] } },
    );

    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    // Both status surfaces refresh after the gate (Codex P2 round 3): the
    // versions list AND the active preview badge's /version-status nonce.
    await waitFor(() => expect(onVersionStatusRefresh).toHaveBeenCalled());

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
          attestation: currentAttestation,
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

  it("survives a versions poll tick mid-chain (Bugbot HIGH: no cancellation)", async () => {
    // SWR idle-polls /versions every 60 s; each poll gives the hook a new
    // array identity and re-runs the effect. The in-flight chain must run to
    // completion — a cleanup-driven abort here would strand the row for the
    // whole session since attemptedRef blocks a retry.
    let resolvePostcheck!: () => void;
    const postcheckGate = new Promise<void>((resolve) => {
      resolvePostcheck = resolve;
    });
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/product-postcheck")) {
        await postcheckGate;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            skipped: false,
            productBlocked: false,
            attestation: currentAttestation,
          }),
        };
      }
      if (u.includes("/validate-images") || u.includes("/error-log")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ passed: true }) };
    });

    const { rerender } = renderHook(
      (props: { versions: unknown[] }) =>
        useResumePendingVerification({
          chatId: "chat_1",
          versions: props.versions,
          isStreaming: false,
        }),
      { initialProps: { versions: [pendingRow()] } },
    );

    await waitFor(() => expect(callsTo("/product-postcheck")).toHaveLength(1));
    // Poll tick lands while product-postcheck is still in flight.
    rerender({ versions: [pendingRow()] });
    resolvePostcheck();

    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
  });

  it("holds the gate and persists a non-product diagnostic on transport failure", async () => {
    mockRoutes({ postcheck: { ok: false } });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow()],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/error-log")).toHaveLength(1));
    expect(callsTo("/quality-gate")).toHaveLength(0);
    const persisted = JSON.parse(String(callsTo("/error-log")[0][1].body)) as {
      logs: Array<{ category: string; meta?: { skippedReason?: string } }>;
    };
    expect(persisted.logs).toEqual([
      expect.objectContaining({
        category: "post-check.product-postcheck-transport",
        meta: expect.objectContaining({ skippedReason: "transport_error" }),
      }),
    ]);
  });

  it("silently retries a superseded postcheck without logging or gating the stale DOM", async () => {
    mockRoutes({
      postcheck: {
        body: {
          ok: true,
          skipped: true,
          skippedReason: "preview_superseded",
          productBlocked: false,
          warnings: [],
        },
      },
    });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow()],
        isStreaming: false,
      }),
    );

    await waitFor(() => expect(callsTo("/product-postcheck")).toHaveLength(1));
    await Promise.resolve();
    expect(callsTo("/error-log")).toHaveLength(0);
    expect(callsTo("/quality-gate")).toHaveLength(0);
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

  it("retries after a transient 409 on the next poll tick, capped at max attempts", async () => {
    // Codex P2 round 4: a stale lease from the killed tab must not strand the
    // row for the session — the next /versions identity change retries.
    mockRoutes({
      qualityGate: { ok: false, status: 409, body: { code: "version_busy" } },
    });
    const { rerender } = renderHook(
      (props: { versions: unknown[] }) =>
        useResumePendingVerification({
          chatId: "chat_1",
          versions: props.versions,
          isStreaming: false,
        }),
      { initialProps: { versions: [pendingRow()] } },
    );

    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    rerender({ versions: [pendingRow()] });
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(2));
    rerender({ versions: [pendingRow()] });
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(3));
    // Attempts exhausted — further ticks do nothing.
    rerender({ versions: [pendingRow()] });
    await Promise.resolve();
    expect(callsTo("/quality-gate")).toHaveLength(3);
  });

  it("does NOT retry after a completed gate (terminal consumes all attempts)", async () => {
    mockRoutes({ qualityGate: { body: { passed: false } } });
    const { rerender } = renderHook(
      (props: { versions: unknown[] }) =>
        useResumePendingVerification({
          chatId: "chat_1",
          versions: props.versions,
          isStreaming: false,
        }),
      { initialProps: { versions: [pendingRow()] } },
    );
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    rerender({ versions: [pendingRow()] });
    await Promise.resolve();
    expect(callsTo("/quality-gate")).toHaveLength(1);
  });

  it("rehydrates a missing preview via /preview-session before the gate (Codex P1 r4)", async () => {
    mockRoutes({});
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ previewUrl: null })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    expect(callsTo("/preview-session")).toHaveLength(1);
    // The rehydrated URL feeds product-postcheck (not null).
    const postcheckBody = JSON.parse(String(callsTo("/product-postcheck")[0][1].body)) as {
      previewUrl: string | null;
    };
    expect(postcheckBody.previewUrl).toBe("https://vm-fly-jakem.fly.dev/chat_1");
  });

  it("holds the resume (no gate) when the preview cannot be rehydrated", async () => {
    mockRoutes({ previewSession: { ok: false } });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ previewUrl: null })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/preview-session")).toHaveLength(1));
    await Promise.resolve();
    expect(callsTo("/product-postcheck")).toHaveLength(0);
    expect(callsTo("/quality-gate")).toHaveLength(0);
  });

  it("retries a failed preview rehydrate when versions identity stays the same", async () => {
    vi.useFakeTimers();
    const versions = [pendingRow({ previewUrl: null })];
    let previewSessionCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/preview-session")) {
        previewSessionCalls += 1;
        if (previewSessionCalls === 1) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
        };
      }
      if (u.includes("/product-postcheck")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            skipped: false,
            productBlocked: false,
            attestation: currentAttestation,
          }),
        };
      }
      if (u.includes("/error-log") || u.includes("/validate-images")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ passed: true }) };
    });

    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions,
        isStreaming: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callsTo("/preview-session")).toHaveLength(1);
    expect(callsTo("/quality-gate")).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESUME_VERIFY_RUNTIME_RETRY_MS);
    });
    expect(callsTo("/preview-session")).toHaveLength(2);
    expect(callsTo("/quality-gate")).toHaveLength(1);
    unmount();
    vi.useRealTimers();
  });

  it("does not burn the 3-attempt budget on repeated preview-session 503s", async () => {
    vi.useFakeTimers();
    const versions = [pendingRow({ previewUrl: null })];
    mockRoutes({ previewSession: { ok: false } });

    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions,
        isStreaming: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callsTo("/preview-session")).toHaveLength(1);

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESUME_VERIFY_RUNTIME_RETRY_MS);
      });
    }
    expect(callsTo("/preview-session")).toHaveLength(4);
    expect(callsTo("/quality-gate")).toHaveLength(0);
    unmount();
    vi.useRealTimers();
  });

  it("runs the import lane WITHOUT image validation (verbatim contract)", async () => {
    const mutateVersions = vi.fn();
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
        mutateVersions,
      }),
    );

    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    // Verbatim contract: the import lane must never auto-rewrite files.
    expect(callsTo("/validate-images")).toHaveLength(0);
    // The rest of the chain mirrors the normal lane: postcheck → gate.
    expect(callsTo("/product-postcheck")).toHaveLength(1);
    expect(JSON.parse(String(callsTo("/quality-gate")[0][1].body))).toEqual({
      versionId: "ver_pending",
    });
  });

  it("persists an import-lane transport diagnostic and holds the VM gate", async () => {
    mockRoutes({ postcheck: { ok: false } });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );

    await waitFor(() => expect(callsTo("/error-log")).toHaveLength(1));
    expect(callsTo("/quality-gate")).toHaveLength(0);
    const persisted = JSON.parse(String(callsTo("/error-log")[0][1].body)) as {
      logs: Array<{ category: string; meta?: { skippedReason?: string } }>;
    };
    expect(persisted.logs).toEqual([
      expect.objectContaining({
        category: "post-check.product-postcheck-transport",
        meta: expect.objectContaining({ skippedReason: "transport_error" }),
      }),
    ]);
  });

  it("import lane rehydrates a missing preview before the gate", async () => {
    mockRoutes({});
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo", previewUrl: null })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
    expect(callsTo("/preview-session")).toHaveLength(1);
    expect(callsTo("/validate-images")).toHaveLength(0);
  });

  it("import lane holds on a still-booting runtime (no postcheck against a boot page)", async () => {
    mockRoutes({ previewStatus: { body: { ok: true, status: "starting" } } });
    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/preview-status")).toHaveLength(1));
    await Promise.resolve();
    // Cold boot must never be DOM-postchecked or gated (Bugbot medium #1027).
    expect(callsTo("/product-postcheck")).toHaveLength(0);
    expect(callsTo("/quality-gate")).toHaveLength(0);
    unmount();
  });

  it("import lane boots a stopped runtime via /preview-session, then holds", async () => {
    mockRoutes({ previewStatus: { body: { ok: true, status: "stopped" } } });
    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/preview-session")).toHaveLength(1));
    await Promise.resolve();
    expect(callsTo("/product-postcheck")).toHaveLength(0);
    expect(callsTo("/quality-gate")).toHaveLength(0);
    unmount();
  });

  it("retries import-lane starting holds without burning the attempt budget", async () => {
    // Same versions array identity: a quiet chat's SWR payload stays
    // deep-equal, so a missing self-schedule would hide behind a rerender.
    vi.useFakeTimers();
    const versions = [pendingRow({ editKind: "imported_repo" })];
    let previewStatusCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/preview-status")) {
        previewStatusCalls += 1;
        const status = previewStatusCalls <= 2 ? "starting" : "running";
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, status }),
        };
      }
      if (u.includes("/product-postcheck")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            skipped: false,
            productBlocked: false,
            attestation: currentAttestation,
          }),
        };
      }
      if (u.includes("/preview-session")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            previewUrl: "https://preview.example/chat_1",
          }),
        };
      }
      if (u.includes("/error-log") || u.includes("/validate-images")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ passed: true }) };
    });

    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions,
        isStreaming: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callsTo("/preview-status")).toHaveLength(1);
    expect(callsTo("/quality-gate")).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESUME_VERIFY_RUNTIME_RETRY_MS);
    });
    expect(callsTo("/preview-status")).toHaveLength(2);
    expect(callsTo("/quality-gate")).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESUME_VERIFY_RUNTIME_RETRY_MS);
    });
    expect(callsTo("/preview-status")).toHaveLength(3);
    expect(callsTo("/quality-gate")).toHaveLength(1);
    expect(callsTo("/product-postcheck")).toHaveLength(1);

    unmount();
    vi.useRealTimers();
  });

  it("import lane rebinds on version_mismatch and does not gate that tick", async () => {
    mockRoutes({ previewStatus: { body: { ok: true, status: "version_mismatch" } } });
    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/preview-session")).toHaveLength(1));
    await Promise.resolve();
    expect(callsTo("/quality-gate")).toHaveLength(0);
    expect(callsTo("/product-postcheck")).toHaveLength(0);
    unmount();
  });

  it("import lane does not rebind a session_newer mismatch onto an older version", async () => {
    mockRoutes({
      previewStatus: {
        body: { ok: true, status: "version_mismatch", mismatchDirection: "session_newer" },
      },
    });
    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/preview-status")).toHaveLength(1));
    await Promise.resolve();
    expect(callsTo("/preview-session")).toHaveLength(0);
    expect(callsTo("/quality-gate")).toHaveLength(0);
    unmount();
  });

  it("motprov: import lane still rebinds session_older mismatch", async () => {
    mockRoutes({
      previewStatus: {
        body: { ok: true, status: "version_mismatch", mismatchDirection: "session_older" },
      },
    });
    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/preview-session")).toHaveLength(1));
    expect(callsTo("/quality-gate")).toHaveLength(0);
    unmount();
  });

  it("import lane proceeds on a settled build_error verdict (honest red, not a race)", async () => {
    mockRoutes({ previewStatus: { body: { ok: true, status: "build_error" } } });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
  });

  it("import lane fails open when the preview-status probe is down", async () => {
    mockRoutes({ previewStatus: { ok: false } });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo" })],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1));
  });

  it("self-schedules the age gate: a too-young import verifies once the gate opens", async () => {
    // Eligible in ~200 ms (+1 s timer margin). Without the age-gate timer the
    // effect would never re-run for a quiet chat whose /versions payload stays
    // deep-equal across SWR polls (pr-ai-review F-285e977ed706 on #1027).
    const almostEligible = new Date(
      Date.now() - RESUME_VERIFY_IMPORT_MIN_AGE_MS + 200,
    ).toISOString();
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow({ editKind: "imported_repo", createdAt: almostEligible })],
        isStreaming: false,
      }),
    );
    // Nothing runs while the gate is closed…
    await Promise.resolve();
    expect(callsTo("/quality-gate")).toHaveLength(0);
    // …but the timer re-arms the evaluation when it opens.
    await waitFor(() => expect(callsTo("/quality-gate")).toHaveLength(1), {
      timeout: 5_000,
    });
  });

  it("retries a 409 quality-gate when versions identity stays the same", async () => {
    vi.useFakeTimers();
    const versions = [pendingRow()];
    let gateCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/quality-gate")) {
        gateCalls += 1;
        if (gateCalls === 1) {
          return { ok: false, status: 409, json: async () => ({ code: "version_busy" }) };
        }
        return { ok: true, status: 200, json: async () => ({ passed: true }) };
      }
      if (u.includes("/product-postcheck")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            skipped: false,
            productBlocked: false,
            attestation: currentAttestation,
          }),
        };
      }
      if (u.includes("/error-log") || u.includes("/validate-images")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const { unmount } = renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions,
        isStreaming: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callsTo("/quality-gate")).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESUME_VERIFY_RUNTIME_RETRY_MS);
    });
    expect(callsTo("/quality-gate")).toHaveLength(2);
    unmount();
    vi.useRealTimers();
  });

  it("fails closed when a productBlocked summary cannot be persisted (Codex P1 r4)", async () => {
    mockRoutes({
      postcheck: {
        body: {
          skipped: false,
          productBlocked: true,
          warnings: [{ code: "mobile_menu_failed", message: "Mobilmeny kunde inte verifieras" }],
          warningCount: 1,
          attestation: currentAttestation,
        },
      },
      errorLog: { ok: false },
    });
    renderHook(() =>
      useResumePendingVerification({
        chatId: "chat_1",
        versions: [pendingRow()],
        isStreaming: false,
      }),
    );
    await waitFor(() => expect(callsTo("/error-log")).toHaveLength(1));
    await Promise.resolve();
    // The blocker never reached the enforcement surface — do not promote.
    expect(callsTo("/quality-gate")).toHaveLength(0);
  });
});
