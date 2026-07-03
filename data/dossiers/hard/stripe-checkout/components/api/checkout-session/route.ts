import { NextResponse } from "next/server";
import Stripe from "stripe";

interface Body {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Recognizable error code so the client can render a calm "not configured"
    // notice instead of guessing on the HTTP status alone.
    return NextResponse.json(
      { error: "payments-not-configured" },
      { status: 503 },
    );
  }
  // Instantiate Stripe AFTER the env guard — a module-level `new Stripe("")`
  // throws at import time and would turn the missing-key path into a route
  // crash instead of the JSON 503 above.
  const stripe = new Stripe(secretKey, {
    apiVersion: "2026-01-28.clover",
  });
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.priceId || typeof body.priceId !== "string") {
    return NextResponse.json({ error: "priceId is required" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const successUrl = body.successUrl ?? `${origin}/payment-success`;
  const cancelUrl = body.cancelUrl ?? `${origin}/`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: body.priceId.startsWith("price_") ? "subscription" : "payment",
      line_items: [{ price: body.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
