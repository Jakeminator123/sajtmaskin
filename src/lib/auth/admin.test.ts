/**
 * `getAdminUserForPage` — the gate the `/admin` layout renders from.
 *
 * The important distinction it locks: a *denied* session redirects, but a
 * session that could not be CHECKED (database down) must not be reported as
 * denied. The admin panel is the tool you open during an outage, so silently
 * bouncing the operator to the marketing page is the worst possible behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserFromCookies = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserFromCookies,
}));

const { getAdminUserForPage } = await import("@/lib/auth/admin");

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_EMAILS = "chef@sajtmaskin.se";
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  }
});

describe("getAdminUserForPage", () => {
  it("accepts an admin session", async () => {
    getCurrentUserFromCookies.mockResolvedValue({ id: "1", email: "chef@sajtmaskin.se" });

    const access = await getAdminUserForPage();

    expect(access.ok).toBe(true);
    if (access.ok) expect(access.user.email).toBe("chef@sajtmaskin.se");
  });

  it("denies a signed-in non-admin", async () => {
    getCurrentUserFromCookies.mockResolvedValue({ id: "2", email: "kund@example.com" });

    const access = await getAdminUserForPage();

    expect(access).toEqual({ ok: false, reason: "denied" });
  });

  it("denies an anonymous visitor", async () => {
    getCurrentUserFromCookies.mockResolvedValue(null);

    const access = await getAdminUserForPage();

    expect(access).toEqual({ ok: false, reason: "denied" });
  });

  it("reports 'unavailable' — not 'denied' — when the lookup throws", async () => {
    getCurrentUserFromCookies.mockRejectedValue(new Error("connection refused"));

    const access = await getAdminUserForPage();

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.reason).toBe("unavailable");
      if (access.reason === "unavailable") {
        expect(access.message).toContain("connection refused");
      }
    }
  });
});
