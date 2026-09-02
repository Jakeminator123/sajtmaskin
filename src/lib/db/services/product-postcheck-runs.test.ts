import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
const dbConfigured = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/db/client", () => ({
  get dbConfigured() {
    return dbConfigured.value;
  },
  db: {
    execute: (...args: unknown[]) => execute(...args),
  },
}));

import {
  claimProductPostcheckRun,
  completeProductPostcheckRun,
  isProductPostcheckClaimExpired,
  isTakeoverEligibleProductPostcheckRow,
  mapProductPostcheckResultToStatus,
  normalizeProductPostcheckClaimKey,
  normalizeProductPostcheckLifecycleToken,
  normalizeProductPostcheckMutationRevision,
  productPostcheckRunsTablePresence,
} from "./product-postcheck-runs";

const KEY = {
  versionId: "v1",
  filesRevision: "rev_n",
  previewSession: "ps_n",
  lifecycleToken: "life_n",
  mutationRevision: 2,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run_active",
    owner: "user_1",
    claim_generation: 1,
    status: "running",
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function existsProbe() {
  return { rows: [{ oid: "oid" }] };
}

describe("product-postcheck claim key helpers", () => {
  it("normalizes blank lifecycle and non-positive mutation to UNIQUE sentinels", () => {
    expect(normalizeProductPostcheckLifecycleToken(null)).toBe("");
    expect(normalizeProductPostcheckLifecycleToken("  ")).toBe("");
    expect(normalizeProductPostcheckMutationRevision(null)).toBe(0);
    expect(normalizeProductPostcheckMutationRevision(0)).toBe(0);
    expect(normalizeProductPostcheckMutationRevision(3)).toBe(3);
    expect(normalizeProductPostcheckClaimKey(KEY)).toEqual({
      versionId: "v1",
      filesRevision: "rev_n",
      previewSession: "ps_n",
      lifecycleToken: "life_n",
      mutationRevision: 2,
    });
  });

  it("maps result → status and takeover eligibility", () => {
    expect(
      mapProductPostcheckResultToStatus({
        skipped: false,
        skippedReason: null,
        productBlocked: false,
      }),
    ).toBe("passed");
    expect(
      mapProductPostcheckResultToStatus({
        skipped: false,
        skippedReason: null,
        productBlocked: true,
      }),
    ).toBe("blocked");
    expect(
      mapProductPostcheckResultToStatus({
        skipped: true,
        skippedReason: "preview_superseded",
        productBlocked: false,
      }),
    ).toBe("superseded");
    expect(
      mapProductPostcheckResultToStatus({
        skipped: true,
        skippedReason: "playwright_unavailable",
        productBlocked: false,
      }),
    ).toBe("failed");
    const future = new Date(Date.now() + 10_000);
    const past = new Date(Date.now() - 10_000);
    expect(isProductPostcheckClaimExpired(future)).toBe(false);
    expect(isProductPostcheckClaimExpired(past)).toBe(true);
    expect(isTakeoverEligibleProductPostcheckRow({ status: "running", expiresAt: future })).toBe(
      false,
    );
    expect(isTakeoverEligibleProductPostcheckRow({ status: "running", expiresAt: past })).toBe(
      true,
    );
    expect(isTakeoverEligibleProductPostcheckRow({ status: "passed", expiresAt: future })).toBe(
      false,
    );
    expect(isTakeoverEligibleProductPostcheckRow({ status: "blocked", expiresAt: future })).toBe(
      false,
    );
    expect(isTakeoverEligibleProductPostcheckRow({ status: "failed", expiresAt: future })).toBe(
      true,
    );
  });
});

describe("claimProductPostcheckRun", () => {
  beforeEach(() => {
    execute.mockReset();
    dbConfigured.value = true;
  });

  it("(a) andra claimen mot samma nyckel blir busy med den aktivas run-id", async () => {
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [row({ run_id: "run_winner" })] })
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ run_id: "run_winner" })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ run_id: "run_winner" })] });

    const first = await claimProductPostcheckRun({
      chatId: "chat_1",
      owner: "user_1",
      key: KEY,
    });
    const second = await claimProductPostcheckRun({
      chatId: "chat_1",
      owner: "user_2",
      key: KEY,
    });

    expect(first).toEqual({
      kind: "acquired",
      runId: "run_winner",
      claimGeneration: 1,
      owner: "user_1",
    });
    expect(second).toEqual({
      kind: "busy",
      runId: "run_winner",
      claimGeneration: 1,
      status: "running",
    });
  });

  it("(b) DB-fel vid claim → unavailable, ingen acquired", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockRejectedValueOnce(new Error("pool timeout"));
    const claim = await claimProductPostcheckRun({
      chatId: "chat_1",
      owner: "user_1",
      key: KEY,
    });
    expect(claim).toEqual({ kind: "unavailable", reason: "db_error" });
  });

  it("saknad tabell eller otillgänglig probe är fail-closed", async () => {
    execute.mockResolvedValueOnce({ rows: [{ oid: null }] });
    expect(await productPostcheckRunsTablePresence()).toBe("missing");
    execute.mockResolvedValueOnce({ rows: [] });
    expect(await productPostcheckRunsTablePresence()).toBe("unavailable");
    execute.mockRejectedValueOnce(new Error("timeout"));
    expect(await productPostcheckRunsTablePresence()).toBe("unavailable");

    execute.mockResolvedValueOnce({ rows: [{ oid: null }] });
    expect(
      await claimProductPostcheckRun({ chatId: "chat_1", owner: "user_1", key: KEY }),
    ).toEqual({ kind: "unavailable", reason: "missing" });

    dbConfigured.value = false;
    expect(
      await claimProductPostcheckRun({ chatId: "chat_1", owner: "user_1", key: KEY }),
    ).toEqual({ kind: "unavailable", reason: "not_configured" });
  });

  it("(c) takeover före expiry avvisas — generation oförändrad", async () => {
    const live = row({ claim_generation: 4, run_id: "run_live" });
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [live] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [live] });

    const claim = await claimProductPostcheckRun({
      chatId: "chat_1",
      owner: "intruder",
      key: KEY,
    });
    expect(claim).toEqual({
      kind: "busy",
      runId: "run_live",
      claimGeneration: 4,
      status: "running",
    });
  });

  it("(d) takeover efter expiry lyckas och bumpar generation", async () => {
    const stale = row({
      claim_generation: 4,
      run_id: "run_old",
      expires_at: new Date(Date.now() - 1_000),
    });
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [stale] })
      .mockResolvedValueOnce({
        rows: [row({ run_id: "run_new", owner: "intruder", claim_generation: 5 })],
      });

    const claim = await claimProductPostcheckRun({
      chatId: "chat_1",
      owner: "intruder",
      key: KEY,
    });
    expect(claim).toEqual({
      kind: "acquired",
      runId: "run_new",
      claimGeneration: 5,
      owner: "intruder",
    });
  });

  it("passed/blocked återtas inte — settled utan ny Chromium-slot", async () => {
    const done = row({
      run_id: "run_done",
      claim_generation: 2,
      status: "passed",
    });
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [done] });

    const claim = await claimProductPostcheckRun({
      chatId: "chat_1",
      owner: "resume",
      key: KEY,
    });
    expect(claim).toEqual({
      kind: "settled",
      runId: "run_done",
      claimGeneration: 2,
      status: "passed",
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("completeProductPostcheckRun CAS", () => {
  beforeEach(() => {
    execute.mockReset();
    dbConfigured.value = true;
  });

  it("(e) gammal ägares completion efter takeover → CAS-miss, no-op", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    expect(
      await completeProductPostcheckRun({
        runId: "run_old",
        claimGeneration: 1,
        status: "passed",
      }),
    ).toBe(false);
  });

  it("(f) completion med rätt generation skriver", async () => {
    execute.mockResolvedValueOnce({
      rows: [row({ run_id: "run_mine", claim_generation: 2, status: "passed" })],
    });
    expect(
      await completeProductPostcheckRun({
        runId: "run_mine",
        claimGeneration: 2,
        status: "passed",
      }),
    ).toBe(true);
  });
});
