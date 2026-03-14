import fs from "node:fs";
import path from "node:path";

export type DevLogViewerEntry = {
  ts: string;
  target: string;
  slug: string | null;
  data: Record<string, unknown>;
};

const ROOT_LOG_DIR = path.join(process.cwd(), "logs");
const ROOT_DOC_LOG_PATH = path.join(ROOT_LOG_DIR, "sajtmaskin-local-document.txt");
const MAX_DOCUMENT_CHARS = 120_000;

function normalizeMultiline(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

function parseHeader(header: string): {
  ts: string;
  target: string;
  slug: string | null;
} | null {
  const match = header.match(
    /^(?<ts>\S+)\s+\[(?<target>[^\]]+)\](?:\s+\[slug:(?<slug>[^\]]+)\])?$/,
  );
  if (!match?.groups?.ts || !match.groups.target) return null;
  return {
    ts: match.groups.ts,
    target: match.groups.target,
    slug: match.groups.slug ?? null,
  };
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse failures and expose the raw block instead.
  }
  return {
    type: "unparsed-log-block",
    raw,
  };
}

export function isDevLogViewerEnabled(): boolean {
  if (process.env.SAJTMASKIN_DEV_LOG === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function readDevLogEntries(options?: {
  slug?: string | null;
  limit?: number;
}): DevLogViewerEntry[] {
  if (!fs.existsSync(ROOT_DOC_LOG_PATH)) return [];

  const raw = normalizeMultiline(fs.readFileSync(ROOT_DOC_LOG_PATH, "utf8"));
  const clipped = raw.length > MAX_DOCUMENT_CHARS ? raw.slice(-MAX_DOCUMENT_CHARS) : raw;
  const blocks = clipped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const entries: DevLogViewerEntry[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines.shift()?.trim() ?? "";
    const parsedHeader = parseHeader(header);
    if (!parsedHeader) continue;

    const data = safeParseObject(lines.join("\n").trim());
    const entrySlug =
      parsedHeader.slug ||
      (typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : null);

    entries.push({
      ts: parsedHeader.ts,
      target: parsedHeader.target,
      slug: entrySlug,
      data,
    });
  }

  const filtered = options?.slug
    ? entries.filter((entry) => entry.slug === options.slug)
    : entries;
  const newestFirst = filtered.reverse();
  const limit = Number.isFinite(options?.limit) ? Math.max(1, Number(options?.limit)) : 200;
  return newestFirst.slice(0, limit);
}

export function readAvailableDevLogSlugs(limit = 40): string[] {
  const entries = readDevLogEntries({ limit: 500 });
  const slugs = new Set<string>();
  for (const entry of entries) {
    if (entry.slug) {
      slugs.add(entry.slug);
    }
    if (slugs.size >= limit) break;
  }
  return [...slugs];
}
