/**
 * `isAdminEmail` is the predicate the public-signup block in
 * `/api/auth/register` is keyed on, so it must fold both sides of the
 * comparison exactly like `isAdminEmailEdge` does. A privileged address that
 * only the edge variant recognises would be registerable by anyone.
 *
 * `SECRETS.*` reads the validated env object captured at import, so the
 * privileged addresses are mocked rather than poked into `process.env`;
 * `ADMIN_EMAILS` is read from `process.env` directly and is set that way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secrets = vi.hoisted(() => ({ testUserEmail: "", superadminEmail: "" }));

vi.mock("@/lib/config", () => ({ SECRETS: secrets }));

const { isAdminEmail } = await import("@/lib/db/services/users");
const { isAdminEmailEdge } = await import("@/lib/auth/edge-auth");

const ORIGINAL = {
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL,
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL,
};

function restore(key: keyof typeof ORIGINAL) {
  const value = ORIGINAL[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Keep the edge variant (raw `process.env`) and `SECRETS` on one truth. */
function setPrivilegedEnv(values: {
  adminEmails?: string;
  superadminEmail?: string;
  testUserEmail?: string;
}) {
  if (values.adminEmails !== undefined) process.env.ADMIN_EMAILS = values.adminEmails;
  if (values.superadminEmail !== undefined) {
    process.env.SUPERADMIN_EMAIL = values.superadminEmail;
    secrets.superadminEmail = values.superadminEmail;
  }
  if (values.testUserEmail !== undefined) {
    process.env.TEST_USER_EMAIL = values.testUserEmail;
    secrets.testUserEmail = values.testUserEmail;
  }
}

beforeEach(() => {
  delete process.env.ADMIN_EMAILS;
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.TEST_USER_EMAIL;
  secrets.testUserEmail = "";
  secrets.superadminEmail = "";
});

afterEach(() => {
  restore("ADMIN_EMAILS");
  restore("SUPERADMIN_EMAIL");
  restore("TEST_USER_EMAIL");
});

describe("isAdminEmail", () => {
  it("matches a mixed-case, padded SUPERADMIN_EMAIL", () => {
    setPrivilegedEnv({ superadminEmail: "  Chef@Sajtmaskin.SE " });

    expect(isAdminEmail("chef@sajtmaskin.se")).toBe(true);
    expect(isAdminEmail("  CHEF@sajtmaskin.se  ")).toBe(true);
  });

  it("matches a mixed-case TEST_USER_EMAIL", () => {
    setPrivilegedEnv({ testUserEmail: "Test.User@Sajtmaskin.se" });

    expect(isAdminEmail("test.user@sajtmaskin.se")).toBe(true);
  });

  it("agrees with the edge variant on the same configuration", () => {
    setPrivilegedEnv({
      adminEmails: "a@x.se, B@X.se",
      superadminEmail: " Super@X.se",
      testUserEmail: "Test@X.se",
    });

    for (const candidate of [
      "a@x.se",
      "b@x.se",
      "B@X.se",
      "super@x.se",
      "test@x.se",
      "nobody@x.se",
    ]) {
      expect(isAdminEmail(candidate)).toBe(isAdminEmailEdge(candidate));
    }
  });

  it("does not treat an unset privileged env as a wildcard", () => {
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail("   ")).toBe(false);
    expect(isAdminEmail("someone@x.se")).toBe(false);
  });
});
