import { beforeEach, describe, expect, it, vi } from "vitest";

// M#pv1 (honest preview_success): recordPreviewRuntimeOutcomeForVersion stamps
// the CONFIRMED preview runtime outcome onto the version's latest telemetry row
// (best-effort — never throws, no-op without a row). Mirrors the
// recordDeployResultForVersion "latest wins" pattern.
const selectRows = vi.hoisted(() => ({ value: [] as Array<{ id: string }> }));
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

describe("recordPreviewRuntimeOutcomeForVersion (M#pv1)", () => {
  beforeEach(() => {
    selectRows.value = [];
    updateCapture.set = null;
    updateCapture.id = 0;
    vi.clearAllMocks();
  });

  it("stamps preview_success=true on the latest telemetry row (runtime ready)", async () => {
    selectRows.value = [{ id: "tel_1" }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", true);
    expect(updateCapture.id).toBe(1);
    expect(updateCapture.set).toEqual({ previewSuccess: true });
  });

  it("stamps preview_success=false on the latest telemetry row (preview failed)", async () => {
    selectRows.value = [{ id: "tel_1" }];
    await recordPreviewRuntimeOutcomeForVersion("ver_1", false);
    expect(updateCapture.id).toBe(1);
    expect(updateCapture.set).toEqual({ previewSuccess: false });
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
