import { beforeEach, describe, expect, it, vi } from "vitest";

const requireNotBot = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const isTestUser = vi.hoisted(() => vi.fn(() => false));
const startWizardRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bot-protection", () => ({ requireNotBot }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/users", () => ({ isTestUser }));
vi.mock("@/lib/db/services/wizard-runs", () => ({ startWizardRun }));
vi.mock("@/lib/db/services/transactions", async () => {
  class InsufficientCreditsError extends Error {
    readonly required: number;
    readonly available: number;
    constructor(required: number, available: number) {
      super(`Insufficient credits: need ${required}, have ${available}`);
      this.name = "InsufficientCreditsError";
      this.required = required;
      this.available = available;
    }
  }
  return { InsufficientCreditsError };
});

const { POST } = await import("./route");
const { InsufficientCreditsError } = await import("@/lib/db/services/transactions");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(): Request {
  return new Request("http://localhost/api/wizard/start", { method: "POST" });
}

describe("POST /api/wizard/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNotBot.mockReturnValue(null);
    isTestUser.mockReturnValue(false);
    getCurrentUser.mockResolvedValue({ id: "user_1", diamonds: 22 });
    startWizardRun.mockResolvedValue({
      run: {
        id: WIZARD_RUN_ID,
        status: "active",
        expires_at: new Date("2026-09-02T00:00:00.000Z"),
      },
      reused: false,
      charged: true,
      cost: 11,
      balanceAfter: 11,
    });
  });

  it("rejects unauthenticated callers before creating a run", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(startWizardRun).not.toHaveBeenCalled();
  });

  it("creates a server-owned run and reports the single debit", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      wizardRunId: WIZARD_RUN_ID,
      charged: true,
      cost: 11,
      current: 11,
    });
    expect(startWizardRun).toHaveBeenCalledWith({ userId: "user_1", skipCharge: false });
  });

  it("does not invent a client UUID — the run id comes from the server", async () => {
    await POST(makeRequest());
    expect(startWizardRun).toHaveBeenCalledTimes(1);
    const body = await (await POST(makeRequest())).json();
    expect(body.wizardRunId).toBe(WIZARD_RUN_ID);
  });

  it("returns 402 without a usable run when the balance cannot cover the debit", async () => {
    startWizardRun.mockRejectedValue(new InsufficientCreditsError(11, 3));
    const response = await POST(makeRequest());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      insufficientCredits: true,
      required: 11,
      current: 3,
    });
  });
});
