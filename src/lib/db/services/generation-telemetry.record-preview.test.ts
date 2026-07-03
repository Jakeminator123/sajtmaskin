import { beforeEach, describe, expect, it, vi } from "vitest";

// M#pv1 (honest preview_success): recordPreviewRuntimeOutcomeForVersion stamps
// the CONFIRMED preview runtime outcome onto the version's latest telemetry row
// (best-effort — never throws, no-op without a row). Monotonic by contract
// (PR #377 review): null→true, null→false, false→true allowed; `true` is
// terminal (stale events never downgrade); same-value stamps skip the write.
const selectRows = vi.hoisted(
  () => ({ value: [] as Array<{ id: string; previewSuccess?: boolean | null }> }),
);
const updateCapture = vi.hoisted(() => ({ set: null as unknown, id: 0 }));

vi.mock("@/lib/db/client", () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(selectRows.value),
        }),
      }),
    }),
    update: () => ({
      set: (payload: unknown) => {
        updateCapture.set = payload;
        return {
          where: () => ({
            returning: () => {
              updateCapture.id += 1;
              return Promise.resolve([{ id: "tel_1" }]);
            },
          }),
        };
      },
    }),
  };
  return { db, dbConfigured: true };
});

const { recordPreviewRuntimeOutcomeForVersion } = await import("./generation-telemetry");

describe("recordPreviewRuntimeOutcomeForVersion (M#pv1, monotonic)", () => {
  beforeEach(() => {
    selectRows.value = [];
    updateCapture.set = null;
    updateCapture.id = 0;
    vi.clearAllMocks();
  });

  it("stamps null -> true on the latest telemetry row (runtime-ready receipt)", async () => {
    selectRows.value = [{ id: "tel_1", previewSuccess: null }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCapture.id).toBe(1);
    expect(updateCapture.set).toEqual({ previewSuccess: true });
  });

  it("stamps null -> false on the latest telemetry row (confirmed preview failure)", async () => {
    selectRows.value = [{ id: "tel_1", previewSuccess: null }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCapture.id).toBe(1);
    expect(updateCapture.set).toEqual({ previewSuccess: false });
  });

  it("upgrades false -> true (a later confirmed boot wins over an earlier start failure)", async () => {
    selectRows.value = [{ id: "tel_1", previewSuccess: false }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCapture.id).toBe(1);
    expect(updateCapture.set).toEqual({ previewSuccess: true });
  });

  it("treats true as terminal — a stale false never downgrades it", async () => {
    selectRows.value = [{ id: "tel_1", previewSuccess: true }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCapture.id).toBe(0);
    expect(updateCapture.set).toBeNull();
  });

  it("skips the write when re-stamping true on an already-confirmed row (idempotent)", async () => {
    selectRows.value = [{ id: "tel_1", previewSuccess: true }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCapture.id).toBe(0);
  });

  it("skips the write when re-stamping false on an already-failed row (idempotent)", async () => {
    selectRows.value = [{ id: "tel_1", previewSuccess: false }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCapture.id).toBe(0);
  });

  it("no-ops when the version has no telemetry row", async () => {
    selectRows.value = [];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCapture.id).toBe(0);
    expect(updateCapture.set).toBeNull();
  });

  it("no-ops for an empty versionId (best-effort)", async () => {
    await recordPreviewRuntimeOutcomeForVersion("", true);
    expect(updateCapture.id).toBe(0);
  });
});
