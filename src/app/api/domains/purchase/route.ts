/**
 * Domain purchase
 * ===============
 *
 * POST /api/domains/purchase  { domain, chatId } → Stripe Checkout URL
 * GET  /api/domains/purchase?orderId=… → order status for polling
 *
 * The invariants this route exists to hold:
 *
 *  - **Never charge an estimated price.** The offer must carry a binding
 *    registrar quote (`quote.binding`); a per-TLD reference figure is fine for
 *    a search result and never fine for a card charge.
 *  - **Freeze the price before payment.** The öre amount written to the order
 *    row is the amount sent to Stripe. Re-reading the registrar later cannot
 *    change what the customer approved.
 *  - **Reserve before paying.** The order row is inserted first, so the
 *    partial unique index on live domains rejects a second buyer at the
 *    database rather than after both have paid.
 *
 * Fulfilment (the registrar call) deliberately does NOT happen here — it hangs
 * off the Stripe webhook, because a card charge that succeeds while our
 * response is in flight must still result in a registered domain.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/auth";
import { FEATURES, SECRETS, URLS } from "@/lib/config";
import { withRateLimit } from "@/lib/rate-limit";
import { resolveDomainOffer } from "@/lib/domains/registrar";
import { sekToOre } from "@/lib/domains/pricing";
import { resolveChatProjectContext } from "@/lib/domains/resolve-vercel-project";
import {
  DomainAlreadyOrderedError,
  attachStripeSession,
  createPendingDomainOrder,
  getDomainOrderById,
  PENDING_ORDER_TTL_MS,
} from "@/lib/db/services/domain-orders";

export const maxDuration = 20;

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9-]+)+$/;

const stripe = SECRETS.stripeSecretKey ? new Stripe(SECRETS.stripeSecretKey) : null;

/** Swedish copy for why a domain cannot be bought, keyed by the offer reason. */
const BLOCKED_COPY: Record<string, string> = {
  not_available: "Domänen är redan tagen.",
  unknown_availability: "Vi kunde inte bekräfta att domänen är ledig just nu. Försök igen.",
  no_binding_price:
    "Vi har inget bindande pris för den här domänen just nu, så den går inte att köpa här. Priset du ser är en uppskattning.",
  no_registrar_for_tld: "Vi kan inte registrera den här toppdomänen ännu.",
  purchase_disabled: "Domänköp är inte aktiverat i den här miljön.",
};

export async function GET(req: NextRequest) {
  return withRateLimit(req, "domains:purchase", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Du måste vara inloggad." }, { status: 401 });
    }
    const orderId = req.nextUrl.searchParams.get("orderId")?.trim();
    if (!orderId) {
      return NextResponse.json({ error: "orderId krävs." }, { status: 400 });
    }
    // Scoped to the caller: order ids are short and an unscoped read would let
    // one customer poll another customer's purchase.
    const order = await getDomainOrderById(orderId, user.id);
    if (!order) {
      return NextResponse.json({ error: "Ordern hittades inte." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        domain: order.domain,
        status: order.status,
        priceSek: order.price_ore === null ? null : order.price_ore / 100,
        currency: order.currency,
        linkedToProject: order.domain_added_to_project,
        failureReason: order.failure_reason,
      },
    });
  });
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:purchase", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Du måste vara inloggad." }, { status: 401 });
    }

    if (!FEATURES.useDomainPurchase || !stripe) {
      return NextResponse.json(
        { error: BLOCKED_COPY.purchase_disabled, reason: "purchase_disabled" },
        { status: 503 },
      );
    }

    let body: { domain?: unknown; chatId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Ogiltig begäran." }, { status: 400 });
    }

    const domain = String(body.domain ?? "").trim().toLowerCase();
    const chatId = String(body.chatId ?? "").trim();

    if (!domain || !DOMAIN_RE.test(domain)) {
      return NextResponse.json({ error: "Ogiltigt domännamn." }, { status: 400 });
    }
    if (!chatId) {
      return NextResponse.json({ error: "chatId krävs." }, { status: 400 });
    }

    const context = await resolveChatProjectContext(req, chatId);
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const offer = await resolveDomainOffer(domain);
    if (!offer.purchasable || offer.quote.customerSek === null || !offer.fulfilmentRegistrar) {
      const reason = offer.purchaseBlockedReason ?? "no_binding_price";
      return NextResponse.json(
        { error: BLOCKED_COPY[reason] ?? BLOCKED_COPY.no_binding_price, reason },
        { status: 409 },
      );
    }

    const priceOre = sekToOre(offer.quote.customerSek);
    if (priceOre <= 0) {
      return NextResponse.json(
        { error: BLOCKED_COPY.no_binding_price, reason: "no_binding_price" },
        { status: 409 },
      );
    }

    // Reserve first. A concurrent buyer loses here, at the unique index,
    // instead of after their card has been charged.
    let order;
    try {
      order = await createPendingDomainOrder({
        userId: user.id,
        chatId,
        projectId: context.appProjectId,
        vercelProjectId: context.vercelProjectId,
        domain,
        registrar: offer.fulfilmentRegistrar,
        priceOre,
        wholesaleOre:
          offer.quote.wholesaleSek === null ? null : sekToOre(offer.quote.wholesaleSek),
        currency: "SEK",
      });
    } catch (error) {
      if (error instanceof DomainAlreadyOrderedError) {
        return NextResponse.json(
          {
            error: "Domänen håller redan på att köpas. Försök igen om en stund.",
            reason: "already_ordered",
          },
          { status: 409 },
        );
      }
      console.error("[domains/purchase] Could not create order:", error);
      return NextResponse.json({ error: "Kunde inte skapa ordern." }, { status: 500 });
    }

    try {
      const baseUrl = URLS.baseUrl;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: user.email || undefined,
        line_items: [
          {
            price_data: {
              currency: "sek",
              product_data: {
                name: `Domän: ${domain}`,
                description: `Registrering av ${domain} i 1 år via SajtMaskin`,
              },
              unit_amount: priceOre,
            },
            quantity: 1,
          },
        ],
        metadata: {
          kind: "domain_purchase",
          domainOrderId: order.id,
          userId: user.id,
          domain,
        },
        // Keep Stripe's window and our reservation window aligned: a session
        // that outlives the reservation could be paid after another customer
        // legitimately reserved the same name.
        expires_at: Math.floor((Date.now() + PENDING_ORDER_TTL_MS) / 1000),
        success_url: `${baseUrl}/builder?domainOrder=${order.id}&domainPurchase=success`,
        cancel_url: `${baseUrl}/builder?domainOrder=${order.id}&domainPurchase=canceled`,
      });

      await attachStripeSession(order.id, session.id);

      return NextResponse.json({
        success: true,
        orderId: order.id,
        domain,
        priceSek: offer.quote.customerSek,
        currency: "SEK",
        url: session.url,
      });
    } catch (error) {
      console.error("[domains/purchase] Stripe session failed:", error);
      // The reservation stays, but it expires on its own (PENDING_ORDER_TTL_MS)
      // and `releaseExpiredPendingOrders` reclaims it on the next attempt, so a
      // failed checkout cannot lock a name out permanently.
      return NextResponse.json(
        { error: "Kunde inte starta betalningen. Försök igen." },
        { status: 502 },
      );
    }
  });
}
