import { afterEach, describe, expect, it, vi } from "vitest";

// Importing ./client evaluates a module-level pg.Pool. Give it a resolvable
// connection string so the import does not throw (MISSING_DB_MESSAGE); the pool
// connects lazily and is never queried here, so no real connection is opened.
vi.mock("./env", () => ({
  resolveConfiguredDbEnv: () => ({
    name: "POSTGRES_URL",
    connectionString: "postgresql://postgres:postgres@localhost:5432/test?sslmode=disable",
  }),
}));

const { parsePositiveIntEnv, resolveConnectTimeoutMs } = await import("./client");

const ENV_KEY = "POSTGRES_CONNECT_TIMEOUT_MS";

describe("parsePositiveIntEnv", () => {
  it("parses a positive integer (trimmed)", () => {
    expect(parsePositiveIntEnv("2500")).toBe(2500);
    expect(parsePositiveIntEnv("  30 ")).toBe(30);
  });

  it("rejects zero, negative, non-numeric, empty and undefined", () => {
    expect(parsePositiveIntEnv("0")).toBeUndefined();
    expect(parsePositiveIntEnv("-5")).toBeUndefined();
    expect(parsePositiveIntEnv("abc")).toBeUndefined();
    expect(parsePositiveIntEnv("")).toBeUndefined();
    expect(parsePositiveIntEnv(undefined)).toBeUndefined();
  });
});

describe("resolveConnectTimeoutMs (POSTGRES_CONNECT_TIMEOUT_MS override)", () => {
  const original = process.env[ENV_KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("uses the env value when set to a positive integer", () => {
    process.env[ENV_KEY] = "3000";
    expect(resolveConnectTimeoutMs()).toBe(3000);
  });

  it("falls back to the 10s default when unset", () => {
    delete process.env[ENV_KEY];
    expect(resolveConnectTimeoutMs()).toBe(10_000);
  });

  it("falls back to the 10s default on a malformed value", () => {
    process.env[ENV_KEY] = "not-a-number";
    expect(resolveConnectTimeoutMs()).toBe(10_000);
    process.env[ENV_KEY] = "0";
    expect(resolveConnectTimeoutMs()).toBe(10_000);
  });
});
