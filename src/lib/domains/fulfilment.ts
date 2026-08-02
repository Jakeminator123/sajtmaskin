/**
 * Domain order fulfilment — the irreversible half, and its compensation.
 *
 * Ordering is chosen so every failure mode has a defined outcome:
 *
 *   1. **Claim** (`paid` → `registering`) before anything else. Exactly one
 *      caller wins, so a redelivered webhook or a second instance cannot place
 *      two registrar orders for one payment.
 *   2. **Re-quote** before buying. The price the customer approved was frozen
 *      at checkout; the registrar's has not been. Buying against the fresh
 *      quote removes the rounding round-trip (SEK→USD→SEK) that would
 *      otherwise make Vercel reject an `expectedPrice` we derived from a
 *      rounded number, and it catches a name that got taken while the customer
 *      was on the Stripe page.
 *   3. **Register**, then persist, then link to the project. Linking is
 *      best-effort on purpose: the customer owns the domain the moment the
 *      registrar says so, and a Vercel hiccup must not turn a completed
 *      purchase into a failed one — they can link from the UI afterwards.
 *
 * When step 2 or 3 fails we refund. A charge with nothing delivered is the one
 * outcome this module refuses to leave in place; if the refund itself fails the
 * order lands in `registration_failed` with the reason on the row, which is the
 * signal for manual handling rather than a silent loss.
 */

import Stripe from "stripe";
import { SECRETS } from "@/lib/config";
import { addDomainToProject, isVercelConfigured } from "@/lib/vercel/vercel-client";
import { bindingQuoteFromSek } from "@/lib/domains/pricing";
import { providersForTld, tldOf } from "@/lib/domains/registrar";
import {
  claimDomainOrderForRegistration,
  markDomainOrderRefunded,
  markDomainOrderRegistered,
  markDomainOrderRegistrationFailed,
  setDomainAddedToProject,
  type DomainOrder,
} from "@/lib/db/services/domain-orders";

export type FulfilmentOutcome =
  | { status: "registered"; registrarOrderId: string | null; linkedToProject: boolean }
  | { status: "already_handled" }
  | { status: "refunded"; reason: string }
  | { status: "needs_manual_handling"; reason: string };

function stripeClient(): Stripe | null {
  return SECRETS.stripeSecretKey ? new Stripe(SECRETS.stripeSecretKey) : null;
}

/**
 * Refund the charge and close the order. Returns whether the money is back.
 *
 * `reason` is stored on the row verbatim (truncated), because a refunded
 * domain order is exactly the thing someone will ask about later and "it
 * failed" is not an answer.
 */
export async function refundDomainOrder(
  order: Pick<DomainOrder, "id" | "stripe_payment_intent">,
  reason: string,
): Promise<boolean> {
  const stripe = stripeClient();
  if (!stripe || !order.stripe_payment_intent) {
    await markDomainOrderRegistrationFailed(
      order.id,
      `${reason} (no refund possible: missing payment intent)`,
    );
    return false;
  }
  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent,
      reason: "requested_by_customer",
    });
    await markDomainOrderRefunded(order.id, refund.id, reason);
    console.info(`[domains/fulfil] Refunded order ${order.id}: ${reason}`);
    return true;
  } catch (err) {
    console.error(`[domains/fulfil] Refund FAILED for order ${order.id}:`, err);
    await markDomainOrderRegistrationFailed(
      order.id,
      `${reason} (refund failed: ${err instanceof Error ? err.message : "unknown"})`,
    );
    return false;
  }
}

const refundOrder = refundDomainOrder;

/**
 * Fulfil an order, guaranteeing that a captured payment never ends in silence.
 *
 * The wrapper exists because the webhook cannot compensate on our behalf: it
 * has no safe way to tell whether an exception happened before or after the
 * registrar call, and refunding after a successful purchase would give a
 * domain away. Only this function knows, so only this function decides — an
 * unexpected throw BEFORE the registrar call refunds, and one after it leaves
 * the order for manual handling with the reason on the row.
 */
