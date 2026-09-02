import { beforeEach, describe, expect, it, vi } from "vitest";

const requireNotBot = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const completeWizardRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bot-protection", () => ({ requireNotBot }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/wizard-runs", () => ({ completeWizardRun }));

const { POST } = await import("./route");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/wizard/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/wizard/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNotBot.mockReturnValue(null);
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    completeWizardRun.mockResolvedValue({
      ok: true,
      run: { id: WIZARD_RUN_ID, status: "completed" },
    });
  });

  it("rejects unauthenticated callers", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await POST(makeRequest({ wizardRunId: WIZARD_RUN_ID }));
    expect(response.status).toBe(401);
    expect(completeWizardRun).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid payload before touching the run", async () => {
    const response = await POST(makeRequest({ wizardRunId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(completeWizardRun).not.toHaveBeenCalled();
  });

  it("marks the owned run completed", async () => {
    const response = await POST(makeRequest({ wizardRunId: WIZARD_RUN_ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      wizardRunId: WIZARD_RUN_ID,
      status: "completed",
    });
    expect(completeWizardRun).toHaveBeenCalledWith("user_1", WIZARD_RUN_ID);
  });

  it("forwards ownership and state denials", async () => {
    completeWizardRun.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Ogiltig wizard-körning.",
    });
    const foreign = await POST(makeRequest({ wizardRunId: WIZARD_RUN_ID }));
    expect(foreign.status).toBe(403);

    completeWizardRun.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Wizard-körningen är avslutad.",
    });
    const done = await POST(makeRequest({ wizardRunId: WIZARD_RUN_ID }));
    expect(done.status).toBe(409);
  });
});
