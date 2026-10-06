// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repairGeneratedFiles } from "@/lib/gen/autofix/repair-generated-files";
import {
  assertIsolationState,
  assertNoDotenv,
  assertOwnedContainer,
  assertPassingPlaywrightReport,
  databaseConfig,
  DB_NAME,
  DB_USER,
  FIXTURE_FILES,
  OWNER_LABEL,
  POSTGRES_IMAGE,
  runtimeEnvironment,
} from "./project-persistence-env.mjs";

const dbUrl = `postgresql://${DB_USER}:${"a".repeat(48)}@127.0.0.1:5432/${DB_NAME}`;

describe("disposable project persistence boundaries", () => {
  it("uses explicit pg fields and owns the app's single SSL parameter", () => {
    expect(databaseConfig(dbUrl)).toMatchObject({
      host: "127.0.0.1",
      port: 5432,
      ssl: false,
      database: DB_NAME,
      user: DB_USER,
    });
    expect(databaseConfig(dbUrl)).not.toHaveProperty("connectionString");
    const env = runtimeEnvironment({
      nodeDirectory: "/node/bin",
      home: "/tmp/a4",
      dbUrl,
      namespace: "net:[2]",
      hostNamespace: "net:[1]",
      fixture: {},
    });
    expect(env.POSTGRES_URL).toBe(`${dbUrl}?sslmode=disable`);
    expect(Object.keys(env).sort()).toEqual(
      [
        "A4_FIXTURE",
        "A4_HOST_NAMESPACE",
        "A4_NAMESPACE",
        "A4_POSTGRES_URL",
        "CI",
        "HOME",
        "LANG",
        "NEXT_PUBLIC_APP_URL",
        "NEXT_TELEMETRY_DISABLED",
        "NODE_ENV",
        "PATH",
        "PLAYWRIGHT_BROWSERS_PATH",
        "PLAYWRIGHT_JSON_OUTPUT_FILE",
        "POSTGRES_URL",
        "TMPDIR",
      ].sort(),
    );
    expect(env).not.toHaveProperty("NODE_OPTIONS");
    expect(env).not.toHaveProperty("DATABASE_URL");
  });

  it.each([
    undefined,
    "",
    dbUrl + "?host=production.example",
    dbUrl + "?sslmode=disable",
    dbUrl + "?",
    dbUrl + "#x",
    dbUrl.replace("127.0.0.1", "localhost"),
    dbUrl.replace("127.0.0.1", "prod.example"),
    dbUrl.replace(":5432", ":6543"),
    dbUrl.replace(DB_NAME, "postgres"),
    dbUrl.replace(DB_USER, "postgres"),
    dbUrl.replace("postgresql:", "file:"),
    "postgresql:///sajtmaskin_persistence_test?host=/tmp",
  ])("rejects alternate/shared database inputs: %s", (value) => {
    expect(() => databaseConfig(value)).toThrow();
  });

  it("refuses all root dotenv files instead of reading them", () => {
    const root = mkdtempSync(join(tmpdir(), "a4-env-test-"));
    try {
      expect(() => assertNoDotenv(root)).not.toThrow();
      for (const name of [".env", ".env.local", ".env.production", ".env.development.local"]) {
        writeFileSync(join(root, name), "DO_NOT_READ=fixture");
        expect(() => assertNoDotenv(root)).toThrow(/dotenv/);
        rmSync(join(root, name));
      }
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  const id = "b".repeat(64);
  const container = {
    Id: id,
    Config: { Image: POSTGRES_IMAGE, Labels: { [OWNER_LABEL]: "own-run" } },
    HostConfig: { NetworkMode: "none", PortBindings: {}, Privileged: false },
    State: { Running: true, Pid: 1234 },
  };
  it("requires exact container ID/owner/image, no ports and no host network", () => {
    expect(() => assertOwnedContainer(container, id, "own-run")).not.toThrow();
    const wrong = [
      { ...container, Id: "c".repeat(64) },
      { ...container, Config: { ...container.Config, Labels: {} } },
      { ...container, Config: { ...container.Config, Image: "postgres:latest" } },
      { ...container, HostConfig: { ...container.HostConfig, NetworkMode: "host" } },
      { ...container, HostConfig: { ...container.HostConfig, PortBindings: { "5432/tcp": [] } } },
      { ...container, HostConfig: { ...container.HostConfig, Privileged: true } },
      { ...container, State: { Running: false, Pid: 0 } },
    ];
    for (const mutation of wrong)
      expect(() => assertOwnedContainer(mutation, id, "own-run")).toThrow();
  });

  const isolated = {
    namespace: "net:[2]",
    expected: "net:[2]",
    hostNamespace: "net:[1]",
    uid: 1001,
    dockerAccessible: false,
    interfaces: { lo: [{ address: "127.0.0.1", internal: true }] },
    status:
      "NoNewPrivs:\t1\nCapInh:\t0000\nCapPrm:\t0000\nCapEff:\t0000\nCapBnd:\t0000\nCapAmb:\t0000\nGroups:\t\n",
  };
  it("fails closed without kernel network/privilege evidence", () => {
    expect(() => assertIsolationState(isolated)).not.toThrow();
    const wrong = [
      { ...isolated, namespace: "net:[1]" },
      { ...isolated, expected: undefined },
      { ...isolated, hostNamespace: undefined },
      { ...isolated, interfaces: { eth0: [{ address: "10.0.0.1", internal: false }] } },
      { ...isolated, uid: 0 },
      { ...isolated, dockerAccessible: true },
      { ...isolated, status: isolated.status.replace("NoNewPrivs:\t1", "NoNewPrivs:\t0") },
      { ...isolated, status: isolated.status.replace("Groups:\t", "Groups:\t999") },
      ...["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"].map((field) => ({
        ...isolated,
        status: isolated.status.replace(`${field}:\t0000`, `${field}:\t0001`),
      })),
    ];
    for (const mutation of wrong) expect(() => assertIsolationState(mutation)).toThrow();
  });

  it("uses real, repair-free seed content so a files GET cannot silently alter the fixture", () => {
    const result = repairGeneratedFiles(FIXTURE_FILES);
    expect(result.fixes).toEqual([]);
    expect(result.files).toEqual(FIXTURE_FILES);
  });

  it("requires actual passing results, not Playwright's successful skipped-only exit", () => {
    const passingTest = {
      expectedStatus: "passed",
      status: "expected",
      results: [{ status: "passed" }],
    };
    const report = {
      errors: [],
      stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [{ specs: [{ tests: [passingTest] }] }],
    };
    expect(() => assertPassingPlaywrightReport(report)).not.toThrow();
    expect(() =>
      assertPassingPlaywrightReport({ ...report, suites: [{ specs: [], suites: report.suites }] }),
    ).not.toThrow();
    const wrong = [
      undefined,
      { ...report, suites: [] },
      { ...report, errors: [{ message: "global teardown failed" }] },
      ...["skipped", "unexpected", "flaky"].map((field) => ({
        ...report,
        stats: { ...report.stats, [field]: 1 },
      })),
      {
        ...report,
        stats: { expected: 0, skipped: 1, unexpected: 0, flaky: 0 },
        suites: [
          {
            specs: [
              {
                tests: [
                  {
                    expectedStatus: "skipped",
                    status: "skipped",
                    results: [{ status: "skipped" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      ...[
        { ...passingTest, results: [] },
        { ...passingTest, results: [{ status: "failed" }] },
        { ...passingTest, expectedStatus: "failed", results: [{ status: "failed" }] },
      ].map((test) => ({ ...report, suites: [{ specs: [{ tests: [test] }] }] })),
    ];
    for (const mutation of wrong) expect(() => assertPassingPlaywrightReport(mutation)).toThrow();
  });

  it.each([{ args: [] }, { args: ["--inside"] }])(
    "actual entry fails before DB/browser startup without CI isolation: %j",
    ({ args }) => {
      const result = spawnSync(
        process.execPath,
        ["scripts/e2e/run-project-persistence.mjs", ...args],
        {
          encoding: "utf8",
          timeout: 10_000,
          env: {
            NODE_ENV: "test",
            ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}),
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("[project-persistence]");
      expect(result.stdout).not.toContain("verified isolated namespace");
    },
  );
});
