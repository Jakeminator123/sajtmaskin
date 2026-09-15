import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
  SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED,
  SITE_SUBSCRIPTION_PRICE_REF,
} from "@/lib/billing/site-subscription-offer";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
const createCreditCheckoutSession = vi.hoisted(() => vi.fn());
const dbInsert = vi.hoisted(() => vi.fn());
const dbUpdate = vi.hoisted(() => vi.fn());
const secrets = vi.hoisted(() => ({ stripeSecretKey: "sk_test_x" }));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, bucket: string, handler: () => Promise<Response>) => {
    if (bucket !== "stripe:checkout") {
      throw new Error(`expected stripe:checkout bucket, got ${bucket}`);
    }
    return handler();
  },
}));

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner }));

vi.mock("@/lib/config", () => ({
  SECRETS: secrets,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: (...args: unknown[]) => dbInsert(...args),
    update: (...args: unknown[]) => dbUpdate(...args),
  },
  dbConfigured: false,
}));

vi.mock("@/lib/billing/stripe-credit-checkout", () => ({
  createCreditCheckoutSession,
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

function postCheckout(body: Record<string, unknown> | null = { projectId: "proj_1" }): NextRequest {
  return new NextRequest("http://localhost/api/stripe/site-subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === null ? "not-json" : JSON.stringify(body),
  });
}

describe("POST /api/stripe/site-subscription/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secrets.stripeSecretKey = "sk_test_x";
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "owner@example.com" });
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_1", user_id: "user-1" });
  });

  it("returnerar 401 när användaren inte är inloggad", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await POST(postCheckout());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: "Du måste vara inloggad" });
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("returnerar 404 för projekt som anroparen inte äger", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);

    const response = await POST(postCheckout({ projectId: "someone-elses-project" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ success: false, error: "Projektet hittades inte" });
    expect(getProjectByIdForOwner).toHaveBeenCalledWith("someone-elses-project", {
      userId: "user-1",
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("ignorerar klientbelopp och klientläge och svarar 503 utan Stripe eller DB-write", async () => {
    const response = await POST(
      postCheckout({
        projectId: "proj_1",
        amount: 1,
        amount_ore: 100,
        mode: "live",
        billing_mode: "live",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      code: SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED,
      activation: SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
      offer: {
        billing_mode: "test",
        price_ref: SITE_SUBSCRIPTION_PRICE_REF,
        commercial_terms: { status: "not_ratified", ratification: "proposal" },
      },
    });
    expect(body.offer.billing_mode).not.toBe("live");
    expect(body.sessionId).toBeUndefined();
    expect(body.url).toBeUndefined();
    expect(createSession).not.toHaveBeenCalled();
    expect(createCreditCheckoutSession).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("låter inte activate/request-flagga öppna checkout", async () => {
    const response = await POST(
      postCheckout({
        projectId: "proj_1",
        activate: true,
        activation: true,
        enabled: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe(SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED);
    expect(body.activation).toBe(SITE_SUBSCRIPTION_ACTIVATION_NOT_READY);
    expect(createSession).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("använder server-live-läge även om klienten skickar test", async () => {
    secrets.stripeSecretKey = "sk_live_x";

    const response = await POST(
      postCheckout({
        projectId: "proj_1",
        billing_mode: "test",
        mode: "test",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.offer.billing_mode).toBe("live");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returnerar 400 utan projectId", async () => {
    const response = await POST(postCheckout({ amount: 99 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "projectId saknas" });
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
