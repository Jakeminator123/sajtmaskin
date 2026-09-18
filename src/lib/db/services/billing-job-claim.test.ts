import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredJob = {
  id: string;
  status: string;
  run_after: Date;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
};

const { updateWhereSpy, jobStore, extractRunAfterGate } = vi.hoisted(
  () => {
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

    function extractRunAfterGate(clause: unknown): Date | null {
      const match = flattenSql(clause).match(/run_after\s*<=\s*(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/);
      if (!match) return null;
      const parsed = Date.parse(match[1]);
      return Number.isNaN(parsed) ? null : new Date(parsed);
    }

    function isStoreJobClaimable(job: StoredJob, now: Date): boolean {
      if (job.status === "pending" || job.status === "failed") return true;
      if (job.status === "running") {
        return !job.lease_expires_at || job.lease_expires_at.getTime() <= now.getTime();
      }
      return false;
    }

    function applyAtomicClaim(job: StoredJob | null, clause: unknown): StoredJob | null {
      if (!job) return null;
      const sql = flattenSql(clause);
      if (!sql.includes(job.id)) return null;
      const gate = extractRunAfterGate(clause);
      if (!gate) {
        return {
          ...job,
          status: "running",
          attempts: job.attempts + 1,
        };
      }
      if (job.run_after.getTime() > gate.getTime()) return null;
      if (!isStoreJobClaimable(job, gate)) return null;
      return {
        ...job,
        status: "running",
        attempts: job.attempts + 1,
        lease_owner: "claimed",
        lease_expires_at: new Date(gate.getTime() + 60_000),
      };
    }

    return {
      updateWhereSpy: vi.fn(),
      jobStore: { current: null as StoredJob | null },
      extractRunAfterGate,
      applyAtomicClaim,
    };
  },
);

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: () => ({
        where: (clause: unknown) => {
          updateWhereSpy(clause);
          return {
            returning: () => {
              const claimed = applyAtomicClaim(jobStore.current, clause);
              if (claimed) jobStore.current = claimed;
              return Promise.resolve(claimed ? [claimed] : []);
            },
          };
        },
      }),
    }),
  },
}));

const { claimRunnableBillingJob, isBillingJobClaimable, isRunnableBillingJob } =
  await import("./site-subscriptions");

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
    jobStore.current = null;
  });

  it("låter inte worker B reclaima via stale lista innan 15-minutersbackoff", async () => {
    const listedAt = new Date("2026-09-15T12:00:00.000Z");
    const staleClaimAt = new Date("2026-09-15T12:05:00.000Z");
    const backoffUntil = new Date(listedAt.getTime() + 15 * 60_000);

    jobStore.current = {
      id: "job_race",
      status: "pending",
      run_after: listedAt,
      attempts: 0,
      lease_owner: null,
      lease_expires_at: null,
    };

    const listSnapshot = {
      status: jobStore.current.status,
      runAfter: jobStore.current.run_after,
      leaseExpiresAt: jobStore.current.lease_expires_at,
      now: listedAt,
    };
    const workerAList = [{ id: jobStore.current.id, ...listSnapshot }];
    const workerBList = [{ id: jobStore.current.id, ...listSnapshot }];

    expect(isRunnableBillingJob(workerAList[0])).toBe(true);
    expect(isRunnableBillingJob(workerBList[0])).toBe(true);
    expect(workerAList[0].id).toBe(workerBList[0].id);

    const claimedByA = await claimRunnableBillingJob(workerAList[0].id, listedAt, "worker-a");
    expect(extractRunAfterGate(updateWhereSpy.mock.calls.at(-1)?.[0])?.getTime()).toBe(
      listedAt.getTime(),
    );
    expect(claimedByA?.status).toBe("running");
    expect(jobStore.current?.attempts).toBe(1);

    jobStore.current = {
      ...jobStore.current!,
      status: "failed",
      run_after: backoffUntil,
      lease_owner: null,
      lease_expires_at: null,
    };

    const claimedByBEarly = await claimRunnableBillingJob(
      workerBList[0].id,
      staleClaimAt,
      "worker-b",
    );
    expect(extractRunAfterGate(updateWhereSpy.mock.calls.at(-1)?.[0])?.getTime()).toBe(
      staleClaimAt.getTime(),
    );
    expect(claimedByBEarly).toBeNull();
    expect(jobStore.current.status).toBe("failed");
    expect(jobStore.current.run_after.getTime()).toBe(backoffUntil.getTime());

    const claimedByBLate = await claimRunnableBillingJob(
      workerBList[0].id,
      backoffUntil,
      "worker-b",
    );
    expect(extractRunAfterGate(updateWhereSpy.mock.calls.at(-1)?.[0])?.getTime()).toBe(
      backoffUntil.getTime(),
    );
    expect(claimedByBLate?.id).toBe("job_race");
    expect(claimedByBLate?.status).toBe("running");
    expect(jobStore.current.attempts).toBe(2);
  });
});
