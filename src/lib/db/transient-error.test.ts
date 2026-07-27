import { describe, expect, it } from "vitest";

import { isTransientDbError } from "./transient-error";

/**
 * A1 regression coverage: the polled read routes only degrade to a retryable
 * 503 for failures that are genuinely worth retrying. Widening this classifier
 * to a permanent error would turn a hard 500 into an infinite client retry
 * loop, so the negative cases matter as much as the positive ones.
 */
describe("isTransientDbError", () => {
  it("catches the pool connect timeout from the 2026-07-13 incident", () => {
    expect(
      isTransientDbError(new Error("timeout exceeded when trying to connect")),
    ).toBe(true);
  });

  it("catches dropped/closed connections", () => {
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(
      isTransientDbError(new Error("Client has encountered a connection error and is not queryable")),
    ).toBe(true);
    expect(isTransientDbError(new Error("server closed the connection unexpectedly"))).toBe(true);
  });

  it("catches pooler capacity exhaustion", () => {
    expect(isTransientDbError(new Error("MaxClientsInSessionMode: EMAXCONNSESSION"))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("too many"), { code: "53300" }))).toBe(true);
  });

  it("catches connection-class SQLSTATE codes and socket errnos", () => {
    expect(isTransientDbError(Object.assign(new Error("boom"), { code: "08006" }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("boom"), { code: "57P03" }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("boom"), { code: "ECONNRESET" }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("boom"), { code: "ETIMEDOUT" }))).toBe(true);
  });

  it("catches lock/serialization contention", () => {
    expect(isTransientDbError(Object.assign(new Error("lock"), { code: "55P03" }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("retry"), { code: "40001" }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("deadlock"), { code: "40P01" }))).toBe(true);
  });

  it("unwraps a wrapped driver error", () => {
    const wrapped = new Error("Failed query", {
      cause: new Error("timeout exceeded when trying to connect"),
    });
    expect(isTransientDbError(wrapped)).toBe(true);
  });

  it("does NOT mask configuration, schema or query errors", () => {
    expect(
      isTransientDbError(
        new Error(
          "Missing database connection string. Set POSTGRES_URL, POSTGRES_URL_NON_POOLING, …",
        ),
      ),
    ).toBe(false);
    // 42P01 undefined_table, 23505 unique_violation, 22P02 invalid_text_representation
    expect(
      isTransientDbError(Object.assign(new Error("relation does not exist"), { code: "42P01" })),
    ).toBe(false);
    expect(
      isTransientDbError(Object.assign(new Error("duplicate key"), { code: "23505" })),
    ).toBe(false);
    expect(
      isTransientDbError(Object.assign(new Error("invalid input syntax"), { code: "22P02" })),
    ).toBe(false);
    expect(isTransientDbError(new TypeError("version.files_json is not iterable"))).toBe(false);
  });

  it("is safe on non-errors and self-referencing causes", () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
    expect(isTransientDbError("timeout exceeded when trying to connect")).toBe(false);
    const looping = new Error("Failed query") as Error & { cause?: unknown };
    looping.cause = looping;
    expect(isTransientDbError(looping)).toBe(false);
  });
});
