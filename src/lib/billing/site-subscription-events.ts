import type { BillingMode } from "@/lib/db/schema";
import {
  getStripeBillingEvent,
  insertStripeBillingEvent,
  updateStripeBillingEvent,
} from "@/lib/db/services/site-subscriptions";
import { isUniqueViolation } from "./site-subscription-errors";

const LEASE_MS = 60_000;

export type EventClaim =
  | { action: "process" }
  | { action: "already_completed" }
  | { action: "in_flight" };

export async function claimStripeBillingEvent(input: {
  eventId: string;
  billingMode: BillingMode;
  eventType: string;
  now?: Date;
}): Promise<EventClaim> {
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);

  try {
    await insertStripeBillingEvent({
      eventId: input.eventId,
      billingMode: input.billingMode,
      eventType: input.eventType,
      leaseExpiresAt,
    });
    return { action: "process" };
  } catch (error) {
    if (!isUniqueViolation(error, "stripe_billing_events_event_id_unique")) {
      throw error;
    }
  }

  const existing = await getStripeBillingEvent(input.eventId);
  if (!existing) return { action: "process" };
  if (existing.status === "completed") return { action: "already_completed" };

  const leaseExpired =
    !existing.lease_expires_at || existing.lease_expires_at.getTime() <= now.getTime();
  if (existing.status === "failed" || leaseExpired) {
    await updateStripeBillingEvent(input.eventId, {
      status: "processing",
      lease_expires_at: leaseExpiresAt,
      last_error: null,
    });
    return { action: "process" };
  }

  return { action: "in_flight" };
}

export async function completeStripeBillingEvent(eventId: string): Promise<void> {
  await updateStripeBillingEvent(eventId, {
    status: "completed",
    completed_at: new Date(),
    last_error: null,
  });
}

export async function failStripeBillingEvent(eventId: string, error: string): Promise<void> {
  await updateStripeBillingEvent(eventId, {
    status: "failed",
    last_error: error.slice(0, 500),
    lease_expires_at: new Date(),
  });
}
