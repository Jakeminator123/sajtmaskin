import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_POSTCHECK_CLAIM_LEASE_MS,
  claimProductPostcheckRun,
  decideProductPostcheckClaim,
  normalizeProductPostcheckLifecycleToken,
  productPostcheckLeaseExpiresAt,
  productPostcheckRunsTableExists,
  type ProductPostcheckRunRow,
} from "./product-postcheck-runs";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

const dbExecute = vi.hoisted(() => vi.fn());
const insertReturning = vi.hoisted(() => vi.fn());
const selectLimit = vi.hoisted(() => vi.fn());
const updateReturning = vi.hoisted(() => vi.fn());
const dbConfigured = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/db/client", () => ({
  get dbConfigured() {
    return dbConfigured.value;
  },
  db: {
    execute: (...args: unknown[]) => dbExecute(...args),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: insertReturning,
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: selectLimit,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: updateReturning,
        }),
      }),
    }),
  },
}));

function completedResult(
  overrides: Partial<ProductPostcheckResult> = {},
): ProductPostcheckResult {
  return {
    ok: true,
    skipped: false,
    skippedReason: null,
    warnings: [],
    warningCount: 0,
    productBlocked: false,
    routesChecked: 1,
    durationMs: 12,
    checkedUrl: "https://preview.example/chat_1",
    attestation: {
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      filesRevision: "rev_n",
    },
    verificationRunId: "run_1",
    ...overrides,
  };
}

function skippedResult(reason: ProductPostcheckResult["skippedReason"]): ProductPostcheckResult {
  return completedResult({
    skipped: true,
    skippedReason: reason,
    routesChecked: 0,
    durationMs: 1,
  });
}

function row(overrides: Partial<ProductPostcheckRunRow> = {}): ProductPostcheckRunRow {
  const claimedAt = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: "ppr_1",
    chatId: "chat_1",
    versionId: "v1",
    filesRevision: "rev_n",
    previewSessionId: "ps_n",
    lifecycleToken: "life_n",
    verificationRunId: "run_1",
    status: "running",
    skipReason: null,
    result: null,
    claimedAt,
    leaseExpiresAt: productPostcheckLeaseExpiresAt(claimedAt),
    completedAt: null,
    expiresAt: new Date("2026-09-08T00:00:00.000Z"),
    ...overrides,
  };
}

describe("decideProductPostcheckClaim", () => {
  it("cachear completed och produkt-skip", () => {
    expect(
      decideProductPostcheckClaim(
        row({ status: "completed", result: completedResult() }),
      ).kind,
    ).toBe("cached");
    expect(
      decideProductPostcheckClaim(
        row({
          status: "skipped",
          skipReason: "preview_not_running",
          result: skippedResult("preview_not_running"),
        }),
      ).kind,
    ).toBe("cached");
  });

  it("låter simultan körning vänta, stale lease tas över", () => {
    const now = new Date("2026-09-01T00:02:00.000Z");
    expect(decideProductPostcheckClaim(row(), now)).toEqual({ kind: "in_flight" });
    expect(
      decideProductPostcheckClaim(
        row({
          claimedAt: new Date(now.getTime() - PRODUCT_POSTCHECK_CLAIM_LEASE_MS),
          leaseExpiresAt: now,
        }),
        now,
      ),
    ).toEqual({ kind: "takeover" });
  });

  it("tar över infrastruktur-skip så en klientretry kan köra", () => {
    expect(
      decideProductPostcheckClaim(
        row({
          status: "skipped",
          skipReason: "playwright_unavailable",
          result: skippedResult("playwright_unavailable"),
        }),
      ),
    ).toEqual({ kind: "takeover" });
    expect(
      decideProductPostcheckClaim(
        row({
          status: "skipped",
          skipReason: "browser_crashed",
          result: skippedResult("browser_crashed"),
        }),
      ),
    ).toEqual({ kind: "takeover" });
  });

  it("normaliserar null lifecycleToken till tom sträng för claim-nyckeln", () => {
    expect(normalizeProductPostcheckLifecycleToken(null)).toBe("");
    expect(normalizeProductPostcheckLifecycleToken("  life_n  ")).toBe("life_n");
  });
});

