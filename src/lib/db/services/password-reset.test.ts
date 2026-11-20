/**
 * Livscykeltest för "Glömt lösenord?"-token mot en minnesbaserad fejk av
 * Drizzle-kedjan. Operatorerna (eq/gt/isNull/and) mappas till predikat så att
 * testet faktiskt utvärderar de villkor tjänsten bygger: utgång, enkel
 * användning, ersättning och cooldown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Col = { t: "tokens" | "users"; k: string };
type Row = Record<string, unknown>;
type Pred = (row: Row) => boolean;

const store = vi.hoisted(() => ({
  tokens: [] as Record<string, unknown>[],
  users: [] as Record<string, unknown>[],
}));

vi.mock("drizzle-orm", () => ({
  eq: (c: { k: string }, v: unknown) => (row: Record<string, unknown>) => row[c.k] === v,
  gt: (c: { k: string }, v: Date) => (row: Record<string, unknown>) => {
    const value = row[c.k];
    return value instanceof Date && value.getTime() > v.getTime();
  },
  isNull: (c: { k: string }) => (row: Record<string, unknown>) => row[c.k] == null,
  and:
    (...preds: Array<(row: Record<string, unknown>) => boolean>) =>
    (row: Record<string, unknown>) =>
      preds.every((p) => p(row)),
}));

vi.mock("@/lib/db/schema", () => {
  const tokens = (k: string) => ({ t: "tokens", k });
  return {
    passwordResetTokens: {
      _t: "tokens",
      id: tokens("id"),
      userId: tokens("userId"),
      tokenHash: tokens("tokenHash"),
      expiresAt: tokens("expiresAt"),
      usedAt: tokens("usedAt"),
      createdAt: tokens("createdAt"),
    },
    users: { _t: "users", id: { t: "users", k: "id" } },
  };
});

vi.mock("@/lib/db/services/shared", () => ({ assertDbConfigured: () => {} }));

vi.mock("@/lib/db/client", () => {
  const rowsOf = (table: { _t: string }) => (table._t === "tokens" ? store.tokens : store.users);
  const project = (shape: Record<string, Col> | undefined, row: Row) =>
    shape ? Object.fromEntries(Object.entries(shape).map(([alias, c]) => [alias, row[c.k]])) : row;
  const fake = {
    select: (shape?: Record<string, Col>) => ({
      from: (table: { _t: string }) => ({
        where: (pred: Pred) => ({
          limit: async (n: number) =>
            rowsOf(table)
              .filter(pred)
              .slice(0, n)
              .map((row) => project(shape, row)),
        }),
      }),
    }),
    delete: (table: { _t: string }) => ({
      where: async (pred: Pred) => {
        const rows = rowsOf(table);
        for (let i = rows.length - 1; i >= 0; i -= 1) if (pred(rows[i])) rows.splice(i, 1);
      },
    }),
    insert: (table: { _t: string }) => ({
      values: async (values: Row) => {
        rowsOf(table).push({ usedAt: null, ...values });
      },
    }),
    update: (table: { _t: string }) => ({
      set: (values: Row) => ({
        where: (pred: Pred) => {
          const matched = rowsOf(table).filter(pred);
          for (const row of matched) Object.assign(row, values);
          return Object.assign(Promise.resolve(), {
            returning: async (shape?: Record<string, Col>) =>
              matched.map((row) => project(shape, row)),
          });
        },
      }),
    }),
    transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn(fake),
  };
  return { db: fake };
});

import {
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  consumePasswordResetToken,
  createPasswordResetToken,
  findUsablePasswordResetToken,
  hashPasswordResetToken,
  issuePasswordResetToken,
} from "./password-reset";

const T0 = new Date("2026-11-11T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("password reset token lifecycle", () => {
  beforeEach(() => {
    store.tokens.length = 0;
    store.users.length = 0;
    store.users.push({
      id: "user_1",
      email: "owner@example.test",
      password_hash: "old-hash",
      email_verified: false,
      verification_token: "open-verification",
    });
  });

  it("issues a random token and stores only its hash with a one-hour expiry", async () => {
    const first = issuePasswordResetToken(T0);
    const second = issuePasswordResetToken(T0);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashPasswordResetToken(first.token));
    expect(first.expiresAt.getTime() - T0.getTime()).toBe(PASSWORD_RESET_TOKEN_TTL_MS);

    const token = await createPasswordResetToken("user_1", T0);
    expect(token).toBeTruthy();
    expect(store.tokens).toHaveLength(1);
    expect(store.tokens[0].tokenHash).toBe(hashPasswordResetToken(token!));
    expect(JSON.stringify(store.tokens)).not.toContain(token!);
  });

  it("finds a fresh token and rejects it after expiry", async () => {
    const token = (await createPasswordResetToken("user_1", T0))!;
    expect(await findUsablePasswordResetToken(token, at(1_000))).toMatchObject({ userId: "user_1" });
    expect(await findUsablePasswordResetToken(token, at(PASSWORD_RESET_TOKEN_TTL_MS + 1))).toBeNull();
    expect(await consumePasswordResetToken(token, "new-hash", at(PASSWORD_RESET_TOKEN_TTL_MS + 1))).toBeNull();
    expect(store.users[0].password_hash).toBe("old-hash");
  });

  it("consumes once: replaces the password, verifies the address and removes the link", async () => {
    const token = (await createPasswordResetToken("user_1", T0))!;
    expect(await consumePasswordResetToken(token, "new-hash", at(5_000))).toBe("user_1");
    expect(store.users[0]).toMatchObject({
      password_hash: "new-hash",
      email_verified: true,
      verification_token: null,
    });
    expect(store.tokens).toHaveLength(0);

    expect(await consumePasswordResetToken(token, "attacker-hash", at(6_000))).toBeNull();
    expect(await findUsablePasswordResetToken(token, at(6_000))).toBeNull();
    expect(store.users[0].password_hash).toBe("new-hash");
  });

  it("does not issue a second link inside the cooldown", async () => {
    expect(await createPasswordResetToken("user_1", T0)).toBeTruthy();
    expect(await createPasswordResetToken("user_1", at(PASSWORD_RESET_RESEND_COOLDOWN_MS - 1))).toBeNull();
    expect(store.tokens).toHaveLength(1);
  });

  it("a newer link replaces the older one", async () => {
    const older = (await createPasswordResetToken("user_1", T0))!;
    const newer = (await createPasswordResetToken("user_1", at(PASSWORD_RESET_RESEND_COOLDOWN_MS + 1)))!;
    expect(store.tokens).toHaveLength(1);
    expect(await findUsablePasswordResetToken(older, at(PASSWORD_RESET_RESEND_COOLDOWN_MS + 2))).toBeNull();
    expect(await consumePasswordResetToken(newer, "new-hash", at(PASSWORD_RESET_RESEND_COOLDOWN_MS + 2))).toBe("user_1");
  });

  it("rejects unknown, empty and oversized tokens", async () => {
    await createPasswordResetToken("user_1", T0);
    expect(await findUsablePasswordResetToken("unknown", at(1))).toBeNull();
    expect(await findUsablePasswordResetToken("", at(1))).toBeNull();
    expect(await consumePasswordResetToken("x".repeat(257), "h", at(1))).toBeNull();
    expect(store.users[0].password_hash).toBe("old-hash");
  });
});
