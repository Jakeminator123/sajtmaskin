import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secrets = vi.hoisted(() => ({
  testUserEmail: "",
  superadminEmail: "",
}));

vi.mock("@/lib/config", () => ({ SECRETS: secrets }));
vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: true }));

import { isAdminEmail, isTestUser } from "./users";

const originalAdminEmails = process.env.ADMIN_EMAILS;

beforeEach(() => {
  delete process.env.ADMIN_EMAILS;
  secrets.testUserEmail = "";
  secrets.superadminEmail = "";
});

afterEach(() => {
  if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdminEmails;
});

describe("privileged email classification", () => {
  it("normalizes ADMIN_EMAILS entries and candidates", () => {
    process.env.ADMIN_EMAILS = " first@example.test,Second@Example.test ";

    expect(isAdminEmail(" FIRST@example.test ")).toBe(true);
    expect(isAdminEmail("second@example.test")).toBe(true);
  });

  it("normalizes configured superadmin and test-user addresses", () => {
    secrets.superadminEmail = " SuperAdmin@Example.test ";
    secrets.testUserEmail = " TestUser@Example.test ";

    expect(isAdminEmail("superadmin@example.test")).toBe(true);
    expect(isAdminEmail(" TESTUSER@example.test ")).toBe(true);
  });

  it("keeps isTestUser on the same privileged-address predicate", () => {
    process.env.ADMIN_EMAILS = "admin@example.test";

    expect(isTestUser({ email: " ADMIN@example.test " } as Parameters<typeof isTestUser>[0])).toBe(true);
    expect(isTestUser({ email: "customer@example.test" } as Parameters<typeof isTestUser>[0])).toBe(false);
  });
});
