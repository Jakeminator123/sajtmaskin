import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const resolveDomainOffer = vi.hoisted(() => vi.fn());
const resolveChatProjectContext = vi.hoisted(() => vi.fn());
const getDomainOrderById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/config", () => ({
  FEATURES: { useDomainPurchase: true },
  SECRETS: { stripeSecretKey: "sk_test" },
  URLS: { baseUrl: "http://localhost" },
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/domains/registrar", () => ({ resolveDomainOffer }));
vi.mock("@/lib/domains/resolve-vercel-project", () => ({ resolveChatProjectContext }));
vi.mock("@/lib/db/services/domain-orders", () => ({
  DomainAlreadyOrderedError: class DomainAlreadyOrderedError extends Error {},
  attachStripeSession: vi.fn(),
  createPendingDomainOrder: vi.fn(),
  getDomainOrderById,
  PENDING_ORDER_TTL_MS: 60_000,
}));
vi.mock("stripe", () => ({
  default: class FakeStripe {
    checkout = { sessions: { create: vi.fn() } };
  },
}));

const { GET, POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/domains/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1", provider: "email" });
});

describe("POST /api/domains/purchase", () => {
  it.each([
    "good.-bad.com",
    "good.bad-.com",
    `${"a".repeat(64)}.com`,
    "example.com:443",
  ])("rejects an invalid domain before purchase work: %s", async (domain) => {
    const response = await POST(request({ domain, chatId: "chat_1" }));

    expect(response.status).toBe(400);
    expect(resolveChatProjectContext).not.toHaveBeenCalled();
    expect(resolveDomainOffer).not.toHaveBeenCalled();
  });

  it("rejects a non-string chat id before project resolution", async () => {
    const response = await POST(request({ domain: "example.com", chatId: 42 }));

    expect(response.status).toBe(400);
    expect(resolveChatProjectContext).not.toHaveBeenCalled();
    expect(resolveDomainOffer).not.toHaveBeenCalled();
  });

  it("rejects an oversized chat id before project resolution", async () => {
    const response = await POST(
      request({ domain: "example.com", chatId: "x".repeat(129) }),
    );

    expect(response.status).toBe(400);
    expect(resolveChatProjectContext).not.toHaveBeenCalled();
    expect(resolveDomainOffer).not.toHaveBeenCalled();
  });
});

describe("GET /api/domains/purchase", () => {
  it("rejects an oversized order id before database lookup", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/domains/purchase?orderId=${"x".repeat(129)}`),
    );

    expect(response.status).toBe(400);
    expect(getDomainOrderById).not.toHaveBeenCalled();
  });
});