export async function fulfilDomainOrder(order: DomainOrder): Promise<FulfilmentOutcome> {
  let registrarCalled = false;
  try {
    return await fulfilDomainOrderInner(order, () => {
      registrarCalled = true;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown fulfilment error";
    console.error(`[domains/fulfil] Unexpected failure for order ${order.id}:`, err);
    if (registrarCalled) {
      // The domain may well be bought. Refunding here would hand it over for
      // free, so this is the one path that deliberately keeps the money and
      // asks a human to look.
      await markDomainOrderRegistrationFailed(
        order.id,
        `post_registration_failure: ${message}`,
      ).catch(() => undefined);
      return { status: "needs_manual_handling", reason: message };
    }
    const refunded = await refundOrder(order, `fulfilment_error: ${message}`).catch(() => false);
    return refunded
      ? { status: "refunded", reason: message }
      : { status: "needs_manual_handling", reason: message };
  }
}

async function fulfilDomainOrderInner(
  order: DomainOrder,
  markRegistrarCalled: () => void,
): Promise<FulfilmentOutcome> {
  const claimed = await claimDomainOrderForRegistration(order.id);
  if (!claimed) return { status: "already_handled" };

  const domain = order.domain;
  const tld = tldOf(domain);
  const provider = providersForTld(tld).find(
    (p) => p.id === order.registrar && p.canRegister(),
  );

  if (!provider) {
    const refunded = await refundOrder(order, "registrar_unavailable");
    return refunded
      ? { status: "refunded", reason: "registrar_unavailable" }
      : { status: "needs_manual_handling", reason: "registrar_unavailable" };
  }

  // Re-quote: the customer's price is frozen, the registrar's is not.
  const fresh = await provider.getQuote(domain);
  if (!fresh.quote.binding || fresh.quote.wholesaleSek === null) {
    const refunded = await refundOrder(order, "no_binding_quote_at_fulfilment");
    return refunded
      ? { status: "refunded", reason: "no_binding_quote_at_fulfilment" }
      : { status: "needs_manual_handling", reason: "no_binding_quote_at_fulfilment" };
  }
  if (fresh.available === false) {
    const refunded = await refundOrder(order, "domain_taken_before_fulfilment");
    return refunded
      ? { status: "refunded", reason: "domain_taken_before_fulfilment" }
      : { status: "needs_manual_handling", reason: "domain_taken_before_fulfilment" };
  }

  // Guard the margin without being twitchy about it: the customer already paid
  // a multiple of wholesale, so a normal price move is absorbed. Only refuse
  // when the registrar now wants more than the customer paid in total, which
  // would mean buying at a loss on their behalf without asking.
  const freshWholesaleOre = Math.round(fresh.quote.wholesaleSek * 100);
  if (order.price_ore !== null && freshWholesaleOre > order.price_ore) {
    const refunded = await refundOrder(order, "wholesale_price_exceeded_charge");
    return refunded
      ? { status: "refunded", reason: "wholesale_price_exceeded_charge" }
      : { status: "needs_manual_handling", reason: "wholesale_price_exceeded_charge" };
  }

  let registrarOrderId: string | null = null;
  try {
    markRegistrarCalled();
    const result = await provider.register(
      domain,
      bindingQuoteFromSek(fresh.quote.wholesaleSek, fresh.quote.periodYears ?? 1),
    );
    registrarOrderId = result.registrarOrderId;
  } catch (err) {
    // KNOWN GAP, unreachable today (the registrar call cannot succeed — see
    // `registrar/vercel-registrar.ts`). `markRegistrarCalled()` above records
    // that we dispatched, but this branch still refunds EVERY exception. A
    // request that reached the registrar and then lost its response (timeout,
    // socket reset) would hand the customer both the domain and their money
    // back. Post-dispatch failures must be treated as UNKNOWN and reconciled
    // against the registrar before any refund; only pre-dispatch failures are
    // safely refundable. Must be closed together with the registrar endpoint.
    const message = err instanceof Error ? err.message : "unknown registrar error";
    console.error(`[domains/fulfil] Registration failed for ${domain}:`, err);
    const refunded = await refundOrder(order, `registration_failed: ${message}`);
    return refunded
      ? { status: "refunded", reason: message }
      : { status: "needs_manual_handling", reason: message };
  }

  await markDomainOrderRegistered(order.id, registrarOrderId);

  // Best-effort from here: the domain is bought and paid for regardless.
  let linkedToProject = false;
  if (order.vercel_project_id && isVercelConfigured()) {
    try {
      await addDomainToProject(order.vercel_project_id, domain, process.env.VERCEL_TEAM_ID);
      await setDomainAddedToProject(order.id, true);
      linkedToProject = true;
    } catch (err) {
      console.warn(
        `[domains/fulfil] Registered ${domain} but could not attach it to the project:`,
        err,
      );
    }
  }

  return { status: "registered", registrarOrderId, linkedToProject };
}
