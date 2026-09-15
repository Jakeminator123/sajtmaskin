import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const startSiteSubscriptionCheckout = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/billing/site-subscription-checkout", () => ({
  startSiteSubscriptionCheckout,
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

function postCheckout(body: unknown = { projectId: "proj_1" }): NextRequest {
  return new NextRequest("http://localhost/api/stripe/site-subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postRaw(raw: string): NextRequest {
  return new NextRequest("http://localhost/api/stripe/site-subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

function expectNoWrites() {
  expect(createSession).not.toHaveBeenCalled();
  expect(createCreditCheckoutSession).not.toHaveBeenCalled();
  expect(startSiteSubscriptionCheckout).not.toHaveBeenCalled();
  expect(dbInsert).not.toHaveBeenCalled();
  expect(dbUpdate).not.toHaveBeenCalled();
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
    expectNoWrites();
  });

  it.each([
    { label: "JSON null", body: null },
    { label: "array", body: [] },
    { label: "string", body: "sträng" },
    { label: "number", body: 42 },
    { label: "boolean", body: true },
  ])("returnerar 400 före projektuppslag för $label", async ({ body: requestBody }) => {
    const response = await POST(postCheckout(requestBody));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "Ogiltig begäran." });
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returnerar 400 för ogiltig JSON före projektuppslag", async () => {
    const response = await POST(postRaw("not-json"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "Ogiltig begäran." });
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expectNoWrites();
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
    expectNoWrites();
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
    expect(getProjectByIdForOwner).toHaveBeenCalledWith("proj_1", { userId: "user-1" });
    expectNoWrites();
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
    expectNoWrites();
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
    expectNoWrites();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skapar subscription-checkout i test när env-grinden är på", async () => {
    vi.stubEnv("SAJTMASKIN_SITE_SUBSCRIPTION_CHECKOUT", "1");
    startSiteSubscriptionCheckout.mockResolvedValue({
      ok: true,
      sessionId: "cs_sub_1",
      url: "https://checkout.stripe.com/cs_sub_1",
      reused: false,
    });

    const response = await POST(
      postCheckout({
        projectId: "proj_1",
        amount: 1,
        billing_mode: "live",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessionId).toBe("cs_sub_1");
    expect(startSiteSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectId: "proj_1",
        billingMode: "test",
      }),
    );
    expect(createCreditCheckoutSession).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returnerar 400 utan projectId före projektuppslag", async () => {
    const response = await POST(postCheckout({ amount: 99 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "projectId saknas" });
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
