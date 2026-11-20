/**
 * Guard for the concurrency history behind `GET /admin/metrics`
 * (`src/metrics-history.js`).
 *
 * Invariants locked:
 *   1. Samples survive a restart (NDJSON in the data dir) and a corrupt line
 *      is skipped, not fatal.
 *   2. Retention: nothing older than 14 days is kept or served, in memory or
 *      on disk after compaction; the ring never grows past its capacity.
 *   3. A sample counts started guest machines and usable sessions from the
 *      store and never carries a machine token.
 *   4. The route is API-key protected and returns `current` + `samples`.
 *
 * Plain node: node scripts/test-metrics-history.mjs
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), "preview-host-metrics-"));
const HOST_API_KEY = "metrics-guard-key-0001";
const MACHINE_TOKEN = "guest-token-must-not-leak-0001";
process.env.PREVIEW_HOST_DATA_DIR = join(tmp, "server-data");
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";
process.env.PREVIEW_HOST_API_KEY = HOST_API_KEY;

const { collectSample, createMetricsHistory, FILE_NAME, RETENTION_MS } = require(
  "../src/metrics-history.js",
);

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

try {
  // 1 + 2: persistence, corrupt lines, retention, capacity.
  {
    const dataDir = join(tmp, "unit");
    let clock = Date.UTC(2026, 10, 1, 12, 0, 0);
    const now = () => clock;
    let level = 0;
    const collect = (t) => ({ t, guests: level, machines: level, runtimes: level, sessions: level });
    const history = createMetricsHistory({ dataDir, intervalMs: MINUTE, collect, now });

    for (let i = 0; i < 5; i += 1) {
      level = i;
      history.sampleNow();
      clock += MINUTE;
    }
    assert.equal(history.snapshot().samples.length, 5);

    // Restart: a fresh instance reads the same samples back; junk is skipped.
    writeFileSync(join(dataDir, FILE_NAME), `${readFileSync(join(dataDir, FILE_NAME), "utf8")}{not json\n\n`);
    const restarted = createMetricsHistory({ dataDir, intervalMs: MINUTE, collect, now });
    assert.deepEqual(
      restarted.snapshot().samples.map((s) => s.guests),
      [0, 1, 2, 3, 4],
      "samples must survive a restart and a corrupt line must be skipped",
    );

    // `sinceMs` narrows the window.
    const since = clock - 2 * MINUTE;
    assert.deepEqual(
      restarted.snapshot({ sinceMs: since }).samples.map((s) => s.t),
      [clock - 2 * MINUTE, clock - MINUTE],
    );

    // Jump past retention: the old samples drop, also from disk on compaction.
    clock += RETENTION_MS + MINUTE;
    level = 9;
    restarted.sampleNow();
    assert.deepEqual(restarted.snapshot().samples.map((s) => s.guests), [9]);
    restarted.compact();
    const onDisk = readFileSync(join(dataDir, FILE_NAME), "utf8").trim().split("\n");
    assert.equal(onDisk.length, 1, "compaction must drop expired lines from disk");
    assert.equal(JSON.parse(onDisk[0]).guests, 9);

    // The ring never grows past its capacity (fast clock, many samples).
    const ringDir = join(tmp, "ring");
    let ringClock = 0;
    const ring = createMetricsHistory({
      dataDir: ringDir,
      intervalMs: DAY,
      retentionMs: 3 * DAY,
      collect: (t) => ({ t, guests: 1 }),
      now: () => ringClock,
    });
    for (let i = 0; i < ring.capacity + 50; i += 1) {
      ring.record({ t: i, guests: 1 });
    }
    assert.equal(ring.snapshot().samples.length, ring.capacity);
  }

  // 3: the collector reads the store and never copies a machine token.
  {
    const nowMs = Date.UTC(2026, 10, 1, 12, 0, 0);
    const store = {
      machines: {
        a: { machineId: "m-a", token: MACHINE_TOKEN, state: "started" },
        b: { machineId: "m-b", token: MACHINE_TOKEN, state: "stopped" },
        c: { machineId: "m-c", token: MACHINE_TOKEN, state: "started" },
      },
      sessions: {
        live: { status: "running", sessionExpiresAt: new Date(nowMs + MINUTE).toISOString() },
        expired: { status: "running", sessionExpiresAt: new Date(nowMs - MINUTE).toISOString() },
        destroyed: { status: "destroyed" },
      },
    };
    const sample = collectSample(nowMs, { store, runtimes: 4 });
    assert.deepEqual(sample, { t: nowMs, guests: 2, machines: 3, runtimes: 4, sessions: 1 });
    assert.ok(!JSON.stringify(sample).includes(MACHINE_TOKEN));
  }

  // 4: the route.
  {
    const dataDir = process.env.PREVIEW_HOST_DATA_DIR;
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "preview-host-store.json"),
      JSON.stringify({
        sessions: {},
        logs: {},
        previewSessionToSession: {},
        prewarmLeases: {},
        mutationRevisionByChat: {},
        machines: { chat1: { machineId: "m-1", token: MACHINE_TOKEN, state: "started" } },
      }),
    );
    const t0 = Date.now() - 3 * 60 * 60 * 1000;
    writeFileSync(
      join(dataDir, FILE_NAME),
      [
        { t: t0, guests: 1, machines: 1, runtimes: 1, sessions: 1 },
        { t: Date.now() - MINUTE, guests: 2, machines: 2, runtimes: 2, sessions: 2 },
      ]
        .map((s) => JSON.stringify(s))
        .join("\n") + "\n",
    );

    const { createServer } = require("../src/server.js");
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    try {
      const anonymous = await fetch(`${base}/admin/metrics`);
      assert.equal(anonymous.status, 401, "metrics must require the API key");

      const all = await fetch(`${base}/admin/metrics`, {
        headers: { authorization: `Bearer ${HOST_API_KEY}` },
      });
      assert.equal(all.status, 200);
      const text = await all.text();
      assert.ok(!text.includes(MACHINE_TOKEN), "metrics must never return a machine token");
      const body = JSON.parse(text);
      assert.equal(body.ok, true);
      assert.equal(body.samples.length, 2);
      assert.equal(body.current.guests, 1);
      assert.equal(body.current.machines, 1);
      assert.equal(typeof body.intervalMs, "number");
      assert.equal(body.retentionMs, RETENTION_MS);
      assert.ok(body.isolation && typeof body.isolation.mode === "string");

      const lastHour = await fetch(`${base}/admin/metrics?hours=1`, {
        headers: { "x-preview-host-key": HOST_API_KEY },
      });
      assert.equal(lastHour.status, 200);
      assert.deepEqual((await lastHour.json()).samples.map((s) => s.guests), [2]);
    } finally {
      server.close();
    }
  }

  console.log("metrics-history guard: ok");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
