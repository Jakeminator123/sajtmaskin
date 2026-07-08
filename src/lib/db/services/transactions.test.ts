import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db/client mock — drives createTransaction's FOR UPDATE lock + ledger insert.
// `lockedDiamonds` is the balance the locked user row reports.
// ---------------------------------------------------------------------------
let lockedDiamonds = 0;
const insertedValues: Array<Record<string, unknown>> = [];

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id", diamonds: "users.diamonds" },
  transactions: { id: "transactions.id" },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => Promise.resolve([{ diamonds: lockedDiamonds }]),
            }),
          }),
        }),
        update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            insertedValues.push(v);
            return { returning: () => Promise.resolve([{ ...v }]) };
          },
        }),
      };
      return fn(tx);
    }),
  },
  dbConfigured: true,
}));

import { createTransaction, InsufficientCreditsError } from "./transactions";

beforeEach(() => {
  insertedValues.length = 0;
  lockedDiamonds = 0;
});

describe("createTransaction rejectIfNegative guard (#29)", () => {
  it("rejects a debit that would drive the balance negative when the guard is on", async () => {
    lockedDiamonds = 5;
    await expect(
      createTransaction("u1", "deploy_production", -20, "deploy", undefined, undefined, {
        rejectIfNegative: true,
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    // No ledger row is written when the guard rejects.
    expect(insertedValues).toHaveLength(0);
  });

  it("carries required/available on the error", async () => {
    lockedDiamonds = 5;
    let caught: unknown;
    try {
      await createTransaction("u1", "deploy_production", -20, "deploy", undefined, undefined, {
        rejectIfNegative: true,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InsufficientCreditsError);
    expect((caught as InsufficientCreditsError).required).toBe(20);
    expect((caught as InsufficientCreditsError).available).toBe(5);
  });

  it("allows overdraft by default so charge-AFTER callers never lose the charge", async () => {
    lockedDiamonds = 5;
    const row = await createTransaction("u1", "prompt_create", -10, "gen");
    expect(row.balance_after).toBe(-5);
    expect(insertedValues).toHaveLength(1);
  });

  it("permits a debit that stays non-negative even with the guard on", async () => {
    lockedDiamonds = 50;
    const row = await createTransaction("u1", "deploy_production", -20, "deploy", undefined, undefined, {
      rejectIfNegative: true,
    });
    expect(row.balance_after).toBe(30);
  });

  it("never blocks a credit/refund (positive amount) even with the guard on", async () => {
    lockedDiamonds = 0;
    const row = await createTransaction(
      "u1",
      "deploy_production_refund",
      20,
      "refund",
      undefined,
      undefined,
      { rejectIfNegative: true },
    );
    expect(row.balance_after).toBe(20);
  });
});
