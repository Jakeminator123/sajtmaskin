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
const getTransactionByStripeSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/transactions", () => ({
  getTransactionByStripeSession,
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

const { GET, POST } = await import("./route");

const PACKAGE = {
  id: "popular",
  name: "Popular",
  diamonds: 99,
  price: 99,
  priceId: "price_live_only",
  popular: true,
};

function postCheckout(body: unknown = { packageId: "popular" }): NextRequest {
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

  it("stoppar köp från ett osparat kampanjkonto", async () => {
    getCurrentUser.mockResolvedValue({ id: "campaign-1", email: null, provider: "kostnadsfri" });

    const response = await POST(postCheckout());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "campaign_account_unclaimed" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([null, [], { packageId: 42 }, { packageId: "   " }])(
    "returnerar 400 för ogiltig checkout-payload: %j",
    async (body) => {
      const response = await POST(postCheckout(body));

      expect(response.status).toBe(400);
      expect(getPackageById).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    },
  );

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

  it("maskerar andra Stripe-fel utan fallback", async () => {
    const authError = new Stripe.errors.StripeAuthenticationError({
      type: "authentication_error",
      message: "Invalid API Key provided",
    });
    createSession.mockRejectedValueOnce(authError);

    const response = await POST(postCheckout());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Betaltjänsten kunde inte starta checkout.");
    expect(JSON.stringify(body)).not.toContain("Invalid API Key");
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "buyer@example.com" });
    getTransactionByStripeSession.mockResolvedValue(null);
  });

  it("rejects an oversized session id before database lookup", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/stripe/checkout?session_id=cs_${"x".repeat(254)}`),
    );

    expect(response.status).toBe(400);
    expect(getTransactionByStripeSession).not.toHaveBeenCalled();
  });

  it("returnerar credited=false utan pixelpayload när sessionen saknas", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/stripe/checkout?session_id=cs_missing"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, credited: false });
  });

  it("returnerar paketbelopp i öre när webhooken har krediterat sessionen", async () => {
    getTransactionByStripeSession.mockResolvedValue({
      user_id: "user-1",
      description: "Köp: popular",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/stripe/checkout?session_id=cs_ok"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      credited: true,
      packageId: "popular",
      name: "Mellanpaket",
      amount: 9900,
      currency: "SEK",
    });
  });

  it("nekas för en annan användares session", async () => {
    getTransactionByStripeSession.mockResolvedValue({
      user_id: "other-user",
      description: "Köp: popular",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/stripe/checkout?session_id=cs_ok"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, credited: false });
  });
});
