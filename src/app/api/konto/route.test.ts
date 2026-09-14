import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getUserTransactions = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/transactions", () => ({ getUserTransactions }));

const { GET } = await import("./route");

function request(search = ""): NextRequest {
  return new NextRequest(`http://localhost/api/konto${search}`);
}

describe("GET /api/konto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "anna@example.com",
      name: "Anna",
      provider: "google",
      diamonds: 42,
    });
    getUserTransactions.mockResolvedValue([
      {
        id: "tx_own",
        user_id: "user_1",
        type: "purchase",
        amount: 100,
        balance_after: 42,
        description: "Köp: starter",
        created_at: new Date("2026-09-10T08:00:00.000Z"),
      },
    ]);
  });

  it("returns 401 without a signed-in user and does not read the ledger", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET(request("?userId=user_1"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Du måste vara inloggad.",
    });
    expect(getUserTransactions).not.toHaveBeenCalled();
  });

  it("ignores a foreign userId query and scopes history to the session user", async () => {
    const response = await GET(request("?userId=user_other"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getUserTransactions).toHaveBeenCalledWith("user_1", 50);
    expect(getUserTransactions).not.toHaveBeenCalledWith("user_other", expect.anything());
    expect(body.account).toEqual({
      name: "Anna",
      email: "anna@example.com",
      loginMethod: "Google",
    });
    expect(body.credits).toEqual({ balance: 42 });
    expect(body.transactions).toEqual([
      {
        id: "tx_own",
        type: "purchase",
        amount: 100,
        balanceAfter: 42,
        description: "Köp: starter",
        createdAt: "2026-09-10T08:00:00.000Z",
      },
    ]);
    expect(body).not.toHaveProperty("subscription");
    expect(body).not.toHaveProperty("plan");
  });
});
