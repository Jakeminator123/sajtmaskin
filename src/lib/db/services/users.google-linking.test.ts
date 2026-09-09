import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";

type StoredUser = Record<string, unknown> & {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified: boolean;
  google_id: string | null;
};

const persistence = vi.hoisted(() => ({
  rows: [] as StoredUser[],
  transaction: vi.fn(),
  execute: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/config", () => ({
  SECRETS: {
    jwtSecret: "google-linking-test-secret",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
    superadminEmail: "",
    superadminPassword: "",
    testUserEmail: "",
    testUserPassword: "",
  },
  URLS: {
    googleCallbackUrl: "https://example.test/api/auth/google/callback",
  },
  IS_PRODUCTION: false,
}));

vi.mock("@/lib/db/client", () => {
  const read = () => ({
    from: () => ({
      where: () => ({
        limit: async (limit: number) => persistence.rows.slice(0, limit),
        for: async () => [...persistence.rows],
      }),
    }),
  });

  const update = () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        persistence.update(values);
        const target = persistence.rows[0];
        if (target) Object.assign(target, values);
        return {
          returning: async () => (target ? [target] : []),
          then: (resolve: (value?: unknown) => unknown) => Promise.resolve().then(resolve),
        };
      },
    }),
  });

  const insert = () => ({
    values: (values: Record<string, unknown>) => ({
      returning: async () => {
        const row = {
          password_hash: null,
          google_id: null,
          ...values,
        } as StoredUser;
        persistence.rows.push(row);
        return [row];
      },
    }),
  });

  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
    persistence.transaction();
    return callback({
      execute: persistence.execute,
      select: read,
      update,
      insert,
    });
  });

  return {
    db: {
      select: read,
      update,
      insert,
      transaction,
    },
    dbConfigured: true,
  };
});

import { db } from "@/lib/db/client";
import { hashPassword, loginUser } from "@/lib/auth/auth";
import { createGoogleUser } from "./users";

function storedEmailUser(password: string, emailVerified: boolean): StoredUser {
  const now = new Date();
  return {
    id: "user_email",
    email: "owner@example.test",
    password_hash: hashPassword(password),
    name: "Email user",
    image: null,
    provider: "email",
    google_id: null,
    github_id: null,
    github_username: null,
    github_token: null,
    diamonds: 0,
    free_generation_available: true,
    free_generation_claimed_version_id: null,
    free_generation_claimed_at: null,
    tier: null,
    email_verified: emailVerified,
    verification_token: "pending-token",
    verification_token_expires: new Date(now.getTime() + 60_000),
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
}

describe("createGoogleUser account linking", () => {
  beforeEach(() => {
    persistence.rows = [];
    vi.clearAllMocks();
  });

  it("removes an unverified preregistration password before Google verifies the row", async () => {
    const preregisteredPassword = "attacker-chosen-password";
    persistence.rows = [storedEmailUser(preregisteredPassword, false)];

    const beforeLink = await loginUser("owner@example.test", preregisteredPassword);
    expect(beforeLink).toMatchObject({ error: expect.stringContaining("bekräfta din e-post") });

    const linked = await createGoogleUser(
      "google-owner-1",
      " Owner@Example.Test ",
      "Actual owner",
      "https://example.test/avatar.png",
    );

    expect(linked).toMatchObject({
      email: "owner@example.test",
      google_id: "google-owner-1",
      provider: "google",
      email_verified: true,
      password_hash: null,
      verification_token: null,
      verification_token_expires: null,
    });
    expect(persistence.execute).toHaveBeenCalledTimes(2);

    const afterLink = await loginUser("owner@example.test", preregisteredPassword);
    expect(afterLink).toEqual({ error: "Detta konto använder Google-inloggning" });
  });

  it("preserves password login when the existing email account was already verified", async () => {
    const legitimatePassword = "owner-verified-password";
    persistence.rows = [storedEmailUser(legitimatePassword, true)];
    const originalHash = persistence.rows[0].password_hash;

    const linked = await createGoogleUser("google-owner-2", "owner@example.test", "Verified owner");

    expect(linked.password_hash).toBe(originalHash);
    const passwordLogin = await loginUser("owner@example.test", legitimatePassword);
    expect(passwordLogin).toMatchObject({
      user: { id: "user_email", google_id: "google-owner-2" },
      token: expect.any(String),
    });
  });

  it("creates a verified passwordless account for a new Google identity", async () => {
    const created = await createGoogleUser(
      "google-owner-new",
      " New.Owner@Example.Test ",
      "New owner",
    );

    expect(created).toMatchObject({
      email: "new.owner@example.test",
      google_id: "google-owner-new",
      provider: "google",
      email_verified: true,
      password_hash: null,
    });
    expect(persistence.rows).toHaveLength(1);
  });

  it("refuses to merge separate Google-subject and email rows", async () => {
    const googleRow = storedEmailUser("old-password", true);
    googleRow.id = "google_row";
    googleRow.email = "old-address@example.test";
    googleRow.google_id = "google-owner-3";
    const emailRow = storedEmailUser("email-password", true);
    persistence.rows = [googleRow, emailRow];

    await expect(
      createGoogleUser("google-owner-3", "owner@example.test", "Conflicting owner"),
    ).rejects.toThrow("Google identity conflicts with an existing account");
    expect(persistence.update).not.toHaveBeenCalled();
  });

  it("refuses to replace a different Google subject already linked to the email", async () => {
    const existing = storedEmailUser("owner-password", true);
    existing.google_id = "google-original";
    persistence.rows = [existing];

    await expect(
      createGoogleUser("google-replacement", "owner@example.test", "Replacement"),
    ).rejects.toThrow("Google identity conflicts with an existing account");
    expect(persistence.update).not.toHaveBeenCalled();
  });

  it("retries after a concurrent email insert wins the unique constraint", async () => {
    const transaction = vi.mocked(db.transaction);
    transaction.mockRejectedValueOnce(
      new DrizzleQueryError(
        'insert into "users" ...',
        [],
        Object.assign(new Error("duplicate email"), { code: "23505" }),
      ),
    );
    persistence.rows = [storedEmailUser("raced-password", false)];

    const linked = await createGoogleUser("google-owner-4", "owner@example.test", "Raced owner");

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(linked.password_hash).toBeNull();
  });

  it("does not retry a wrapped non-unique database failure", async () => {
    const transaction = vi.mocked(db.transaction);
    transaction.mockRejectedValueOnce(
      new DrizzleQueryError(
        'insert into "users" ...',
        [],
        Object.assign(new Error("connection lost"), { code: "08006" }),
      ),
    );

    await expect(
      createGoogleUser("google-owner-5", "owner@example.test", "Failed owner"),
    ).rejects.toThrow("Failed query");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
