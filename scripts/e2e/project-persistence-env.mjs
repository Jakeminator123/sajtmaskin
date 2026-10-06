import assert from "node:assert/strict";
import { accessSync, constants, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { networkInterfaces } from "node:os";

export const BASE_URL = "http://127.0.0.1:3107";
export const DB_NAME = "sajtmaskin_persistence_test";
export const DB_USER = "persistence_test";
// Docker Hub library/postgres:16-bookworm manifest, resolved 2026-10-06.
export const POSTGRES_IMAGE =
  "postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4";
export const OWNER_LABEL = "sajtmaskin.project-persistence";
export const FIXTURE_FILES = [
  {
    path: "app/page.tsx",
    language: "tsx",
    content: "export default function Page() { return <main><h1>A4_INITIAL_MARKER</h1></main>; }\n",
  },
  {
    path: "app/layout.tsx",
    language: "tsx",
    content:
      'import type { ReactNode } from "react";\nexport default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n',
  },
];

export function databaseConfig(value) {
  assert(typeof value === "string" && value.length > 0, "Missing isolated test database URL");
  // pg accepts connection parameters in the query, including host overrides.
  // Never hand an arbitrary connectionString to either pg or the app.
  assert(
    !value.includes("?") && !value.includes("#"),
    "Test DB URL must have no query or fragment",
  );
  const url = new URL(value);
  assert(
    url.protocol === "postgresql:" && url.hostname === "127.0.0.1",
    "Test DB must use exact IPv4 loopback",
  );
  assert(
    url.port === "5432" && url.pathname === `/${DB_NAME}` && url.username === DB_USER,
    "Unexpected test DB identity",
  );
  assert(
    /^[a-f0-9]{48}$/.test(url.password),
    "Test DB requires its generated disposable credential",
  );
  return {
    host: "127.0.0.1",
    port: 5432,
    database: DB_NAME,
    user: DB_USER,
    password: url.password,
    ssl: false,
    max: 2,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: "a4_fixture",
  };
}

export function runtimeEnvironment({
  nodeDirectory,
  home,
  dbUrl,
  namespace,
  hostNamespace,
  fixture,
}) {
  const db = databaseConfig(dbUrl);
  return {
    PATH: `${nodeDirectory}:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: home,
    LANG: "C.UTF-8",
    CI: "true",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_URL: BASE_URL,
    PLAYWRIGHT_BROWSERS_PATH: "0",
    PLAYWRIGHT_JSON_OUTPUT_FILE: `${home}/project-persistence-report.json`,
    // Only the launcher owns this one query parameter; the input is query-free.
    POSTGRES_URL: `postgresql://${db.user}:${db.password}@${db.host}:${db.port}/${db.database}?sslmode=disable`,
    A4_POSTGRES_URL: dbUrl,
    A4_NAMESPACE: namespace,
    A4_HOST_NAMESPACE: hostNamespace,
    A4_FIXTURE: JSON.stringify(fixture),
  };
}

export function assertNoDotenv(root) {
  assert(
    !readdirSync(root).some((name) => name === ".env" || name.startsWith(".env.")),
    "Refusing checkout with root dotenv files",
  );
}

export function assertPassingPlaywrightReport(report) {
  const collectTests = (suites) => {
    assert(Array.isArray(suites), "Missing Playwright suites");
    return suites.flatMap((suite) => [
      ...(suite.specs ?? []).flatMap((spec) => spec.tests ?? []),
      ...collectTests(suite.suites ?? []),
    ]);
  };
  const tests = collectTests(report?.suites);
  assert(Array.isArray(report.errors) && report.errors.length === 0, "Playwright reported errors");
  assert(
    tests.length > 0 &&
      report.stats?.expected === tests.length &&
      report.stats.skipped === 0 &&
      report.stats.unexpected === 0 &&
      report.stats.flaky === 0,
    "Persistence requires executed passing tests, with no skipped, unexpected or flaky results",
  );
  assert(
    tests.every(
      (test) =>
        test.expectedStatus === "passed" &&
        test.status === "expected" &&
        test.results?.length > 0 &&
        test.results.every((result) => result.status === "passed"),
    ),
    "Persistence tests must actually pass, not be skipped or expected to fail",
  );
}

export function assertOwnedContainer(container, id, nonce) {
  assert(/^[a-f0-9]{64}$/.test(id) && container.Id === id, "Wrong disposable container ID");
  assert(container.Config?.Labels?.[OWNER_LABEL] === nonce, "Wrong disposable container owner");
  assert(container.Config?.Image === POSTGRES_IMAGE, "Unexpected Postgres image");
  assert(container.HostConfig?.NetworkMode === "none", "Postgres must use network none");
  assert(
    Object.keys(container.HostConfig?.PortBindings ?? {}).length === 0,
    "Published ports are forbidden",
  );
  assert(!container.HostConfig?.Privileged, "Privileged container is forbidden");
  assert(
    container.State?.Running &&
      Number.isSafeInteger(container.State.Pid) &&
      container.State.Pid > 0,
    "Postgres container is not running",
  );
}

export function assertIsolationState({
  namespace,
  expected,
  hostNamespace,
  interfaces,
  status,
  uid,
  dockerAccessible,
}) {
  assert(
    /^net:\[\d+\]$/.test(expected ?? "") &&
      /^net:\[\d+\]$/.test(hostNamespace ?? "") &&
      namespace === expected &&
      namespace !== hostNamespace,
    "Not in the owned isolated network namespace",
  );
  const addresses = Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries ?? []).map((entry) => ({ name, ...entry })),
  );
  assert(
    addresses.length > 0 && addresses.every((entry) => entry.name === "lo" && entry.internal),
    "Non-loopback network interface found",
  );
  assert(
    addresses.some((entry) => entry.address === "127.0.0.1"),
    "Missing IPv4 loopback",
  );
  const fields = Object.fromEntries(
    status
      .trim()
      .split("\n")
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon), line.slice(colon + 1).trim()];
      }),
  );
  assert(
    Number.isSafeInteger(uid) && uid > 0 && fields.NoNewPrivs === "1",
    "Runtime must be unprivileged with no_new_privs",
  );
  for (const field of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    assert(/^0+$/.test(fields[field] ?? ""), `Runtime retained ${field}`);
  assert(fields.Groups === "", "Runtime retained supplementary groups");
  assert(!dockerAccessible, "Runtime can access the Docker socket");
}

export function assertRuntimeIsolation(root) {
  assert(
    process.platform === "linux",
    "Real project-persistence execution requires the disposable Linux CI runner",
  );
  assertNoDotenv(root);
  let dockerAccessible = false;
  try {
    accessSync("/var/run/docker.sock", constants.R_OK | constants.W_OK);
    dockerAccessible = true;
  } catch (error) {
    assert(["EACCES", "ENOENT"].includes(error.code), "Could not verify Docker socket access");
  }
  assertIsolationState({
    namespace: readlinkSync("/proc/self/ns/net"),
    expected: process.env.A4_NAMESPACE,
    hostNamespace: process.env.A4_HOST_NAMESPACE,
    interfaces: networkInterfaces(),
    status: readFileSync("/proc/self/status", "utf8"),
    uid: process.getuid(),
    dockerAccessible,
  });
  databaseConfig(process.env.A4_POSTGRES_URL);
}
