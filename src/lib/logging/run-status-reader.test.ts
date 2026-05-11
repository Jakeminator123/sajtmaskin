import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempDir = "";
const originalCwd = process.cwd();

async function loadReader() {
  vi.resetModules();
  return import("./run-status-reader");
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

afterEach(() => {
  process.chdir(originalCwd);
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("run-status-reader", () => {
  it("reads status from indexed run meta", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-status-reader-"));
    process.chdir(tempDir);
    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const runId = "20260430-220000-demo";

    writeJson(path.join(rootDir, "_index", "chat-to-run.json"), {
      chat_demo: runId,
    });
    writeJson(path.join(rootDir, runId, "meta.json"), {
      status: "aborted",
      statusReason: "provider_aborted",
      versionId: null,
      startedAt: "2026-04-30T20:00:00.000Z",
      updatedAt: "2026-04-30T20:00:10.000Z",
    });

    const { readRunStatusForChat } = await loadReader();
    const status = readRunStatusForChat("chat_demo");

    expect(status).toEqual({
      runId,
      status: "aborted",
      statusReason: "provider_aborted",
      versionId: null,
      startedAt: "2026-04-30T20:00:00.000Z",
      updatedAt: "2026-04-30T20:00:10.000Z",
    });
  });

  it("rejects unsafe run ids from index", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-status-reader-"));
    process.chdir(tempDir);
    const rootDir = path.join(tempDir, "logs", "generationslogg");

    writeJson(path.join(rootDir, "_index", "chat-to-run.json"), {
      chat_demo: "../outside",
    });

    const { readRunStatusForChat } = await loadReader();
    expect(readRunStatusForChat("chat_demo")).toBeNull();
  });

  it("infers stale in_progress runs as aborted", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-status-reader-"));
    process.chdir(tempDir);
    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const runId = "20260430-220001-demo";
    const staleTs = "2026-04-01T00:00:00.000Z";

    writeJson(path.join(rootDir, "_index", "chat-to-run.json"), {
      chat_stale: runId,
    });
    writeJson(path.join(rootDir, runId, "meta.json"), {
      status: "in_progress",
      statusReason: null,
      versionId: null,
      startedAt: staleTs,
      updatedAt: staleTs,
    });

    const { readRunStatusForChat } = await loadReader();
    const status = readRunStatusForChat("chat_stale");
    expect(status?.status).toBe("aborted");
    expect(status?.statusReason).toBe("staleness_inferred");
  });
});
