import { beforeEach, describe, expect, it, vi } from "vitest";

const getStripeBillingEvent = vi.hoisted(() => vi.fn());
const insertStripeBillingEvent = vi.hoisted(() => vi.fn());
const updateStripeBillingEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getStripeBillingEvent,
  insertStripeBillingEvent,
  updateStripeBillingEvent,
}));

const { claimStripeBillingEvent, failStripeBillingEvent } = await import(
  "./site-subscription-events"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimStripeBillingEvent", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("plockar om ett event när leasen gått ut", async () => {
    insertStripeBillingEvent.mockRejectedValue(
      Object.assign(new Error("duplicate key value stripe_billing_events_event_id_unique"), {
        code: "23505",
      }),
    );
    getStripeBillingEvent.mockResolvedValue({
      event_id: "evt_1",
      status: "processing",
      lease_expires_at: new Date("2026-09-15T11:59:00.000Z"),
    });

    const result = await claimStripeBillingEvent({
      eventId: "evt_1",
      billingMode: "test",
      eventType: "invoice.paid",
      now,
    });

    expect(result).toEqual({ action: "process" });
    expect(updateStripeBillingEvent).toHaveBeenCalledWith(
      "evt_1",
      expect.objectContaining({ status: "processing" }),
    );
  });

  it("håller inne ett event med giltig lease", async () => {
    insertStripeBillingEvent.mockRejectedValue(
      Object.assign(new Error("duplicate key value stripe_billing_events_event_id_unique"), {
        code: "23505",
      }),
    );
    getStripeBillingEvent.mockResolvedValue({
      event_id: "evt_1",
      status: "processing",
      lease_expires_at: new Date("2026-09-15T12:01:00.000Z"),
    });

    await expect(
      claimStripeBillingEvent({
        eventId: "evt_1",
        billingMode: "test",
        eventType: "invoice.paid",
        now,
      }),
    ).resolves.toEqual({ action: "in_flight" });
    expect(updateStripeBillingEvent).not.toHaveBeenCalled();
  });
});

describe("failStripeBillingEvent", () => {
  it("markerar failed och släpper leasen", async () => {
    updateStripeBillingEvent.mockResolvedValue({});

    await failStripeBillingEvent("evt_1", "provider_timeout");

    expect(updateStripeBillingEvent).toHaveBeenCalledWith(
      "evt_1",
      expect.objectContaining({
        status: "failed",
        last_error: "provider_timeout",
        lease_expires_at: expect.any(Date),
      }),
    );
  });
});
