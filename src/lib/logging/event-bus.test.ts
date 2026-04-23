/**
 * OMTAG-06 — Event bus behavioural tests.
 *
 * Covers the append-only contract, subscriber fan-out, per-version
 * `.runs.json` indexing, and multi-run NDJSON aggregation via
 * `readAll()`. FS-level assertions run against a temp dir under the
 * OS temp root so tests don't pollute the real `data/runs/` tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("event-bus", () => {
  let tmpDir: string;
  let originalCwd: string;
  let bus: typeof import("./event-bus");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-bus-test-"));
    process.chdir(tmpDir);
    vi.resetModules();
    bus = await import("./event-bus");
    bus.__resetForTests();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emit assigns id+ts+runId defaults and persists NDJSON", () => {
    const event = bus.emit({
      t: "version.started",
      versionId: "v1",
      chatId: "c1",
      generationKind: "create",
    });
    expect(event.id).toMatch(/^ev_/);
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.runId).toBe(bus.DEFAULT_RUN_ID);

    const ndjson = fs.readFileSync(
      path.join(tmpDir, "data", "runs", "v1", "root", "events.ndjson"),
      "utf8",
    );
    expect(ndjson.trim().split("\n")).toHaveLength(1);
    const parsed = JSON.parse(ndjson.trim()) as typeof event;
    expect(parsed.t).toBe("version.started");
    expect(parsed.id).toBe(event.id);
  });

  it("registers new runs in .runs.json exactly once", () => {
    bus.emit({
      t: "version.started",
      versionId: "v1",
      generationKind: "create",
    });
    bus.emit({
      t: "version.repair.started",
      versionId: "v1",
      runId: "repair-1",
      reason: "quality-gate-failed",
      trigger: "server-verify",
    });
    bus.emit({
      t: "version.repair.passIndex",
      versionId: "v1",
      runId: "repair-1",
      passIndex: 1,
    });

    const indexFile = path.join(tmpDir, "data", "runs", "v1", ".runs.json");
    const index = JSON.parse(fs.readFileSync(indexFile, "utf8")) as Array<{
      runId: string;
      reason: string | null;
    }>;
    expect(index.map((e) => e.runId)).toEqual(["root", "repair-1"]);
    expect(index[1].reason).toBe("quality-gate-failed");
  });

  it("subscribers receive events synchronously and throwing does not break writer", () => {
    const received: string[] = [];
    bus.subscribe((event) => {
      received.push(event.t);
    });
    bus.subscribe(() => {
      throw new Error("boom");
    });

    expect(() =>
      bus.emit({
        t: "version.preflight",
        versionId: "v2",
        filesChecked: 1,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
    ).not.toThrow();
    expect(received).toEqual(["version.preflight"]);
  });

  it("readAll merges in-memory + disk across multiple runs", () => {
    bus.emit({
      t: "version.started",
      versionId: "v3",
      generationKind: "create",
    });
    bus.emit({
      t: "version.repair.started",
      versionId: "v3",
      runId: "repair-1",
      reason: "build-error",
      trigger: "build-error",
    });
    bus.emit({
      t: "version.done",
      versionId: "v3",
      runId: "repair-1",
      durationMs: 99,
    });

    const events = bus.readAll("v3");
    expect(events.map((e) => e.t)).toEqual([
      "version.started",
      "version.repair.started",
      "version.done",
    ]);
  });

  it("unsubscribe handle stops fan-out", () => {
    const received: string[] = [];
    const off = bus.subscribe((event) => {
      received.push(event.t);
    });
    bus.emit({
      t: "version.done",
      versionId: "v4",
      durationMs: 1,
    });
    off();
    bus.emit({
      t: "version.done",
      versionId: "v4",
      durationMs: 2,
    });
    expect(received).toEqual(["version.done"]);
  });
});
