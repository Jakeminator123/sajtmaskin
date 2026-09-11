import Stripe from "stripe";

export type CreditPackageForCheckout = {
  id: string;
  name: string;
  diamonds: number;
  price: number;
  priceId?: string;
};

export type CreditCheckoutLineItem =
  | { price: string; quantity: number }
  | {
      price_data: {
        currency: string;
        product_data: {
          name: string;
          description: string;
          images: string[];
        };
        unit_amount: number;
      };
      quantity: number;
    };

/** Bygger price_data-rad från paketlistan — samma belopp som UI visar. */
export function buildCreditPackagePriceDataLineItem(
  packageData: CreditPackageForCheckout,
): CreditCheckoutLineItem {
  return {
    price_data: {
      currency: "sek",
      product_data: {
        name: packageData.name,
        description: `${packageData.diamonds} credits för SajtMaskin`,
        images: [],
      },
      unit_amount: packageData.price * 100, // öre
    },
    quantity: 1,
  };
}

export function buildCreditPackageLineItem(
  packageData: CreditPackageForCheckout,
): CreditCheckoutLineItem {
  if (packageData.priceId) {
    return { price: packageData.priceId, quantity: 1 };
  }
  return buildCreditPackagePriceDataLineItem(packageData);
}

/**
 * Sant bara när Stripe avvisar just det konfigurerade price-id:t som saknas —
 * t.ex. live-id mot testnyckel. Andra invalid_request-fel (ogiltig valuta m.m.)
 * ska inte trigga fallback.
 */
export function isStripeMissingConfiguredPriceError(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) {
    return false;
  }
  if (error.code !== "resource_missing") {
    return false;
  }
  const param = error.param ?? "";
  return param.includes("price");
}

export async function createCreditCheckoutSession(
  stripe: Stripe,
  packageData: CreditPackageForCheckout,
  sessionParams: Omit<Stripe.Checkout.SessionCreateParams, "line_items">,
): Promise<Stripe.Checkout.Session> {
  const configuredPriceId = packageData.priceId;
  const primaryLineItem = buildCreditPackageLineItem(packageData);

  try {
    return await stripe.checkout.sessions.create({
      ...sessionParams,
      line_items: [primaryLineItem],
    });
  } catch (error) {
    if (
      !configuredPriceId ||
      !(error instanceof Stripe.errors.StripeInvalidRequestError) ||
      !isStripeMissingConfiguredPriceError(error)
    ) {
      throw error;
    }

    console.warn(
      "[Stripe/checkout] Konfigurerat price-id avvisades av Stripe — faller tillbaka på price_data",
      {
        packageId: packageData.id,
        priceId: configuredPriceId,
        stripeCode: error.code,
        stripeParam: error.param,
        stripeMessage: error.message,
      },
    );

    return stripe.checkout.sessions.create({
      ...sessionParams,
      line_items: [buildCreditPackagePriceDataLineItem(packageData)],
    });
  }
}