describe("claimProductPostcheckRun", () => {
  beforeEach(() => {
    dbConfigured.value = true;
    dbExecute.mockReset();
    insertReturning.mockReset();
    selectLimit.mockReset();
    updateReturning.mockReset();
    dbExecute.mockResolvedValue({ rows: [{ oid: "product_postcheck_runs" }] });
  });

  it("returnerar acquired vid lyckad insert", async () => {
    const claimedAt = new Date("2026-09-01T00:00:00.000Z");
    insertReturning.mockResolvedValue([
      {
        id: "ppr_new",
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        verificationRunId: "run_1",
        status: "running",
        skipReason: null,
        result: null,
        claimedAt,
        leaseExpiresAt: productPostcheckLeaseExpiresAt(claimedAt),
        completedAt: null,
        expiresAt: new Date("2026-09-08T00:00:00.000Z"),
      },
    ]);

    const claimed = await claimProductPostcheckRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      verificationRunId: "run_1",
    });
    expect(claimed?.kind).toBe("acquired");
    expect(insertReturning).toHaveBeenCalled();
  });

  it("samma claim-tuple ⇒ in_flight när en running-rad redan finns", async () => {
    insertReturning.mockResolvedValue([]);
    const claimedAt = new Date();
    selectLimit.mockResolvedValue([
      {
        id: "ppr_existing",
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        verificationRunId: "run_1",
        status: "running",
        skipReason: null,
        result: null,
        claimedAt,
        leaseExpiresAt: productPostcheckLeaseExpiresAt(claimedAt),
        completedAt: null,
        expiresAt: new Date("2026-09-08T00:00:00.000Z"),
      },
    ]);

    const claimed = await claimProductPostcheckRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      verificationRunId: "run_2",
    });
    expect(claimed?.kind).toBe("in_flight");
  });

  it("annan lifecycleToken eller previewSessionId är en annan claim-nyckel (insert tillåts)", async () => {
    const claimedAt = new Date();
    insertReturning.mockResolvedValue([
      {
        id: "ppr_other",
        chatId: "chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_other",
        lifecycleToken: "life_other",
        verificationRunId: "run_2",
        status: "running",
        skipReason: null,
        result: null,
        claimedAt,
        leaseExpiresAt: productPostcheckLeaseExpiresAt(claimedAt),
        completedAt: null,
        expiresAt: new Date("2026-09-08T00:00:00.000Z"),
      },
    ]);

    const claimed = await claimProductPostcheckRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_other",
      lifecycleToken: "life_other",
      verificationRunId: "run_2",
    });
    expect(claimed?.kind).toBe("acquired");
  });

  it("saknad tabell ⇒ null (fail-open, inte block)", async () => {
    dbExecute.mockResolvedValue({ rows: [{ oid: null }] });
    const claimed = await claimProductPostcheckRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      verificationRunId: "run_1",
    });
    expect(claimed).toBeNull();
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it("42P01 under insert ⇒ null (fail-open)", async () => {
    insertReturning.mockRejectedValue(
      Object.assign(new Error('relation "product_postcheck_runs" does not exist'), {
        code: "42P01",
      }),
    );
    const claimed = await claimProductPostcheckRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      verificationRunId: "run_1",
    });
    expect(claimed).toBeNull();
  });

  it("dbConfigured=false ⇒ null utan query", async () => {
    dbConfigured.value = false;
    const claimed = await claimProductPostcheckRun({
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      verificationRunId: "run_1",
    });
    expect(claimed).toBeNull();
    expect(dbExecute).not.toHaveBeenCalled();
  });
});

describe("productPostcheckRunsTableExists", () => {
  beforeEach(() => {
    dbConfigured.value = true;
    dbExecute.mockReset();
  });

  it("är true när to_regclass hittar tabellen", async () => {
    dbExecute.mockResolvedValue({ rows: [{ oid: "product_postcheck_runs" }] });
    await expect(productPostcheckRunsTableExists()).resolves.toBe(true);
  });

  it("är false när to_regclass returnerar null", async () => {
    dbExecute.mockResolvedValue({ rows: [{ oid: null }] });
    await expect(productPostcheckRunsTableExists()).resolves.toBe(false);
  });
});
