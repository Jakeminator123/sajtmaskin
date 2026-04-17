"use client";

import { getPaddleInstance } from "./paddle";
import { getMobileRedirectUrl } from "./redirect";

type OpenCheckoutArgs = {
  priceId: string;
  email?: string;
  customerId?: string;
  customData?: Record<string, string>;
};

export async function openPaddleCheckout({
  priceId,
  email,
  customerId,
  customData,
}: OpenCheckoutArgs) {
  const paddle = await getPaddleInstance();

  if (!paddle) {
    throw new Error("Failed to initialize Paddle");
  }

  paddle.Checkout.open({
    items: [{
      priceId,
      quantity: 1,
    }],
    customer: {
      email,
      id: customerId,
    },
    customData,
    settings: {
      displayMode: "overlay",
      successUrl: "https://example.com/checkout/success",
    },
    eventCallback(event) {
      if (event.name === "checkout.completed") {
        const transactionId = event.data?.transaction_id;

        if (transactionId) {
          window.location.href = getMobileRedirectUrl(transactionId);
        }
      }
    },
  });
}
