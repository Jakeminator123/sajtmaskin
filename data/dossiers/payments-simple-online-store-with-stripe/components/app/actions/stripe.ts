"use server";

import { stripe } from "../../lib/stripe";
import { PRODUCTS } from "../../lib/products";

export async function startCheckoutSession(productId: string): Promise<string> {
  const product = PRODUCTS.find((item) => item.id === productId);

  if (!product) {
    throw new Error("Product not found");
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            description: product.description,
            images: product.images,
          },
          unit_amount: product.priceInCents,
        },
        quantity: 1,
      },
    ],
    return_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      productId: product.id,
    },
  });

  if (!session.client_secret) {
    throw new Error("Failed to create checkout session");
  }

  return session.client_secret;
}
