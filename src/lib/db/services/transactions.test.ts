import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db/client mock — drives the FOR UPDATE select and captures the update/insert
// writes so we can assert what createTransaction() persists inside the locked
// transaction. `lockedRows` is what the row-locked SELECT returns.
// ---------------------------------------------------------------------------

let lockedRows: Array<{ diamonds: number | null }> = [];
const updateSet = vi.fn();
const insertValues = vi.fn();

vi.mock("@/lib/db/client", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve(lockedRows),
        }),
      }),
    }),
    update: () => ({
      set: (vals: unknown) => ({
        where: () => {
          updateSet(vals);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        returning: () => {
          insertValues(vals);
          return Promise.resolve([vals]);
        },
      }),
    }),
  };
  return {
    db: {
      transaction: (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    },
    dbConfigured: true,
  };
});

vi.mock("./shared", () => ({
  assertDbConfigured: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id", diamonds: "users.diamonds", updated_at: "users.updated_at" },
  transactions: {
    id: "transactions.id",
    user_id: "transactions.user_id",
    type: "transactions.type",
    amount: "transactions.amount",
    balance_after: "transactions.balance_after",
    stripe_session_id: "transactions.stripe_session_id",
  },
}));

import { createTransaction, InsufficientCreditsError } from "./transactions";

describe("createTransaction — atomic debit guard", () => {
  beforeEach(() => {
    lockedRows = [];
    updateSet.mockReset();
    insertValues.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a debit that would drive the locked balance negative", async () => {
    lockedRows = [{ diamonds: 3 }];
    await expect(
      createTransaction("u1", "prompt_create", -10, "Generering"),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    // Nothing is written when the debit is rejected.
    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("carries balance + required on the thrown error", async () => {
    lockedRows = [{ diamonds: 3 }];
    const err = await createTransaction("u1", "prompt_create", -10).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.code).toBe("INSUFFICIENT_CREDITS");
    expect(err.balance).toBe(3);
    expect(err.required).toBe(10);
  });

  it("applies a debit the locked balance can cover", async () => {
    lockedRows = [{ diamonds: 10 }];
    const row = await createTransaction("u1", "prompt_refine", -6, "Förfining");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ diamonds: 4 }));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ balance_after: 4, amount: -6 }),
    );
    expect(row).toMatchObject({ balance_after: 4 });
  });

  it("allows a debit that lands exactly on zero", async () => {
    lockedRows = [{ diamonds: 5 }];
    await createTransaction("u1", "openclaw_tip", -5);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ diamonds: 0 }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ balance_after: 0 }));
  });

  it("never blocks a credit (positive amount) from a zero balance", async () => {
    lockedRows = [{ diamonds: 0 }];
    await createTransaction("u1", "purchase", 25, "Köp");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ diamonds: 25 }));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ balance_after: 25, amount: 25 }),
    );
  });

  it("does not block a credit even if the stored balance is already negative", async () => {
    lockedRows = [{ diamonds: -5 }];
    await createTransaction("u1", "refund", 10, "Refund");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ diamonds: 5 }));
  });

  it("throws when the user row is missing", async () => {
    lockedRows = [];
    await expect(createTransaction("nope", "prompt_create", -1)).rejects.toThrow("User not found");
  });
});
