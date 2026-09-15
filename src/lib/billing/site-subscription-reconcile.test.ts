import { beforeEach, describe, expect, it, vi } from "vitest";

const getSiteSubscriptionById = vi.hoisted(() => vi.fn());
const updateSiteSubscription = vi.hoisted(() => vi.fn());
const updateBillingJob = vi.hoisted(() => vi.fn());
const pause = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getSiteSubscriptionById,
  updateSiteSubscription,
  updateBillingJob,
  getOpenBillingJob: vi.fn(),
  insertBillingJob: vi.fn(),
  listRunnableBillingJobs: vi.fn(),
  listSubscriptionsNeedingReconcile: vi.fn(),
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectById: vi.fn(async () => ({ vercel_project_id: "prj_cust" })),
}));

vi.mock("./site-subscription-hosting", () => ({
  getSiteHostingProvider: () => ({ pause, restore: vi.fn() }),
}));

const { processHostingJob } = await import("./site-subscription-reconcile");

const job = {
  id: "job_1",
  subscription_id: "sub_1",
  billing_mode: "test" as const,
  kind: "pause",
  status: "pending",
  attempts: 0,
  provider_ref: null,
  run_after: new Date("2026-09-15T12:00:00.000Z"),
  lease_owner: null,
  lease_expires_at: null,
  last_error: null,
  completed_at: null,
  created_at: new Date("2026-09-15T11:00:00.000Z"),
  updated_at: new Date("2026-09-15T11:00:00.000Z"),
  open_job_key: "pause:sub_1",
};

function row(desired: "active" | "paused") {
  return {
    id: "sub_1",
    billing_mode: "test",
    project_id: "prj_a",
    hosting_state_desired: desired,
    hosting_state_actual: "active",
    last_published_ref: "dpl:published",
    paused_at: null,
    resumed_at: null,
    retain_until: null,
    pause_requested_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateBillingJob.mockResolvedValue({});
  updateSiteSubscription.mockResolvedValue(row("paused"));
  pause.mockResolvedValue({
    ok: false,
    written: false,
    confirmed: false,
    code: "writes_disabled",
  });
});

describe("processHostingJob", () => {
  it("skippar ett gammalt pausjobb när desired blivit active igen", async () => {
    getSiteSubscriptionById
      .mockResolvedValueOnce(row("paused"))
      .mockResolvedValueOnce(row("active"));

    const result = await processHostingJob(job, new Date("2026-09-15T12:00:00.000Z"));

    expect(pause).not.toHaveBeenCalled();
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(result.reportSuccess).toBe(true);
    expect(updateBillingJob).toHaveBeenCalledWith(
      "job_1",
      expect.objectContaining({ status: "done", last_error: "stale_pause_after_reactivate" }),
    );
  });

  it("villkorar skrivningen på färsk desired efter provideranrop", async () => {
    getSiteSubscriptionById
      .mockResolvedValueOnce(row("paused"))
      .mockResolvedValueOnce(row("paused"))
      .mockResolvedValueOnce(row("paused"));
    pause.mockResolvedValue({
      ok: false,
      written: false,
      confirmed: false,
      code: "provider_error",
    });

    await processHostingJob(job, new Date("2026-09-15T12:00:00.000Z"));

    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_1",
      "test",
      expect.objectContaining({ hosting_state_actual: "pausing" }),
      { expectedDesired: "paused" },
    );
  });
});
