import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const query = vi.hoisted(() => vi.fn());
const dbState = vi.hoisted(() => ({ configured: true }));

vi.mock("@/lib/db/client", () => ({
  get pool() {
    return dbState.configured ? { query } : null;
  },
  get dbConfigured() {
    return dbState.configured;
  },
}));

import {
  PRUNE_MIN_INTERVAL_MS,
  VERCEL_DRAIN_MAX_ROWS_PER_DELIVERY,
  VERCEL_DRAIN_MESSAGE_MAX_CHARS,
  claimPruneSlot,
  insertDrainLogs,
  isSelfDrainLog,
  normalizeVercelDrainLog,
  parseVercelDrainBody,
  pruneDrainLogs,
  resetPruneScheduleForTests,
  selectDrainRowsToStore,
  shouldPersistDrainLog,
  verifyVercelDrainSignature,
} from "./vercel-log-drain";

const SECRET = "test-drain-secret";

function sign(rawBody: string, secret = SECRET): string {
  return createHmac("sha1", secret).update(rawBody, "utf8").digest("hex");
}

/** Minimal valid log record; overrides win. */
function logRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "1573817187330377061717300000",
    deploymentId: "dpl_test",
    projectId: "prj_test",
    source: "lambda",
    host: "sajtmaskin.vercel.app",
    timestamp: 1573817187330,
    level: "info",
    ...overrides,
  };
}

beforeEach(() => {
  query.mockReset();
  dbState.configured = true;
  resetPruneScheduleForTests();
});

