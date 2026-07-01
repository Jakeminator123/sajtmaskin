import { beforeEach, describe, expect, it, vi } from "vitest";

import { STALE_VERIFICATION_TIMEOUT_MS } from "@/lib/gen/defaults";

const failVersionVerificationIfUnleased = vi.fn();
const leaseTableExists = vi.fn();

// Mock the DB module so importing the settle helper does not require a live
// connection (`@/lib/db/chat-repository-pg` throws at import time otherwise).
vi.mock("@/lib/db/chat-repository-pg", () => ({
  failVersionVerificationIfUnleased: (...args: unknown[]) =>
    failVersionVerificationIfUnleased(...args),
  leaseTableExists: (...args: unknown[]) => leaseTableExists(...args),
}));

import { settleStaleVerificationIfNeeded } from "./settle-stale-verification";

type TestVersion = Parameters<typeof settleStaleVerificationIfNeeded>[0];

function makeVersion(overrides: Record<string, unknown> = {}): TestVersion {
  return {
    id: "v1",
    verification_state: "verifying",
    created_at: new Date(Date.now() - STALE_VERIFICATION_TIMEOUT_MS - 10_000).toISOString(),
    ...overrides,
  } as unknown as TestVersion;
}

beforeEach(() => {
  failVersionVerificationIfUnleased.mockReset();
  leaseTableExists.mockReset();
});

describe("settleStaleVerificationIfNeeded", () => {
  it("no-ops for a fresh (non-stale) version", async () => {
    const v = makeVersion({ created_at: new Date().toISOString() });
    const res = await settleStaleVerificationIfNeeded(v);
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("fails a stale verifying version (lease-safe) and returns the updated row", async () => {
    const updated = makeVersion({ verification_state: "failed" });
    failVersionVerificationIfUnleased.mockResolvedValue(updated);
    const res = await settleStaleVerificationIfNeeded(makeVersion());
    expect(res.failed).toBe(true);
    expect(res.version).toBe(updated);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("keeps the version unchanged when the lease guard no-ops the fail", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(null);
    const v = makeVersion();
    const res = await settleStaleVerificationIfNeeded(v);
    expect(res.failed).toBe(false);
    expect(res.version).toBe(v);
  });

  it("skips a stale 'repairing' row when the lease table is absent (legacy fallback)", async () => {
    leaseTableExists.mockResolvedValue(false);
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "repairing" }),
    );
    expect(res.failed).toBe(false);
    expect(leaseTableExists).toHaveBeenCalledOnce();
    expect(failVersionVerificationIfUnleased).not.toHaveBeenCalled();
  });

  it("fails a stale 'repairing' row once the lease table exists", async () => {
    leaseTableExists.mockResolvedValue(true);
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    const res = await settleStaleVerificationIfNeeded(
      makeVersion({ verification_state: "repairing" }),
    );
    expect(res.failed).toBe(true);
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledOnce();
  });

  it("prefers the resolved concrete failure summary over the generic copy", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveFailureSummary: () => "Typecheck misslyckades: X",
    });
    expect(failVersionVerificationIfUnleased).toHaveBeenCalledWith("v1", "Typecheck misslyckades: X");
  });

  it("falls back to the generic summary when no concrete one is resolved", async () => {
    failVersionVerificationIfUnleased.mockResolvedValue(
      makeVersion({ verification_state: "failed" }),
    );
    await settleStaleVerificationIfNeeded(makeVersion(), {
      resolveFailureSummary: () => null,
    });
    const [, summary] = failVersionVerificationIfUnleased.mock.calls[0];
    expect(String(summary)).toContain("tog för lång tid");
  });
});
