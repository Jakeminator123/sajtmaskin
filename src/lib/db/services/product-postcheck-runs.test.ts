import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

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
  getRunningProductPostcheckClaimForVersion,
  isProductPostcheckClaimExpired,
  isTakeoverEligibleProductPostcheckRow,
  lookupProductPostcheckRun,
  mapProductPostcheckResultToStatus,
  normalizeProductPostcheckClaimKey,
  normalizeProductPostcheckLifecycleToken,
  normalizeProductPostcheckMutationRevision,
  productPostcheckResultFromSettledClaim,
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
      false,
    );
    expect(isTakeoverEligibleProductPostcheckRow({ status: "superseded", expiresAt: future })).toBe(
      true,
    );
    const replay = productPostcheckResultFromSettledClaim({
      status: "passed",
      runId: "run_done",
      previewUrl: "https://preview.example",
      attestation: {
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        filesRevision: "rev_n",
      },
    });
    expect(replay.skipped).toBe(false);
    expect(replay.activeRunId).toBe("run_done");
    expect(replay.claimStatus).toBe("passed");
    expect(replay.attestation?.filesRevision).toBe("rev_n");
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

  it("passed/blocked/failed återtas inte — settled utan ny Chromium-slot", async () => {
    const done = row({
      run_id: "run_done",
      claim_generation: 2,
      status: "failed",
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
      status: "failed",
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("getRunningProductPostcheckClaimForVersion", () => {
  beforeEach(() => {
    execute.mockReset();
    dbConfigured.value = true;
  });

  it("returnerar live running-rad", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({
      rows: [row({ run_id: "run_live" })],
    });
    await expect(getRunningProductPostcheckClaimForVersion("v1")).resolves.toEqual({
      status: "running",
      runId: "run_live",
    });
  });

  it("saknad tabell är null, probe-fel kastar", async () => {
    execute.mockResolvedValueOnce({ rows: [{ oid: null }] });
    await expect(getRunningProductPostcheckClaimForVersion("v1")).resolves.toBeNull();

    execute.mockResolvedValueOnce({ rows: [] });
    await expect(getRunningProductPostcheckClaimForVersion("v1")).rejects.toThrow(
      /product_postcheck_runs unavailable/,
    );

    dbConfigured.value = false;
    await expect(getRunningProductPostcheckClaimForVersion("v1")).resolves.toBeNull();
  });
});

describe("read-only product claim lookup", () => {
  beforeEach(() => {
    execute.mockReset();
    dbConfigured.value = true;
  });
  const lookup = (key = KEY, chatId = "chat_1") => lookupProductPostcheckRun({ chatId, key });
  const queries = () => execute.mock.calls.map(([statement]) => new PgDialect().sqlToQuery(statement as SQL));
  const expectReadOnly = () => {
    for (const query of queries()) {
      expect(query.sql.trim()).toMatch(/^SELECT\b/i);
      expect(query.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    }
  };

  it("returns the current busy run without creating or taking over any claim", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({ rows: [row()] });
    await expect(lookup()).resolves.toEqual({ kind: "busy", runId: "run_active", claimGeneration: 1, status: "running" });
    expect(execute).toHaveBeenCalledTimes(2);
    expectReadOnly();
  });

  it.each(["passed", "blocked", "failed"])("replays settled %s even after expiry, without renewing it", async (status) => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({ rows: [row({ status, expires_at: new Date(0) })] });
    await expect(lookup()).resolves.toEqual({ kind: "settled", runId: "run_active", claimGeneration: 1, status });
    expectReadOnly();
  });

  it.each(["running", "superseded", "expired"])("does not reclaim an expired/reclaimable %s row", async (status) => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({ rows: [row({ status, expires_at: new Date(0) })] });
    await expect(lookup()).resolves.toEqual({ kind: "unclaimed" });
    expectReadOnly();
  });

  it("keeps unknown status conservative rather than granting new work authority", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({ rows: [row({ status: "unknown" })] });
    await expect(lookup()).resolves.toMatchObject({ kind: "busy" });
    expectReadOnly();
  });

  it.each([
    { ...KEY, versionId: "other-version" }, { ...KEY, filesRevision: "other-revision" },
    { ...KEY, previewSession: "other-session" }, { ...KEY, lifecycleToken: "other-lifecycle" },
    { ...KEY, mutationRevision: 3 },
  ])("queries the exact target tuple, and a mismatch (%j) remains unclaimed", async (key) => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({ rows: [] });
    await expect(lookup(key)).resolves.toEqual({ kind: "unclaimed" });
    expect(queries()[1].params).toEqual([
      key.versionId, key.filesRevision, key.previewSession, key.lifecycleToken, key.mutationRevision, "chat_1",
    ]);
    expectReadOnly();
  });

  it("also scopes replay to the chat, not just the version/revision tuple", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({ rows: [] });
    await expect(lookup(KEY, "other-chat")).resolves.toEqual({ kind: "unclaimed" });
    expect(queries()[1].sql).toContain("AND chat_id =");
    expect(queries()[1].params.at(-1)).toBe("other-chat");
    expectReadOnly();
  });

  it("fails closed on table absence and read errors", async () => {
    execute.mockResolvedValueOnce({ rows: [{ oid: null }] });
    await expect(lookup()).resolves.toEqual({ kind: "unavailable", reason: "missing" });
    execute.mockResolvedValueOnce(existsProbe()).mockRejectedValueOnce(new Error("offline read failure"));
    await expect(lookup()).resolves.toEqual({ kind: "unavailable", reason: "db_error" });
    expectReadOnly();
  });

  it("never probes or writes when the DB is not configured", async () => {
    dbConfigured.value = false;
    await expect(lookup()).resolves.toEqual({ kind: "unavailable", reason: "not_configured" });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([{ ...KEY, previewSession: "unbound" }, { ...KEY, filesRevision: " " }])(
    "does not invent a claim for a malformed target (%j)", async (key) => {
      execute.mockResolvedValueOnce(existsProbe());
      await expect(lookup(key)).resolves.toEqual({ kind: "unavailable", reason: "db_error" });
      expect(execute).toHaveBeenCalledTimes(1);
      expectReadOnly();
    },
  );
});
