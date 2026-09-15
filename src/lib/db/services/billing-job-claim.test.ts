import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {},
  dbConfigured: false,
}));

const { isBillingJobClaimable } = await import("./site-subscriptions");

const now = new Date("2026-09-15T12:00:00.000Z");

describe("isBillingJobClaimable", () => {
  it("släpper in pending och utgången running-lease", () => {
    expect(isBillingJobClaimable({ status: "pending", leaseExpiresAt: null, now })).toBe(true);
    expect(
      isBillingJobClaimable({
        status: "running",
        leaseExpiresAt: new Date("2026-09-15T11:59:00.000Z"),
        now,
      }),
    ).toBe(true);
  });

  it("stänger avslutade jobb och en giltig running-lease", () => {
    expect(
      isBillingJobClaimable({
        status: "running",
        leaseExpiresAt: new Date("2026-09-15T12:01:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      isBillingJobClaimable({
        status: "done",
        leaseExpiresAt: new Date("2026-09-15T11:00:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      isBillingJobClaimable({
        status: "failed",
        leaseExpiresAt: new Date("2026-09-15T11:00:00.000Z"),
        now,
      }),
    ).toBe(false);
  });
});
