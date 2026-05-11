import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempDir = "";
const originalCwd = process.cwd();

async function loadReader() {
  vi.resetModules();
  return import("./recurring-patterns-reader");
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

describe("recurring-patterns-reader", () => {
  it("reads recurring fix patterns for a chat", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recurring-patterns-reader-"));
    process.chdir(tempDir);
    writeJson(
      path.join(tempDir, "logs", "site-observability", "chat_1", "latest", "fix-patterns.json"),
      [
        {
          pattern: "missing import",
          occurrences: 3,
          sources: { "lint:error": 3 },
          files: [{ file: "app/page.tsx", count: 2 }],
          latestTs: "2026-04-30T20:00:00.000Z",
          example: "Cannot find name React",
        },
      ],
    );

    const { readRecurringPatternsForChat } = await loadReader();
    const patterns = readRecurringPatternsForChat("chat_1");
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.pattern).toBe("missing import");
    expect(patterns[0]?.occurrences).toBe(3);
  });

  it("returns empty list when file is missing", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "recurring-patterns-reader-"));
    process.chdir(tempDir);

    const { readRecurringPatternsForChat } = await loadReader();
    expect(readRecurringPatternsForChat("chat_1")).toEqual([]);
  });
});
