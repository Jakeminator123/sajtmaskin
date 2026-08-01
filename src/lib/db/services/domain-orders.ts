/**
 * Domain order ledger — the state machine behind "cannot be bought or charged
 * twice".
 *
 * Every transition here is a CONDITIONAL update that names the state it
 * expects to move out of, and the caller acts on the affected row count. That
 * is what makes the flow safe under redelivered webhooks and concurrent
 * serverless invocations: the second caller updates zero rows and knows it
 * lost, instead of both proceeding on a value they each read a moment earlier.
 *
 * The same shape as `acquireVersionLease` and `consumeF3ContinuationMarker`
 * elsewhere in the repo — deliberately, because inventing a third idempotency
 * idiom for the path that spends money would be the worst place to do it.
 */

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { domainOrders } from "@/lib/db/schema";
import type { DomainOrderStatus as DomainOrderStatusType } from "@/lib/domains/order-status";
import { assertDbConfigured } from "./shared";

export type DomainOrder = typeof domainOrders.$inferSelect;

export { LIVE_DOMAIN_ORDER_STATUSES } from "@/lib/domains/order-status";
export type { DomainOrderStatus } from "@/lib/domains/order-status";

/** An unpaid order stops holding the name after this long. */
export const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;

/** Thrown when the live-domain unique index rejects a second order. */
export class DomainAlreadyOrderedError extends Error {
  readonly code = "DOMAIN_ALREADY_ORDERED" as const;
  constructor(domain: string) {
    super(`A live order already exists for ${domain}`);
    this.name = "DomainAlreadyOrderedError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("duplicate key value") || message.includes("idx_domain_orders_");
}

/**
 * Free names held by pending orders whose checkout window has passed.
 *
 * Called before every insert rather than on a timer: a sweep that only runs
 * on a schedule leaves the name unbuyable until it fires, and the moment we
 * actually care is the moment someone tries to buy it again.
 */
export async function releaseExpiredPendingOrders(domain?: string): Promise<number> {
  assertDbConfigured();
  const conditions = [
    eq(domainOrders.status, "pending_payment"),
    lt(domainOrders.expires_at, new Date()),
  ];
  if (domain) {
    conditions.push(sql`lower(${domainOrders.domain}) = ${domain.toLowerCase()}`);
  }
  const result = await db
    .update(domainOrders)
    .set({ status: "expired", updated_at: new Date(), failure_reason: "checkout_expired" })
    .where(and(...conditions));
  return result.rowCount ?? 0;
}

export interface CreatePendingDomainOrderInput {
  userId: string;
  chatId: string | null;
  projectId: string;
  vercelProjectId: string | null;
  domain: string;
  registrar: string;
  /** Customer-facing amount in öre — exactly what Stripe will charge. */
  priceOre: number;
  /** Registrar wholesale in öre at quote time. */
  wholesaleOre: number | null;
  currency: string;
}

/**
 * Reserve the name and open an unpaid order.
 *
 * The reservation IS the insert: the partial unique index is what rejects a
 * concurrent second buyer, so there is no read-then-write window to lose.
 */
export async function createPendingDomainOrder(
  input: CreatePendingDomainOrderInput,
): Promise<DomainOrder> {
  assertDbConfigured();
  await releaseExpiredPendingOrders(input.domain);

  const now = new Date();
  try {
    const rows = await db
      .insert(domainOrders)
      .values({
        id: nanoid(),
        user_id: input.userId,
        chat_id: input.chatId,
        project_id: input.projectId,
        vercel_project_id: input.vercelProjectId,
        domain: input.domain.toLowerCase(),
        registrar: input.registrar,
        status: "pending_payment",
        price_ore: input.priceOre,
        wholesale_ore: input.wholesaleOre,
        currency: input.currency,
        expires_at: new Date(now.getTime() + PENDING_ORDER_TTL_MS),
        created_at: now,
        updated_at: now,
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainAlreadyOrderedError(input.domain);
    throw error;
  }
}

export async function attachStripeSession(
  orderId: string,
  sessionId: string,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({ stripe_session_id: sessionId, updated_at: new Date() })
    .where(eq(domainOrders.id, orderId));
}

export async function getDomainOrderById(
  orderId: string,
  userId?: string,
): Promise<DomainOrder | null> {
  assertDbConfigured();
  const conditions = [eq(domainOrders.id, orderId)];
  // Tenant scoping is the caller's only protection here: order ids are
  // guessable enough that an unscoped read would be a cross-tenant leak.
  if (userId) conditions.push(eq(domainOrders.user_id, userId));
  const rows = await db
    .select()
    .from(domainOrders)
    .where(and(...conditions))
    .limit(1);
  return rows[0] ?? null;
}

/** Outcome of trying to move an order to `paid`. */
export type MarkPaidResult =
  | { outcome: "paid"; order: DomainOrder }
  /**
   * Already `paid` or further along — a redelivered webhook.
   *
   * The row travels with the outcome because "already paid" is NOT the same as
   * "already delivered": an invocation that died between the paid-marking and
   * fulfilment leaves the order sitting at `paid` with nothing registered. The
   * caller needs the status to tell a genuine duplicate from an interrupted
   * one.
   */
  | { outcome: "already_handled"; order: DomainOrder }
  /** No such order. */
  | { outcome: "not_found" }
  /**
   * The order had lapsed AND another live order now holds the name, so the
   * database refused to revive it. The payment must be refunded.
   */
  | { outcome: "domain_taken" };

/**
 * Move an order to `paid`, keyed by ORDER ID rather than session id.
 *
 * Keying on the order id (carried in Stripe metadata) removes a hole: the
 * session id is written to the row after the Checkout session is created, so a
 * failure in that window would leave a payable session no lookup could match.
 * The session id is written here instead, as part of the same statement that
 * accepts the payment.
 *
 * A lapsed order is revived rather than abandoned. `expired`/`canceled` mean
 * "we stopped waiting", not "the customer did not pay" — and a late
 * `checkout.session.completed` says they did. Whether reviving is allowed is
 * decided by the database: moving back into a live status re-enters the
 * partial unique index, so if another customer legitimately took the name in
 * the meantime the UPDATE fails and we refund instead of selling it twice.
 */
export async function markDomainOrderPaid(
  orderId: string,
  sessionId: string,
  paymentIntentId: string | null,
): Promise<MarkPaidResult> {
  assertDbConfigured();
  const revivable: DomainOrderStatusType[] = ["pending_payment", "expired", "canceled"];
  try {
    const rows = await db
      .update(domainOrders)
      .set({
        status: "paid",
        stripe_session_id: sessionId,
        stripe_payment_intent: paymentIntentId,
        paid_at: new Date(),
        updated_at: new Date(),
        failure_reason: null,
      })
      .where(and(eq(domainOrders.id, orderId), inArray(domainOrders.status, revivable)))
      .returning();
    if (rows[0]) return { outcome: "paid", order: rows[0] };
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "domain_taken" };
    throw error;
  }
  const existing = await getDomainOrderById(orderId);
  return existing ? { outcome: "already_handled", order: existing } : { outcome: "not_found" };
}

/**
 * `paid` → `registering`. The lease that guarantees exactly one registrar call.
 *
 * Returns `false` for every loser, including a retry of the same delivery, so
 * the expensive irreversible step runs once even if the webhook arrives twice
 * on two instances at the same moment.
 */
export async function claimDomainOrderForRegistration(orderId: string): Promise<boolean> {
  assertDbConfigured();
  const result = await db
    .update(domainOrders)
    .set({ status: "registering", updated_at: new Date() })
    .where(and(eq(domainOrders.id, orderId), eq(domainOrders.status, "paid")));
  return (result.rowCount ?? 0) > 0;
}

export async function markDomainOrderRegistered(
  orderId: string,
  registrarOrderId: string | null,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({
      status: "registered",
      order_id: registrarOrderId,
      registered_at: new Date(),
      updated_at: new Date(),
      failure_reason: null,
    })
    .where(eq(domainOrders.id, orderId));
}

export async function markDomainOrderRegistrationFailed(
  orderId: string,
  reason: string,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({
      status: "registration_failed",
      failure_reason: reason.slice(0, 500),
      updated_at: new Date(),
    })
    .where(eq(domainOrders.id, orderId));
}

export async function markDomainOrderRefunded(
  orderId: string,
  refundId: string | null,
  reason: string,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({
      status: "refunded",
      stripe_refund_id: refundId,
      refunded_at: new Date(),
      failure_reason: reason.slice(0, 500),
      updated_at: new Date(),
    })
    .where(eq(domainOrders.id, orderId));
}

/** Stripe told us the checkout window closed unpaid — release the name. */
export async function markDomainOrderExpired(orderId: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({ status: "expired", failure_reason: "checkout_expired", updated_at: new Date() })
    .where(and(eq(domainOrders.id, orderId), eq(domainOrders.status, "pending_payment")));
}

export async function setDomainAddedToProject(
  orderId: string,
  added: boolean,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({ domain_added_to_project: added, updated_at: new Date() })
    .where(eq(domainOrders.id, orderId));
}
