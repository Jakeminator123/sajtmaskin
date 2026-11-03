import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  row: { email_verified: false, password_hash: "attacker-hash", verification_token: "", verification_token_expires: new Date() },
  queries: [] as { sql: string; params: unknown[] }[],
}));
vi.mock("@/lib/config", () => ({ SECRETS: { testUserEmail: "", superadminEmail: "" } }));
vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: (condition: SQL) => ({
    returning: async () => {
      const query = new PgDialect().sqlToQuery(condition);
      state.queries.push(query);
      const [verified, hashedToken, rawToken, now] = query.params;
      if (state.row.email_verified !== verified ||
        ![hashedToken, rawToken].includes(state.row.verification_token) ||
        state.row.verification_token_expires <= new Date(now as string)) return [];
      Object.assign(state.row, values);
      return [{ id: "owner" }];
    },
  }) }) }),
} }));
import { verifyEmailWithPassword } from "./users";

describe("atomic email verification", () => {
  beforeEach(() => {
    state.queries = [];
    state.row = { email_verified: false, password_hash: "attacker-hash", verification_token: createHash("sha256").update("email-token").digest("hex"), verification_token_expires: new Date(Date.now() + 60_000) };
  });
  it("lets only one racing request replace the password and consume the token", async () => {
    const results = await Promise.all([verifyEmailWithPassword("email-token", "owner-hash"), verifyEmailWithPassword("email-token", "raced-hash")]);
    expect(results).toEqual([true, false]);
    expect(state.row).toMatchObject({ password_hash: "owner-hash", email_verified: true, verification_token: null, verification_token_expires: null });
    expect(state.queries[0].sql).toContain('"users"."email_verified" =');
    expect(state.queries[0].sql).toContain('"users"."verification_token_expires" >');
  });
  it.each(["expired", "replaced", "already-verified"])("refuses %s proof without changing the stored secret", async (mode) => {
    if (mode === "expired") state.row.verification_token_expires = new Date(0);
    if (mode === "replaced") state.row.verification_token = "replacement";
    if (mode === "already-verified") state.row.email_verified = true;
    expect(await verifyEmailWithPassword("email-token", "new-hash")).toBe(false);
    expect(state.row.password_hash).toBe("attacker-hash");
  });
  it("continues to accept an outstanding legacy raw token once", async () => {
    state.row.verification_token = "email-token";
    expect(await verifyEmailWithPassword("email-token", "owner-hash")).toBe(true);
    expect(await verifyEmailWithPassword("email-token", "another-hash")).toBe(false);
  });
});
