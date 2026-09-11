import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import {
  buildCreditPackageLineItem,
  buildCreditPackagePriceDataLineItem,
  createCreditCheckoutSession,
  isStripeMissingConfiguredPriceError,
  type CreditPackageForCheckout,
} from "./stripe-credit-checkout";

const PACKAGE: CreditPackageForCheckout = {
  id: "25_credits",
  name: "Popular",
  diamonds: 25,
  price: 99,
  priceId: "price_valid",
};

function missingPriceError(): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code: "resource_missing",
    param: "line_items[0][price]",
    message: "No such price: 'price_valid'",
    statusCode: 404,
  });
}

describe("isStripeMissingConfiguredPriceError", () => {
  it("matchar resource_missing på price-parametern", () => {
    expect(isStripeMissingConfiguredPriceError(missingPriceError())).toBe(true);
  });

  it("ignorerar andra invalid_request-fel", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "parameter_unknown",
      param: "currency",
      message: "Unknown currency",
    });
    expect(isStripeMissingConfiguredPriceError(error)).toBe(false);
  });

  it("ignorerar resource_missing på annan resurs än price", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "resource_missing",
      param: "customer",
      message: "No such customer",
    });
    expect(isStripeMissingConfiguredPriceError(error)).toBe(false);
  });

  it("ignorerar autentiseringsfel", () => {
    const error = new Stripe.errors.StripeAuthenticationError({
      type: "authentication_error",
      message: "Invalid API Key",
    });
    expect(isStripeMissingConfiguredPriceError(error)).toBe(false);
  });

  it("ignorerar kortfel", () => {
    const error = new Stripe.errors.StripeCardError({
      type: "card_error",
      code: "card_declined",
      message: "Your card was declined.",
    });
    expect(isStripeMissingConfiguredPriceError(error)).toBe(false);
  });
});

describe("buildCreditPackageLineItem", () => {
  it("använder konfigurerat price-id när det finns", () => {
    expect(buildCreditPackageLineItem(PACKAGE)).toEqual({
      price: "price_valid",
      quantity: 1,
    });
  });

  it("bygger price_data utan price-id", () => {
    const withoutPriceId = { ...PACKAGE, priceId: undefined };
    expect(buildCreditPackageLineItem(withoutPriceId)).toEqual(
      buildCreditPackagePriceDataLineItem(withoutPriceId),
    );
  });
});

describe("createCreditCheckoutSession", () => {
  const create = vi.fn();
  const stripe = {
    checkout: { sessions: { create } },
  } as unknown as Stripe;

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test/cs_test" });
  });

  it("skapar session med price-id när Stripe accepterar det", async () => {
    await createCreditCheckoutSession(stripe, PACKAGE, { mode: "payment" });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      mode: "payment",
      line_items: [{ price: "price_valid", quantity: 1 }],
    });
  });

  it("faller tillbaka på price_data med rätt belopp och valuta", async () => {
    create
      .mockRejectedValueOnce(missingPriceError())
      .mockResolvedValueOnce({ id: "cs_fallback", url: "https://checkout.stripe.test/cs_fallback" });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const session = await createCreditCheckoutSession(stripe, PACKAGE, { mode: "payment" });

    expect(session.id).toBe("cs_fallback");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "sek",
            unit_amount: 9900,
            product_data: {
              name: "Popular",
              description: "25 credits för SajtMaskin",
            },
          },
          quantity: 1,
        },
      ],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[Stripe/checkout] Konfigurerat price-id avvisades av Stripe — faller tillbaka på price_data",
      expect.objectContaining({
        packageId: "25_credits",
        priceId: "price_valid",
        stripeCode: "resource_missing",
      }),
    );

    warnSpy.mockRestore();
  });

  it("bubblar andra Stripe-fel utan fallback", async () => {
    const authError = new Stripe.errors.StripeAuthenticationError({
      type: "authentication_error",
      message: "Invalid API Key provided",
    });
    create.mockRejectedValueOnce(authError);

    await expect(createCreditCheckoutSession(stripe, PACKAGE, { mode: "payment" })).rejects.toBe(
      authError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
