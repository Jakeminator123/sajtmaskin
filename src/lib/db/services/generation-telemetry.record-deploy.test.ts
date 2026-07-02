import { beforeEach, describe, expect, it, vi } from "vitest";

// Fas 0: recordDeployResultForVersion ska stämpla deploy_result på versionens
// senaste telemetri-rad (best-effort — aldrig kasta, no-op utan rad).
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

const { recordDeployResultForVersion } = await import("./generation-telemetry");

describe("recordDeployResultForVersion (Fas 0)", () => {
  beforeEach(() => {
    selectRows.value = [];
    updateCapture.set = null;
    updateCapture.id = 0;
    vi.clearAllMocks();
  });

  it("uppdaterar senaste telemetri-raden med deploy_result", async () => {
    selectRows.value = [{ id: "tel_1" }];
    await recordDeployResultForVersion("ver_1", "production:ready");
    expect(updateCapture.id).toBe(1);
    expect(updateCapture.set).toEqual({ deployResult: "production:ready" });
  });

  it("no-op när ingen telemetri-rad finns för versionen", async () => {
    selectRows.value = [];
    await recordDeployResultForVersion("ver_1", "production:error");
    expect(updateCapture.id).toBe(0);
    expect(updateCapture.set).toBeNull();
  });

  it("no-op för tomt versionId (best-effort)", async () => {
    await recordDeployResultForVersion("", "production:ready");
    expect(updateCapture.id).toBe(0);
  });
});
