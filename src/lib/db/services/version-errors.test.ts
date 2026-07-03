import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db/client mock — captures the chained .delete().where().returning() call.
// ---------------------------------------------------------------------------

const deletedRows = vi.fn();
const whereSpy = vi.fn();
const returningSpy = vi.fn();
const insertRows = vi.fn(() => [] as unknown[]);
const selectRows = vi.fn(() => [] as unknown[]);

vi.mock("@/lib/db/client", () => {
  const insertChain = () => ({
    values: () => ({ returning: () => Promise.resolve(insertRows()) }),
  });
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
      insert: vi.fn(() => insertChain()),
      select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve(selectRows()) }) })),
      execute: vi.fn(() => Promise.resolve([])),
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          execute: vi.fn(() => Promise.resolve([])),
          insert: vi.fn(() => insertChain()),
        };
        return await fn(tx);
      }),
    },
    dbConfigured: true,
  };
});

vi.mock("@/lib/logging/bug-register", () => ({
  appendBugRegisterEntries: vi.fn(),
}));

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

import { db } from "@/lib/db/client";
import { createEngineVersionErrorLogs, pruneStaleVersionErrorLogs } from "./version-errors";

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

describe("createEngineVersionErrorLogs (lock-timeout degrade)", () => {
  const lockErr = () =>
    Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });

  beforeEach(() => {
    insertRows.mockReset();
    insertRows.mockReturnValue([]);
    selectRows.mockReset();
    selectRows.mockReturnValue([]);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const onePayload = [{ chatId: "c-1", versionId: "v-1", level: "warning" as const, message: "m" }];

  it("returns [] for an empty payload list without touching the db", async () => {
    expect(await createEngineVersionErrorLogs([])).toEqual([]);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("inserts directly (no transaction) when no lockTimeoutMs is given", async () => {
    insertRows.mockReturnValue([{ id: "a" }]);
    const rows = await createEngineVersionErrorLogs(onePayload);
    expect(rows).toEqual([{ id: "a" }]);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("uses a bounded-lock transaction when lockTimeoutMs is set", async () => {
    insertRows.mockReturnValue([{ id: "z" }]);
    const rows = await createEngineVersionErrorLogs(onePayload, { lockTimeoutMs: 3000 });
    expect(rows).toEqual([{ id: "z" }]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("degrades to [] on row contention (55P03) instead of throwing a 500", async () => {
    (db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw lockErr();
    });
    const rows = await createEngineVersionErrorLogs(onePayload, { lockTimeoutMs: 3000 });
    expect(rows).toEqual([]);
  });

  it("rethrows non-lock errors even in bounded-lock mode", async () => {
    (db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw Object.assign(new Error("boom"), { code: "23505" });
    });
    await expect(
      createEngineVersionErrorLogs(onePayload, { lockTimeoutMs: 3000 }),
    ).rejects.toThrow("boom");
  });
});
