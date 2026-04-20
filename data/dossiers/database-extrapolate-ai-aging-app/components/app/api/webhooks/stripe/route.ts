import { headers } from "next/headers";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return new Response("Missing Stripe webhook configuration", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature";
    return new Response(message, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "product.created":
    case "product.updated": {
      const product = event.data.object as Stripe.Product;
      const { error } = await supabase.from("products").upsert({
        id: product.id,
        active: product.active,
        name: product.name,
        description: product.description,
        image: product.images?.[0] ?? null,
        metadata: product.metadata,
      });
      if (error) return new Response(error.message, { status: 400 });
      break;
    }
    case "product.deleted": {
      const product = event.data.object as Stripe.Product;
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) return new Response(error.message, { status: 400 });
      break;
    }
    case "price.created":
    case "price.updated": {
      const price = event.data.object as Stripe.Price;
      const { error } = await supabase.from("prices").upsert({
        id: price.id,
        product_id: typeof price.product === "string" ? price.product : price.product.id,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        type: price.type,
        interval: price.recurring?.interval ?? null,
        interval_count: price.recurring?.interval_count ?? null,
        trial_period_days: price.recurring?.trial_period_days ?? null,
        metadata: price.metadata,
      });
      if (error) return new Response(error.message, { status: 400 });
      break;
    }
    case "price.deleted": {
      const price = event.data.object as Stripe.Price;
      const { error } = await supabase.from("prices").delete().eq("id", price.id);
      if (error) return new Response(error.message, { status: 400 });
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid" && session.client_reference_id) {
        const credits = Number(session.metadata?.credits ?? 0);
        const { error } = await supabase.rpc("update_credits", {
          user_id: session.client_reference_id,
          credit_amount: credits,
        });
        if (error) return new Response(error.message, { status: 400 });
      }
      break;
    }
    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
