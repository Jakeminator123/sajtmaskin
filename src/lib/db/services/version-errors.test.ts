import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db/client mock — captures the chained .delete().where().returning() call.
// ---------------------------------------------------------------------------

const deletedRows = vi.fn();
const whereSpy = vi.fn();
const returningSpy = vi.fn();

vi.mock("@/lib/db/client", () => {
  return {
    db: {
      delete: vi.fn(() => ({
        where: (...args: unknown[]) => {
          whereSpy(...args);
          return {
            returning: (...rArgs: unknown[]) => {
              returningSpy(...rArgs);
              return Promise.resolve(deletedRows());
            },
          };
        },
      })),
    },
    dbConfigured: true,
  };
});

vi.mock("./shared", () => ({
  assertDbConfigured: vi.fn(),
}));

vi.mock("@/lib/gen/scaffolds", () => ({
  getScaffoldById: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/db/schema", () => ({
  engineChats: { id: "engine_chats.id", scaffoldId: "engine_chats.scaffold_id" },
  engineVersionErrorLogs: {
    id: "engine_version_error_logs.id",
    version_id: "engine_version_error_logs.version_id",
    meta: "engine_version_error_logs.meta",
    created_at: "engine_version_error_logs.created_at",
  },
}));

import { pruneStaleVersionErrorLogs } from "./version-errors";

describe("pruneStaleVersionErrorLogs", () => {
  beforeEach(() => {
    deletedRows.mockReset();
    whereSpy.mockReset();
    returningSpy.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when versionId is empty", async () => {
    const result = await pruneStaleVersionErrorLogs("", 5);
    expect(result).toBe(0);
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("returns 0 when currentRepairPassIndex is 0 (init pass — nothing to prune)", async () => {
    const result = await pruneStaleVersionErrorLogs("v-1", 0);
    expect(result).toBe(0);
    expect(whereSpy).not.toHaveBeenCalled();
  });

  it("returns 0 when currentRepairPassIndex is negative (defensive)", async () => {
    const result = await pruneStaleVersionErrorLogs("v-1", -1);
    expect(result).toBe(0);
  });

  it("issues delete with WHERE version_id + meta.repairPassIndex < N when pass > 0", async () => {
    deletedRows.mockReturnValue([{ id: "row-a" }, { id: "row-b" }, { id: "row-c" }]);
    const result = await pruneStaleVersionErrorLogs("v-42", 2);
    expect(result).toBe(3);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no rows matched (empty array)", async () => {
    deletedRows.mockReturnValue([]);
    const result = await pruneStaleVersionErrorLogs("v-42", 1);
    expect(result).toBe(0);
  });

  it("never throws on weird input — returns 0 for non-finite pass index", async () => {
    const result = await pruneStaleVersionErrorLogs("v-42", Number.NaN);
    expect(result).toBe(0);
    expect(whereSpy).not.toHaveBeenCalled();
  });
});
