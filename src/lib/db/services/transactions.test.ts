import { beforeEach, describe, expect, it, vi } from "vitest";

let lockedDiamonds = 0;
let transactionTail: Promise<void> = Promise.resolve();
const insertedValues: Array<Record<string, unknown>> = [];

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  desc: (column: unknown) => column,
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));
vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id", diamonds: "users.diamonds" },
  transactions: {
    id: "transactions.id",
    user_id: "transactions.user_id",
    type: "transactions.type",
    idempotency_key: "transactions.idempotency_key",
    created_at: "transactions.created_at",
  },
}));

function matchingRows(where: { conditions?: Array<{ column: string; value: unknown }> }) {
  return insertedValues.filter((row) =>
    (where.conditions ?? []).every(({ column, value }) => {
      const field = column.split(".").at(-1) ?? column;
      return row[field] === value;
    }),
  );
}

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const previous = transactionTail;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        const tx = {
          select: (fields?: unknown) => ({
            from: () => ({
              where: (condition: { conditions?: Array<{ column: string; value: unknown }> }) =>
                fields
                  ? { for: () => Promise.resolve([{ diamonds: lockedDiamonds }]) }
                  : { limit: () => Promise.resolve(matchingRows(condition)) },
            }),
          }),
          update: () => ({
            set: (values: { diamonds?: number }) => ({
              where: async () => {
                if (typeof values.diamonds === "number") lockedDiamonds = values.diamonds;
              },
            }),
          }),
          insert: () => ({
            values: (values: Record<string, unknown>) => ({
              returning: async () => {
                insertedValues.push(values);
                return [{ ...values }];
              },
            }),
          }),
        };
        return await fn(tx);
      } finally {
        release();
      }
    }),
    select: () => ({
      from: () => ({
        where: (condition: { conditions?: Array<{ column: string; value: unknown }> }) => ({
          limit: async () => matchingRows(condition),
        }),
      }),
    }),
  },
  dbConfigured: true,
}));

import {
  createTransaction,
  getTransactionByIdempotency,
  InsufficientCreditsError,
} from "./transactions";

beforeEach(async () => {
  await transactionTail;
  transactionTail = Promise.resolve();
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
    expect(insertedValues).toHaveLength(0);
  });

  it("carries required/available on the error", async () => {
    lockedDiamonds = 5;
    let caught: unknown;
    try {
      await createTransaction("u1", "deploy_production", -20, "deploy", undefined, undefined, {
        rejectIfNegative: true,
      });
    } catch (error) {
      caught = error;
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

  it("never blocks a credit/refund even with the guard on", async () => {
    const row = await createTransaction(
      "u1", "deploy_production_refund", 20, "refund", undefined, undefined,
      { rejectIfNegative: true },
    );
    expect(row.balance_after).toBe(20);
  });
});

describe("createTransaction durable idempotency (B1)", () => {
  it("charges concurrent wizard completions exactly once", async () => {
    lockedDiamonds = 50;
    const options = { idempotencyKey: "wizard:run-1" };
    const [first, second] = await Promise.all([
      createTransaction("u1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined, options),
      createTransaction("u1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined, options),
    ]);
    expect(first.id).toBe(second.id);
    expect(insertedValues).toHaveLength(1);
    expect(lockedDiamonds).toBe(39);
  });

  it("returns the existing entitlement on a later retry without another debit", async () => {
    lockedDiamonds = 22;
    const options = { idempotencyKey: "wizard:run-retry" };
    await createTransaction("u1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined, options);
    const retry = await createTransaction(
      "u1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined, options,
    );
    expect(retry.idempotency_key).toBe("wizard:run-retry");
    expect(insertedValues).toHaveLength(1);
    expect(lockedDiamonds).toBe(11);
    await expect(
      getTransactionByIdempotency("u1", "wizard_enrich", "wizard:run-retry"),
    ).resolves.toMatchObject({ idempotency_key: "wizard:run-retry" });
  });

  it("keeps different wizard runs independently billable", async () => {
    lockedDiamonds = 33;
    await createTransaction(
      "u1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined,
      { idempotencyKey: "wizard:run-a" },
    );
    await createTransaction(
      "u1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined,
      { idempotencyKey: "wizard:run-b" },
    );
    expect(insertedValues).toHaveLength(2);
    expect(lockedDiamonds).toBe(11);
  });
});
