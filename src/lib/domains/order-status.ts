/**
 * Domain order lifecycle — the status vocabulary, with no database imports.
 *
 * Kept separate from `db/services/domain-orders.ts` so the Postgres-backed
 * contract test can assert that {@link LIVE_DOMAIN_ORDER_STATUSES} matches the
 * predicate of `idx_domain_orders_live_domain` without pulling the Drizzle
 * client (and its env requirements) into a plain `pg` test.
 *
 * That drift is worth guarding: if the constant and the index predicate
 * disagree, a status the code thinks holds a name would stop being unique in
 * the database, and two customers could buy the same domain.
 */

export type DomainOrderStatus =
  | "pending_payment"
  | "paid"
  | "registering"
  | "registered"
  | "expired"
  | "canceled"
  | "registration_failed"
  | "refunded";

/** Statuses that hold the name. Must equal the SQL index predicate. */
export const LIVE_DOMAIN_ORDER_STATUSES: readonly DomainOrderStatus[] = [
  "pending_payment",
  "paid",
  "registering",
  "registered",
];
