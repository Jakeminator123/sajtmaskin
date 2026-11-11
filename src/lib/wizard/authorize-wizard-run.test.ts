import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, resetMemoryRateLimitStoreForTests } from "@/lib/rate-limit";

const getCurrentUser = vi.hoisted(() => vi.fn());
const requireActiveWizardRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/wizard-runs", () => ({ requireActiveWizardRun }));

const { authorizeWizardRun } = await import("./authorize-wizard-run");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";

describe("authorizeWizardRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryRateLimitStoreForTests();
    for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
      vi.stubEnv(key, "");
    }
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => vi.unstubAllEnvs());

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

  it("shares the existing AI allowance across rotated IPs, wizard routes and new runs", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_a" });
    requireActiveWizardRun.mockImplementation(async (_userId, id) => ({
      ok: true, run: { id, user_id: "user_a", status: "active" },
    }));
    const routes = ["enrich", "competitors", "company-lookup"];
    for (let index = 0; index < RATE_LIMITS["ai:chat"].maxRequests; index += 1) {
      const request = new Request(`https://example.test/api/wizard/${routes[index % routes.length]}`, {
        headers: { "x-real-ip": `203.0.113.${index + 1}` },
      });
      expect((await authorizeWizardRun(request, WIZARD_RUN_ID)).ok).toBe(true);
    }
    const request = new Request("https://example.test/api/wizard/enrich", {
      headers: { "x-real-ip": "198.51.100.1" },
    });
    const exhausted = await authorizeWizardRun(request, "22222222-2222-4222-8222-222222222222");
    expect(exhausted.ok).toBe(false);
    if (exhausted.ok) return;
    expect(exhausted.response.status).toBe(429);
    expect(exhausted.response.headers.get("Retry-After")).toBeTruthy();
    getCurrentUser.mockResolvedValue({ id: "user_b" });
    expect((await authorizeWizardRun(request, WIZARD_RUN_ID)).ok).toBe(true);
  });
});
