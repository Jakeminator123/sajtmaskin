import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TRANSIENT_DB_MESSAGE,
  transientDbResponseIfRetryable,
} from "./transient-db-response";
import { registerDbPool } from "@/lib/db/pool-stats";
import { TRANSIENT_DB_RETRY_AFTER_SECONDS } from "@/lib/db/transient-error";

/**
 * A1: the four polled read routes share this translation, so the contract the
 * clients rely on (503 + `Retry-After` + a body that works for both the
 * `ok`-branching and the `error`-reading callers) is locked here once.
 */
describe("transientDbResponseIfRetryable", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    registerDbPool(null, 0);
  });

  it("returns a retryable 503 with Retry-After for a transient failure", async () => {
    const response = transientDbResponseIfRetryable(
      new Error("timeout exceeded when trying to connect"),
      "[test] readiness",
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe(
      String(TRANSIENT_DB_RETRY_AFTER_SECONDS),
    );
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: TRANSIENT_DB_MESSAGE,
      code: "db_unavailable",
      retryable: true,
    });
  });

  it("logs the degradation as a warning, not an error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    transientDbResponseIfRetryable(new Error("Connection terminated"), "[test] versions");

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // A3: pool-siffrorna finns bara medan requesten lever. Bär inte 503-loggen
  // dem går bevisen som skiljer "höj POSTGRES_POOL_MAX" från "rör den inte"
  // förlorade i exakt det ögonblick de betyder något.
  it("carries the pool counts so a future storm says which side saturated", () => {
    registerDbPool({ totalCount: 3, idleCount: 0, waitingCount: 7 }, 3);

    transientDbResponseIfRetryable(
      new Error("timeout exceeded when trying to connect"),
      "[test] version-status",
    );

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[pool=3/3 idle=0 waiting=7 at-ceiling]"),
      expect.anything(),
    );
  });

  it("logs without pool counts when no pool is registered", () => {
    transientDbResponseIfRetryable(new Error("Connection terminated"), "[test] versions");

    expect(console.warn).toHaveBeenCalledWith(
      expect.not.stringContaining("pool="),
      expect.anything(),
    );
  });

  it("returns null for a non-transient error so the caller still 500s", () => {
    expect(
      transientDbResponseIfRetryable(new TypeError("cannot read files_json"), "[test] dossiers"),
    ).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
