/**
 * Registrar abstraction
 * =====================
 *
 * Two capabilities that are routinely conflated and must not be:
 *
 *   - **pricing/availability** — "is this name free, and roughly what does it
 *     cost?" Cheap, read-only, safe to call on every keystroke-ish search.
 *   - **registration** — "buy it." Spends real money at a third party and
 *     cannot be undone by us.
 *
 * A provider can have the first without the second (Loopia today: its
 * XML-RPC surface here answers availability and writes DNS, but nothing in
 * this repo can place a domain order through it). Modelling that as one
 * boolean would let the purchase path assume a capability that does not
 * exist, so `canQuote()` and `canRegister()` stay separate.
 */

import type { DomainPriceQuote } from "@/lib/domains/pricing";

export type RegistrarId = "vercel" | "loopia";

export interface RegistrarQuote {
  registrar: RegistrarId;
  /** `null` when the provider could not determine availability. */
  available: boolean | null;
  quote: DomainPriceQuote;
  /** Populated when the lookup failed; the caller decides whether to fall back. */
  error: string | null;
}

export interface RegisterResult {
  /** Provider-side order/reference id, when the API returns one. */
  registrarOrderId: string | null;
}

export interface RegistrarProvider {
  readonly id: RegistrarId;
  /** TLDs this provider claims. Empty set = "anything not claimed by others". */
  supportsTld(tld: string): boolean;
  /** Credentials present for availability/price lookups. */
  canQuote(): boolean;
  /**
   * Credentials present AND registration is both implemented and switched on.
   * A provider that can price but not buy returns `false` here.
   */
  canRegister(): boolean;
  getQuote(domain: string): Promise<RegistrarQuote>;
  /**
   * Place the order. Only ever called when {@link canRegister} is true and the
   * caller holds a binding quote. Must throw on failure so the caller's refund
   * path runs — never resolve with a partial success.
   */
  register(domain: string, binding: DomainPriceQuote): Promise<RegisterResult>;
}
