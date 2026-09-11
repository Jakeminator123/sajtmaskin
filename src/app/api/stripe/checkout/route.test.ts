import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getPackageById = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/billing/stripe", () => ({ getPackageById }));
vi.mock("@/lib/config", () => ({
  SECRETS: { stripeSecretKey: "sk_test_x" },
  URLS: { baseUrl: "http://localhost:3000" },
}));
vi.mock("@/lib/db/services/transactions", () => ({
  getTransactionByStripeSession: vi.fn(),
}));

vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  return {
    default: class FakeStripe {
      checkout = {
        sessions: {
          create: (...args: unknown[]) => createSession(...(args as [])),
        },
      };
      static errors = actual.default.errors;
    },
  };
});

const { POST } = await import("./route");

const PACKAGE = {
  id: "25_credits",
  name: "Popular",
  diamonds: 25,
  price: 99,
  priceId: "price_live_only",
  popular: true,
};

function postCheckout(body: { packageId?: string } = { packageId: "25_credits" }): NextRequest {
  return new NextRequest("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function missingPriceError(): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code: "resource_missing",
    param: "line_items[0][price]",
    message: "No such price: 'price_live_only'",
    statusCode: 404,
  });
}

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "buyer@example.com" });
    getPackageById.mockReturnValue(PACKAGE);
    createSession.mockResolvedValue({
      id: "cs_ok",
      url: "https://checkout.stripe.test/cs_ok",
    });
  });

  it("returnerar checkout-url när price-id accepteras", async () => {
    const response = await POST(postCheckout());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, sessionId: "cs_ok" });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_live_only", quantity: 1 }],
      }),
    );
  });

  it("faller tillbaka på price_data när price-id saknas i Stripe-kontot", async () => {
    createSession
      .mockRejectedValueOnce(missingPriceError())
      .mockResolvedValueOnce({ id: "cs_fallback", url: "https://checkout.stripe.test/cs_fallback" });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(postCheckout());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, sessionId: "cs_fallback" });
    expect(createSession.mock.calls[1]?.[0]).toMatchObject({
      line_items: [
        {
          price_data: {
            currency: "sek",
            unit_amount: 9900,
          },
        },
      ],
    });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("returnerar 400 för andra Stripe-fel utan fallback", async () => {
    const authError = new Stripe.errors.StripeAuthenticationError({
      type: "authentication_error",
      message: "Invalid API Key provided",
    });
    createSession.mockRejectedValueOnce(authError);

    const response = await POST(postCheckout());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Betalningsfel");
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
