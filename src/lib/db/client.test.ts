import { afterEach, describe, expect, it, vi } from "vitest";
import { rootCertificates } from "node:tls";
import { Client } from "pg";

// Importing ./client evaluates a module-level pg.Pool. Give it a resolvable
// connection string so the import does not throw (MISSING_DB_MESSAGE); the pool
// connects lazily and is never queried here, so no real connection is opened.
vi.mock("./env", () => ({
  resolveConfiguredDbEnv: () => ({
    name: "POSTGRES_URL",
    connectionString: "postgresql://postgres:postgres@localhost:5432/test?sslmode=disable",
  }),
}));

const {
  parsePositiveIntEnv,
  resolveConnectTimeoutMs,
  resolvePoolSslConfig,
  cleanConnectionString,
} = await import("./client");

const ENV_KEY = "POSTGRES_CONNECT_TIMEOUT_MS";

describe("database CA configuration", () => {
  const url = "postgresql://fixture:fixture@localhost:5432/test?sslmode=require";
  const ca = rootCertificates[0];

  it.each([ca, ca.replace(/\n/g, "\\n")])(
    "passes the selected CA and strict verification to pg without a URL override",
    (certificate) => {
      const ssl = resolvePoolSslConfig(url, { DB_SSL_CA_CERT: certificate });
      const client = new Client({ connectionString: cleanConnectionString(url), ssl });
      // Client construction does not connect. Inspect pg's effective options,
      // not only our helper, because URL parsing can replace the ssl object.
      expect(client.ssl).toEqual({ ca: ca.trim(), rejectUnauthorized: true });
      expect(client.ssl).not.toHaveProperty("checkServerIdentity");
    },
  );

  it.each([
    { connection: url, extra: { DB_SSL_REJECT_UNAUTHORIZED: "false" } },
    { connection: url, extra: { DB_SSL_REJECT_UNAUTHORIZED: "0" } },
    { connection: url.replace("require", "disable"), extra: {} },
  ])("rejects a CA combined with disabled verification", ({ connection, extra }) => {
    expect(() => resolvePoolSslConfig(connection, { DB_SSL_CA_CERT: ca, ...extra })).toThrow(
      "DB_SSL_CA_CERT requires TLS certificate verification to remain enabled.",
    );
  });

  it.each(["ssl=0", "sslcert=fixture.pem", "sslkey=fixture.pem", "sslrootcert=fixture.pem", "sslnegotiation=direct"])(
    "rejects URL settings that would replace the selected CA: %s",
    (setting) => {
      expect(() => resolvePoolSslConfig(`${url}&${setting}`, { DB_SSL_CA_CERT: ca })).toThrow(
        "DB_SSL_CA_CERT cannot be combined with SSL inputs in the database URL",
      );
    },
  );

  it("does not expose an invalid connection string in its error", () => {
    expect(() => resolvePoolSslConfig("fixture-private-connection", { DB_SSL_CA_CERT: ca })).toThrow(
      "DB_SSL_CA_CERT requires a valid database connection URL.",
    );
  });

  it("preserves configurations that do not opt into a custom CA", () => {
    expect(resolvePoolSslConfig(url.replace("require", "disable"), {})).toBe(false);
    expect(resolvePoolSslConfig(url.replace("require", "verify-full"), {})).toEqual({ rejectUnauthorized: true });
    expect(resolvePoolSslConfig(url, { DB_SSL_CA_CERT: "  ", DB_SSL_REJECT_UNAUTHORIZED: "false" })).toEqual({ rejectUnauthorized: false });
    expect(resolvePoolSslConfig(url, { DB_SSL_REJECT_UNAUTHORIZED: "true" })).toEqual({ rejectUnauthorized: true });
  });
});

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
