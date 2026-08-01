import fs from "node:fs";
import path from "node:path";
import { MAX_TIMELINE_ENTRIES_PER_RUN, TIMELINE_FILE } from "./constants";
import { readString } from "./entry-fields";
import type { StoredGenerationEntry } from "./types";

export function appendNdjsonLine(filePath: string, entry: StoredGenerationEntry): void {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function writeNdjson(filePath: string, entries: StoredGenerationEntry[]): void {
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "", "utf8");
}

export function readRunEntries(dir: string): StoredGenerationEntry[] {
  const filePath = path.join(dir, TIMELINE_FILE);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: StoredGenerationEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.ts === "string" &&
        (parsed.target === "in-progress" || parsed.target === "latest") &&
        parsed.data &&
        typeof parsed.data === "object" &&
        !Array.isArray(parsed.data)
      ) {
        entries.push({
          ts: parsed.ts,
          target: parsed.target,
          slug: readString(parsed.slug),
          summary: readString(parsed.summary),
          data: parsed.data as Record<string, unknown>,
        });
      }
    } catch {
      // Skip broken lines instead of breaking runtime logging.
    }
  }
  return entries;
}

export function trimRunEntries(entries: StoredGenerationEntry[]): StoredGenerationEntry[] {
  if (entries.length <= MAX_TIMELINE_ENTRIES_PER_RUN) return entries;
  return entries.slice(-MAX_TIMELINE_ENTRIES_PER_RUN);
}
