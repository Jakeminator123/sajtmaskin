import { nanoid } from "nanoid";
import type { BillingMode } from "@/lib/db/schema";
import {
  claimStripeBillingEventRow,
  finishStripeBillingEvent,
  getStripeBillingEvent,
  insertStripeBillingEvent,
} from "@/lib/db/services/site-subscriptions";
import { isUniqueViolation } from "./site-subscription-errors";

const LEASE_MS = 60_000;

export type EventClaim =
  | { action: "process"; leaseOwner: string }
  | { action: "already_completed" }
  | { action: "in_flight" };

/**
 * Anspråk på ett Stripe-event. Anropet äger eventet först när det får tillbaka
 * `process` med en `leaseOwner` — den token som `complete`/`fail` fencas mot.
 *
 * Övertagandet av ett failed/expired event går genom en atomisk conditional
 * UPDATE. En läs-och-besluta-i-JS-variant lät två samtidiga retries båda ta
 * samma rad och processa samma finansiella event.
 */
export async function claimStripeBillingEvent(input: {
  eventId: string;
  billingMode: BillingMode;
  eventType: string;
  now?: Date;
}): Promise<EventClaim> {
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const leaseOwner = nanoid();

  // Två varv: raden kan hinna försvinna mellan en krockad insert och
  // övertagandet, och då ska vi äga den genom en ny insert i stället för att
  // lämna eventet obehandlat.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await insertStripeBillingEvent({
        eventId: input.eventId,
        billingMode: input.billingMode,
        eventType: input.eventType,
        leaseOwner,
        leaseExpiresAt,
      });
      return { action: "process", leaseOwner };
    } catch (error) {
      if (!isUniqueViolation(error, "stripe_billing_events_event_id_unique")) {
        throw error;
      }
    }

    const claimed = await claimStripeBillingEventRow({
      eventId: input.eventId,
      now,
      leaseOwner,
      leaseExpiresAt,
    });
    if (claimed) return { action: "process", leaseOwner };

    const existing = await getStripeBillingEvent(input.eventId);
    if (existing?.status === "completed") return { action: "already_completed" };
    if (existing) return { action: "in_flight" };
  }

  return { action: "in_flight" };
}

export async function completeStripeBillingEvent(
  eventId: string,
  leaseOwner: string,
): Promise<void> {
  await finishStripeBillingEvent(eventId, leaseOwner, {
    status: "completed",
    completed_at: new Date(),
    last_error: null,
  });
}

export async function failStripeBillingEvent(
  eventId: string,
  leaseOwner: string,
  error: string,
): Promise<void> {
  await finishStripeBillingEvent(eventId, leaseOwner, {
    status: "failed",
    last_error: error.slice(0, 500),
    lease_expires_at: new Date(),
  });
}
