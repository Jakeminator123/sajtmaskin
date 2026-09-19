import { beforeEach, describe, expect, it, vi } from "vitest";

const getStripeBillingEvent = vi.hoisted(() => vi.fn());
const insertStripeBillingEvent = vi.hoisted(() => vi.fn());
const claimStripeBillingEventRow = vi.hoisted(() => vi.fn());
const finishStripeBillingEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getStripeBillingEvent,
  insertStripeBillingEvent,
  claimStripeBillingEventRow,
  finishStripeBillingEvent,
}));

const { claimStripeBillingEvent, completeStripeBillingEvent, failStripeBillingEvent } =
  await import("./site-subscription-events");

function duplicateKeyError() {
  return Object.assign(
    new Error("duplicate key value stripe_billing_events_event_id_unique"),
    { code: "23505" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  finishStripeBillingEvent.mockResolvedValue({});
});

describe("claimStripeBillingEvent", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("plockar om ett event när leasen gått ut", async () => {
    insertStripeBillingEvent.mockRejectedValue(duplicateKeyError());
    claimStripeBillingEventRow.mockResolvedValue({
      event_id: "evt_1",
      status: "processing",
    });

    const result = await claimStripeBillingEvent({
      eventId: "evt_1",
      billingMode: "test",
      eventType: "invoice.paid",
      now,
    });

    expect(result).toMatchObject({ action: "process" });
    expect(claimStripeBillingEventRow).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1", now }),
    );
    expect(getStripeBillingEvent).not.toHaveBeenCalled();
  });

  it("håller inne ett event med giltig lease", async () => {
    insertStripeBillingEvent.mockRejectedValue(duplicateKeyError());
    // Den atomiska claimen matchar inte en levande lease.
    claimStripeBillingEventRow.mockResolvedValue(null);
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
  });

  it("kvitterar ett redan färdigt event utan att processa om", async () => {
    insertStripeBillingEvent.mockRejectedValue(duplicateKeyError());
    claimStripeBillingEventRow.mockResolvedValue(null);
    getStripeBillingEvent.mockResolvedValue({ event_id: "evt_1", status: "completed" });

    await expect(
      claimStripeBillingEvent({
        eventId: "evt_1",
        billingMode: "test",
        eventType: "invoice.paid",
        now,
      }),
    ).resolves.toEqual({ action: "already_completed" });
  });

  // Två samtidiga Stripe-retries mot samma expired/failed rad: den atomiska
  // UPDATE:n ger raden till exakt en av dem. Tidigare läste båda raden, båda
  // beslutade i JS att leasen gått ut, och båda processade samma event.
  it("ger bara en av två samtidiga workers rätt att processa samma expired event", async () => {
    insertStripeBillingEvent.mockRejectedValue(duplicateKeyError());
    claimStripeBillingEventRow
      .mockResolvedValueOnce({ event_id: "evt_1", status: "processing" })
      .mockResolvedValueOnce(null);
    getStripeBillingEvent.mockResolvedValue({
      event_id: "evt_1",
      status: "processing",
      lease_expires_at: new Date("2026-09-15T12:00:30.000Z"),
    });

    const claimInput = {
      eventId: "evt_1",
      billingMode: "test" as const,
      eventType: "invoice.paid",
      now,
    };
    const [first, second] = await Promise.all([
      claimStripeBillingEvent(claimInput),
      claimStripeBillingEvent(claimInput),
    ]);

    const processing = [first, second].filter((claim) => claim.action === "process");
    expect(processing).toHaveLength(1);
    expect([first, second].filter((claim) => claim.action === "in_flight")).toHaveLength(1);
  });

  it("ger varje anspråk en egen lease-token", async () => {
    insertStripeBillingEvent.mockResolvedValue({ event_id: "evt_1" });

    const first = await claimStripeBillingEvent({
      eventId: "evt_1",
      billingMode: "test",
      eventType: "invoice.paid",
      now,
    });
    const second = await claimStripeBillingEvent({
      eventId: "evt_2",
      billingMode: "test",
      eventType: "invoice.paid",
      now,
    });

    expect(first).toMatchObject({ action: "process" });
    expect(second).toMatchObject({ action: "process" });
    const firstOwner = first.action === "process" ? first.leaseOwner : null;
    const secondOwner = second.action === "process" ? second.leaseOwner : null;
    expect(firstOwner).toBeTruthy();
    expect(firstOwner).not.toBe(secondOwner);
    expect(insertStripeBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ leaseOwner: firstOwner }),
    );
  });
});

describe("fencade avslut", () => {
  it("markerar failed och släpper leasen med sin egen token", async () => {
    await failStripeBillingEvent("evt_1", "owner-a", "provider_timeout");

    expect(finishStripeBillingEvent).toHaveBeenCalledWith(
      "evt_1",
      "owner-a",
      expect.objectContaining({
        status: "failed",
        last_error: "provider_timeout",
        lease_expires_at: expect.any(Date),
      }),
    );
  });

  it("kvitterar completed med sin egen token", async () => {
    await completeStripeBillingEvent("evt_1", "owner-a");

    expect(finishStripeBillingEvent).toHaveBeenCalledWith(
      "evt_1",
      "owner-a",
      expect.objectContaining({ status: "completed", completed_at: expect.any(Date) }),
    );
  });

  // Worker A:s lease gick ut, B tog över. A:s sena complete/fail träffar 0 rader
  // eftersom WHERE också kräver lease_owner — B:s utfall står kvar.
  it("låter inte en stale worker skriva över efterträdarens utfall", async () => {
    finishStripeBillingEvent.mockResolvedValue(null);

    await completeStripeBillingEvent("evt_1", "owner-a-stale");
    await failStripeBillingEvent("evt_1", "owner-a-stale", "too_late");

    expect(finishStripeBillingEvent).toHaveBeenNthCalledWith(
      1,
      "evt_1",
      "owner-a-stale",
      expect.objectContaining({ status: "completed" }),
    );
    expect(finishStripeBillingEvent).toHaveBeenNthCalledWith(
      2,
      "evt_1",
      "owner-a-stale",
      expect.objectContaining({ status: "failed" }),
    );
    // Båda anropen returnerade null = 0 rader skrivna.
    await expect(finishStripeBillingEvent.mock.results[0]!.value).resolves.toBeNull();
    await expect(finishStripeBillingEvent.mock.results[1]!.value).resolves.toBeNull();
  });
});
