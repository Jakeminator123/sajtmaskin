import fs from "node:fs";
import path from "node:path";

const SITE_OBSERVABILITY_DIR = path.join(process.cwd(), "logs", "site-observability");
const SITE_LATEST_DIR = "latest";
const FIX_PATTERNS_FILE = "fix-patterns.json";

export type RunFixPattern = {
  pattern: string;
  occurrences: number;
  sources: Record<string, number>;
  files: Array<{ file: string; count: number }>;
  latestTs: string | null;
  example: string | null;
};

/**
 * Returns recurring failure patterns for a chat from site-observability.
 * Best-effort only: malformed/missing files return [].
 */
export function readRecurringPatternsForChat(
  chatId: string | null | undefined,
): RunFixPattern[] {
  const trimmed = (chatId ?? "").trim();
  if (!trimmed || trimmed === "-") return [];
  try {
    const filePath = path.join(
      SITE_OBSERVABILITY_DIR,
      trimmed,
      SITE_LATEST_DIR,
      FIX_PATTERNS_FILE,
    );
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RunFixPattern =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { pattern?: unknown }).pattern === "string" &&
        typeof (item as { occurrences?: unknown }).occurrences === "number",
    );
  } catch {
    return [];
  }
}
