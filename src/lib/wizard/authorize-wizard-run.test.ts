import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const requireActiveWizardRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/wizard-runs", () => ({ requireActiveWizardRun }));

const { authorizeWizardRun } = await import("./authorize-wizard-run");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";

describe("authorizeWizardRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the caller is not signed in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const result = await authorizeWizardRun(new Request("https://example.test"), WIZARD_RUN_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(requireActiveWizardRun).not.toHaveBeenCalled();
  });

  it("returns 403 for an invented or foreign run without treating it as entitled", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_b" });
    requireActiveWizardRun.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Ogiltig wizard-körning.",
    });
    const result = await authorizeWizardRun(new Request("https://example.test"), WIZARD_RUN_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toMatchObject({ wizardRunInvalid: true });
  });

  it("returns 409 for a completed or expired run", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_a" });
    requireActiveWizardRun.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Wizard-körningen är avslutad.",
    });
    const result = await authorizeWizardRun(new Request("https://example.test"), WIZARD_RUN_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
  });

  it("passes an active owned run", async () => {
    const user = { id: "user_a" };
    const run = { id: WIZARD_RUN_ID, user_id: "user_a", status: "active" };
    getCurrentUser.mockResolvedValue(user);
    requireActiveWizardRun.mockResolvedValue({ ok: true, run });
    const result = await authorizeWizardRun(new Request("https://example.test"), WIZARD_RUN_ID);
    expect(result).toEqual({ ok: true, user, run });
  });
});