describe("verifyVercelDrainSignature", () => {
  it("accepts a body signed with the configured secret", () => {
    const body = JSON.stringify([logRecord()]);
    expect(
      verifyVercelDrainSignature({ rawBody: body, signatureHeader: sign(body), secret: SECRET }),
    ).toEqual({ ok: true });
  });

  it("rejects a signature made with a different secret", () => {
    const body = JSON.stringify([logRecord()]);
    const result = verifyVercelDrainSignature({
      rawBody: body,
      signatureHeader: sign(body, "other-secret"),
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects a body whose signature does not cover it", () => {
    const result = verifyVercelDrainSignature({
      rawBody: JSON.stringify([logRecord({ message: "tampered" })]),
      signatureHeader: sign(JSON.stringify([logRecord()])),
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing header without throwing", () => {
    const result = verifyVercelDrainSignature({
      rawBody: "[]",
      signatureHeader: null,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "missing x-vercel-signature" });
  });

  it("rejects a header of the wrong length in constant time", () => {
    // timingSafeEqual throws on length mismatch, so the length check must come
    // first — a short header must be a rejection, not a 500.
    const result = verifyVercelDrainSignature({
      rawBody: "[]",
      signatureHeader: "abc",
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "signature mismatch" });
  });
});

describe("parseVercelDrainBody", () => {
  it("parses a JSON array", () => {
    expect(parseVercelDrainBody(JSON.stringify([logRecord(), logRecord({ id: "2" })]))).toHaveLength(
      2,
    );
  });

  it("parses a single JSON object", () => {
    expect(parseVercelDrainBody(JSON.stringify(logRecord()))).toHaveLength(1);
  });

  it("parses NDJSON", () => {
    const ndjson = [
      JSON.stringify(logRecord({ id: "a" })),
      JSON.stringify(logRecord({ id: "b" })),
    ].join("\n");
    expect(parseVercelDrainBody(ndjson)).toHaveLength(2);
  });

  it("treats an empty body as zero records rather than an error", () => {
    expect(parseVercelDrainBody("   ")).toEqual([]);
  });

  it("returns null for a body that is not JSON at all", () => {
    expect(parseVercelDrainBody("not json")).toBeNull();
  });
});

describe("normalizeVercelDrainLog", () => {
  it("maps the schema fields onto row columns", () => {
    const row = normalizeVercelDrainLog(
      logRecord({
        level: "error",
        type: "stderr",
        message: "boom",
        path: "/api/engine/chats",
        statusCode: 500,
        requestId: "req_1",
        environment: "production",
        executionRegion: "arn1",
      }),
    );
    expect(row).toMatchObject({
      logId: "1573817187330377061717300000",
      level: "error",
      type: "stderr",
      message: "boom",
      path: "/api/engine/chats",
      statusCode: 500,
      requestId: "req_1",
      environment: "production",
      executionRegion: "arn1",
      deploymentId: "dpl_test",
      projectId: "prj_test",
    });
    expect(row?.logTimestamp?.toISOString()).toBe(new Date(1573817187330).toISOString());
  });

  it("falls back to proxy.path and proxy.statusCode", () => {
    const row = normalizeVercelDrainLog(
      logRecord({ proxy: { path: "/api/thing?page=1", statusCode: 502 } }),
    );
    expect(row?.path).toBe("/api/thing?page=1");
    expect(row?.statusCode).toBe(502);
  });

  it("drops proxy.clientIp from the stored payload", () => {
    const row = normalizeVercelDrainLog(
      logRecord({ proxy: { path: "/x", clientIp: "120.75.16.101", region: "arn1" } }),
    );
    const payload = row?.payload as { proxy: Record<string, unknown> };
    expect(payload.proxy).not.toHaveProperty("clientIp");
    expect(payload.proxy.region).toBe("arn1");
  });

  it("truncates an oversized message in both the column and the payload", () => {
    const long = "x".repeat(VERCEL_DRAIN_MESSAGE_MAX_CHARS + 500);
    const row = normalizeVercelDrainLog(logRecord({ message: long }));
    expect(row?.message?.length).toBe(VERCEL_DRAIN_MESSAGE_MAX_CHARS + 1);
    const payload = row?.payload as { message: string };
    expect(payload.message.length).toBe(VERCEL_DRAIN_MESSAGE_MAX_CHARS + 1);
  });

  it("returns null for a record without an id", () => {
    expect(normalizeVercelDrainLog({ level: "error" })).toBeNull();
    expect(normalizeVercelDrainLog(null)).toBeNull();
    expect(normalizeVercelDrainLog(["not", "an", "object"])).toBeNull();
  });
});

describe("shouldPersistDrainLog", () => {
  function row(overrides: Record<string, unknown>) {
    const normalized = normalizeVercelDrainLog(logRecord(overrides));
    if (!normalized) throw new Error("fixture did not normalize");
    return normalized;
  }

  it("keeps error, warning and fatal levels", () => {
    for (const level of ["error", "warning", "fatal"]) {
      expect(shouldPersistDrainLog(row({ level }))).toBe(true);
    }
  });

  it("drops ordinary info lines", () => {
    expect(shouldPersistDrainLog(row({ level: "info", message: "API request processed" }))).toBe(
      false,
    );
  });

  it("keeps 5xx and the -1 crash marker", () => {
    expect(shouldPersistDrainLog(row({ level: "info", statusCode: 503 }))).toBe(true);
    expect(shouldPersistDrainLog(row({ level: "info", statusCode: -1 }))).toBe(true);
    expect(shouldPersistDrainLog(row({ level: "info", statusCode: 200 }))).toBe(false);
  });

  it("keeps the /logg step 3c patterns even at info level", () => {
    const patterns = [
      "[product-postcheck] skipped reason=playwright_unavailable",
      "Failed to get free space in temporary directory",
      "Thumbnail capture failed",
      "stillMissing: [ 'app/layout.tsx' ]",
      "Vercel Runtime Timeout Error: Task timed out after 300 seconds",
      "[CSP Violation] blocked-uri=https://fonts.gstatic.com",
      "AI SDK Warning: unsupported setting",
      "EMAXCONNSESSION: max clients reached",
      "timeout exceeded when trying to connect",
    ];
    for (const message of patterns) {
      expect(shouldPersistDrainLog(row({ level: "info", message })), message).toBe(true);
    }
  });

  it("never stores its own request logs, even when they are errors", () => {
    // Loop guard: the drain delivers the ingest route's own lines back to us.
    expect(shouldPersistDrainLog(row({ level: "error", path: "/api/drains/vercel" }))).toBe(false);
    expect(shouldPersistDrainLog(row({ level: "error", path: "/api/drains/vercel/" }))).toBe(false);
    expect(shouldPersistDrainLog(row({ level: "error", path: "/api/drains/vercel?x=1" }))).toBe(
      false,
    );
  });

  it("does not mistake a different route for the ingest route", () => {
    expect(shouldPersistDrainLog(row({ level: "error", path: "/api/drains/vercel-other" }))).toBe(
      true,
    );
  });
});

describe("isSelfDrainLog", () => {
  it("is false when the line carries no path", () => {
    const row = normalizeVercelDrainLog(logRecord({ source: "build" }));
    expect(row && isSelfDrainLog(row)).toBe(false);
  });
});

describe("selectDrainRowsToStore", () => {
  it("de-duplicates repeated log ids inside one delivery", () => {
    const rows = selectDrainRowsToStore([
      logRecord({ id: "same", level: "error" }),
      logRecord({ id: "same", level: "error" }),
      logRecord({ id: "other", level: "error" }),
    ]);
    expect(rows.map((r) => r.logId)).toEqual(["same", "other"]);
  });

  it("caps one delivery so a burst cannot blow up a single request", () => {
    const records = Array.from({ length: VERCEL_DRAIN_MAX_ROWS_PER_DELIVERY + 25 }, (_, i) =>
      logRecord({ id: `log-${i}`, level: "error" }),
    );
    expect(selectDrainRowsToStore(records)).toHaveLength(VERCEL_DRAIN_MAX_ROWS_PER_DELIVERY);
  });

  it("skips records that are not log entries", () => {
    expect(selectDrainRowsToStore([null, "nope", { level: "error" }])).toEqual([]);
  });
});

describe("insertDrainLogs", () => {
  it("reports db_unconfigured instead of throwing", async () => {
    dbState.configured = false;
    await expect(insertDrainLogs([])).resolves.toEqual({
      stored: null,
      reason: "db_unconfigured",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("does not touch the database when nothing survived the filter", async () => {
    await expect(insertDrainLogs([])).resolves.toEqual({ stored: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it("inserts one parameterized row per log and ignores redeliveries", async () => {
    query.mockResolvedValueOnce({ rowCount: 2 });
    const rows = selectDrainRowsToStore([
      logRecord({ id: "a", level: "error", message: "boom" }),
      logRecord({ id: "b", level: "warning", message: "hmm" }),
    ]);

    await expect(insertDrainLogs(rows)).resolves.toEqual({ stored: 2 });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("INSERT INTO vercel_log_drain_events");
    expect(sql).toContain("ON CONFLICT (log_id) DO NOTHING");
    expect(params).toHaveLength(30);
    expect(params[0]).toBe("a");
    expect(params[15]).toBe("b");
  });

  it("splits a large batch into several statements", async () => {
    query.mockResolvedValue({ rowCount: 100 });
    const rows = selectDrainRowsToStore(
      Array.from({ length: 250 }, (_, i) => logRecord({ id: `log-${i}`, level: "error" })),
    );
    await insertDrainLogs(rows);
    expect(query).toHaveBeenCalledTimes(3);
  });
});

describe("pruneDrainLogs", () => {
  it("deletes past the retention window", async () => {
    query.mockResolvedValueOnce({ rowCount: 7 });
    await expect(pruneDrainLogs(14)).resolves.toBe(7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("DELETE FROM vercel_log_drain_events");
    expect(params).toEqual(["14"]);
  });

  it("is a no-op without a database", async () => {
    dbState.configured = false;
    await expect(pruneDrainLogs()).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("claimPruneSlot", () => {
  it("lets one caller through and holds the rest off for an hour", () => {
    const start = 10_000_000;
    expect(claimPruneSlot(start)).toBe(true);
    expect(claimPruneSlot(start + 1000)).toBe(false);
    expect(claimPruneSlot(start + PRUNE_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(claimPruneSlot(start + PRUNE_MIN_INTERVAL_MS)).toBe(true);
  });
});
