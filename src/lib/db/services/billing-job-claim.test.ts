import { beforeEach, describe, expect, it, vi } from "vitest";

const updateWhereSpy = vi.hoisted(() => vi.fn());
const returningRows = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: () => ({
        where: (clause: unknown) => {
          updateWhereSpy(clause);
          return { returning: () => returningRows() };
        },
      }),
    }),
  },
}));

const { claimRunnableBillingJob, isBillingJobClaimable, isRunnableBillingJob } =
  await import("./site-subscriptions");

function flattenSql(node: unknown): string {
  if (node == null) return "";
  if (node instanceof Date) return node.toISOString();
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node !== "object") return "";
  const rec = node as Record<string, unknown>;
  if (Array.isArray(rec.value)) return rec.value.map(flattenSql).join("");
  if (rec.value instanceof Date) return rec.value.toISOString();
  if (typeof rec.value === "string" || typeof rec.value === "number") return String(rec.value);
  if (typeof rec.name === "string" && "columnType" in rec) return rec.name;
  if (Array.isArray(rec.queryChunks)) return rec.queryChunks.map(flattenSql).join("");
  return "";
}

function claimWhereHasRunAfterGate(clause: unknown): boolean {
  return /\brun_after\s*<=/.test(flattenSql(clause));
}

const now = new Date("2026-09-15T12:00:00.000Z");

describe("isBillingJobClaimable", () => {
  it("släpper in pending och utgången running-lease", () => {
    expect(isBillingJobClaimable({ status: "pending", leaseExpiresAt: null, now })).toBe(true);
    expect(
      isBillingJobClaimable({
        status: "running",
        leaseExpiresAt: new Date("2026-09-15T11:59:00.000Z"),
        now,
      }),
    ).toBe(true);
  });

  it("stänger avslutade jobb och en giltig running-lease", () => {
    expect(
      isBillingJobClaimable({
        status: "running",
        leaseExpiresAt: new Date("2026-09-15T12:01:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      isBillingJobClaimable({
        status: "done",
        leaseExpiresAt: new Date("2026-09-15T11:00:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      isBillingJobClaimable({
        status: "failed",
        leaseExpiresAt: new Date("2026-09-15T11:00:00.000Z"),
        now,
      }),
    ).toBe(true);
  });
});

describe("isRunnableBillingJob", () => {
  it("återförsöker failed jobb efter backoff", () => {
    expect(
      isRunnableBillingJob({
        status: "failed",
        runAfter: new Date("2026-09-15T11:45:00.000Z"),
        leaseExpiresAt: new Date("2026-09-15T11:00:00.000Z"),
        now,
      }),
    ).toBe(true);
    expect(
      isRunnableBillingJob({
        status: "failed",
        runAfter: new Date("2026-09-15T12:15:00.000Z"),
        leaseExpiresAt: new Date("2026-09-15T11:00:00.000Z"),
        now,
      }),
    ).toBe(false);
  });
});

describe("claimRunnableBillingJob stale-list race", () => {
  beforeEach(() => {
    updateWhereSpy.mockClear();
    returningRows.mockReset();
    returningRows.mockResolvedValue([]);
  });

  it("vägrar claima ett failed jobb medan run_after fortfarande ligger i framtiden", async () => {
    const listedAt = new Date("2026-09-15T12:00:00.000Z");
    const staleClaimAt = new Date("2026-09-15T12:05:00.000Z");
    const backoffUntil = new Date(listedAt.getTime() + 15 * 60_000);
    const failedAfterWorkerA = {
      id: "job_race",
      status: "failed",
      run_after: backoffUntil,
      attempts: 1,
    };

    returningRows.mockImplementation(async () => {
      const clause = updateWhereSpy.mock.calls.at(-1)?.[0];
      if (!claimWhereHasRunAfterGate(clause)) {
        return [{ ...failedAfterWorkerA, status: "running" }];
      }
      if (failedAfterWorkerA.run_after.getTime() > staleClaimAt.getTime()) {
        return [];
      }
      return [{ ...failedAfterWorkerA, status: "running" }];
    });

    const claimed = await claimRunnableBillingJob("job_race", staleClaimAt, "worker-b");

    expect(claimWhereHasRunAfterGate(updateWhereSpy.mock.calls.at(-1)?.[0])).toBe(true);
    expect(claimed).toBeNull();
  });

  it("släpper in failed jobb när backoff har löpt ut", async () => {
    const nowAfterBackoff = new Date("2026-09-15T12:15:00.000Z");
    returningRows.mockResolvedValue([
      {
        id: "job_due",
        status: "running",
        run_after: new Date("2026-09-15T12:00:00.000Z"),
      },
    ]);

    const claimed = await claimRunnableBillingJob("job_due", nowAfterBackoff, "worker-b");

    expect(claimWhereHasRunAfterGate(updateWhereSpy.mock.calls.at(-1)?.[0])).toBe(true);
    expect(claimed?.id).toBe("job_due");
  });
});
