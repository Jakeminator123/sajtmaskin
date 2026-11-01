import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  inserts: [] as { table: unknown; value: Record<string, unknown> }[],
  deleted: false,
}));
const createTransaction = vi.hoisted(() => vi.fn());
const assertNoProtectedBillingRows = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => {
  const select = vi.fn((_fields?: Record<string, unknown>) => {
    const query = {
      from: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      offset: () => query,
      for: () => query,
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(state.rows.shift() ?? []).then(resolve),
    };
    return query;
  });
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn(async (value: Record<string, unknown>) => {
      state.inserts.push({ table, value });
    }),
  }));
  const remove = vi.fn(() => ({
    where: vi.fn(async () => {
      state.deleted = true;
    }),
  }));
  const tx = { select, insert, delete: remove, execute: vi.fn() };
  return { ...tx, transaction: vi.fn(async (work: (value: typeof tx) => unknown) => work(tx)) };
});
vi.mock("@/lib/db/client", () => ({ db }));
vi.mock("@/lib/auth/auth", () => ({
  hashPassword: (password: string) => `salt:${scryptSync(password, "salt", 64).toString("hex")}`,
}));
vi.mock("@/lib/auth/edge-auth", () => ({
  isAdminEmailEdge: (email: string) => email === "admin@example.test",
}));
vi.mock("./shared", () => ({ TEST_USER_EMAIL: "system@example.test" }));
vi.mock("./transactions", () => ({ createTransaction }));
vi.mock("@/lib/db/billing-retention-guard", () => ({ assertNoProtectedBillingRows }));
import { createAdminUser, deleteAdminUser, grantAdminCredits, listAdminUsers } from "./admin-users";
import { users, transactions } from "@/lib/db/schema";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.inserts = [];
  state.deleted = false;
  createTransaction.mockResolvedValue({ amount: 100, balance_after: 100 });
});

describe("admin user management", () => {
  it("creates a verified account with an auditable initial balance and no extra free generation", async () => {
    await createAdminUser(
      { email: " NEW@Example.test ", password: "test-secret", name: "New", credits: 100 },
      "operator",
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(state.inserts[0].table).toBe(users);
    expect(state.inserts[0].value).toMatchObject({
      email: "new@example.test",
      email_verified: true,
      diamonds: 100,
      free_generation_available: false,
    });
    expect(state.inserts[0].value.password_hash).not.toBe("test-secret");
    expect(state.inserts[1].table).toBe(transactions);
    expect(state.inserts[1].value).toMatchObject({
      user_id: state.inserts[0].value.id,
      amount: 100,
      balance_after: 100,
      type: "admin_credit",
    });
    expect(state.inserts[1].value.description).toContain("operator");
  });

  it.each(["admin@example.test", "campaign.invalid"])(
    "rejects reserved identity %s",
    async (address) => {
      const email = address.includes("@") ? address : `person@${address}`;
      await expect(
        createAdminUser({ email, password: "test-secret", credits: 100 }, "operator"),
      ).rejects.toThrow("reserverad");
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it("keeps the registration password minimum and refuses negative credits", async () => {
    await expect(
      createAdminUser({ email: "new@example.test", password: "short", credits: 100 }, "operator"),
    ).rejects.toThrow();
    await expect(
      createAdminUser(
        { email: "new@example.test", password: "test-secret", credits: -1 },
        "operator",
      ),
    ).rejects.toThrow();
    expect(state.inserts).toEqual([]);
  });

  it("uses the existing locked, idempotent credit ledger for grants", async () => {
    state.rows = [[{ id: "person" }]];
    const requestId = "b7b66f8a-bc64-43d3-bcca-f819a911921a";
    await grantAdminCredits({ userId: "person", amount: 100, requestId }, "operator");
    expect(createTransaction).toHaveBeenCalledWith(
      "person",
      "admin_credit",
      100,
      expect.stringContaining("operator"),
      undefined,
      undefined,
      { idempotencyKey: `admin-grant:${requestId}` },
    );
  });

  it.each([
    [{ id: "operator", email: "person@example.test" }, "eget konto"],
    [{ id: "person", email: "admin@example.test" }, "Administratör"],
    [{ id: "person", email: "system@example.test" }, "systemtestkontot"],
  ])("protects privileged and acting accounts", async (user, message) => {
    state.rows = [[user]];
    await expect(
      deleteAdminUser({ userId: user.id, confirmEmail: user.email }, "operator"),
    ).rejects.toThrow(message);
    expect(state.deleted).toBe(false);
  });

  it.each([
    [[[{ id: "person", email: "person@example.test" }], [{ id: "project" }]], "projekt"],
    [
      [[{ id: "person", email: "person@example.test" }], [], [{ id: "payment" }]],
      "betalningshistorik",
    ],
  ])("does not delete project or paying owners", async (rows, message) => {
    state.rows = rows;
    await expect(
      deleteAdminUser({ userId: "person", confirmEmail: "person@example.test" }, "operator"),
    ).rejects.toThrow(message);
    expect(state.deleted).toBe(false);
  });

  it("checks the exact confirmed identity on the server", async () => {
    state.rows = [[{ id: "person", email: "person@example.test" }]];
    await expect(
      deleteAdminUser({ userId: "person", confirmEmail: "other@example.test" }, "operator"),
    ).rejects.toThrow("matchar inte");
    expect(state.deleted).toBe(false);
  });

  it("does not silently reuse a previous grant for a changed amount", async () => {
    state.rows = [[{ id: "person" }]];
    createTransaction.mockResolvedValueOnce({ amount: 50, balance_after: 50 });
    await expect(
      grantAdminCredits(
        { userId: "person", amount: 100, requestId: "b7b66f8a-bc64-43d3-bcca-f819a911921a" },
        "operator",
      ),
    ).rejects.toThrow("annat belopp");
  });

  it("deletes an unused account after the billing retention guard", async () => {
    state.rows = [[{ id: "person", email: "person@example.test" }], [], []];
    await deleteAdminUser({ userId: "person", confirmEmail: "person@example.test" }, "operator");
    expect(assertNoProtectedBillingRows).toHaveBeenCalledWith("Raderingen", {
      kind: "userIds",
      userIds: ["person"],
    });
    expect(state.deleted).toBe(true);
  });

  it("projects only public account fields and paginates", async () => {
    state.rows = [
      Array.from({ length: 26 }, (_, id) => ({
        id: String(id),
        email: `p${id}@example.test`,
        createdAt: new Date(),
        lastLoginAt: null,
      })),
    ];
    const result = await listAdminUsers("", 0, "operator");
    expect(result.users).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    for (const key of ["password_hash", "github_token", "verification_token"]) {
      expect(db.select.mock.calls[0][0]).not.toHaveProperty(key);
    }
  });
});
