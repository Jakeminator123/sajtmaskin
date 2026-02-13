import fs from "node:fs";
import path from "node:path";

type DevLogTarget = "in-progress" | "latest";
type DevLogEntry = Record<string, unknown>;

const ROOT_LOG_DIR = path.join(process.cwd(), "logs");
const ROOT_LOG_PATH = path.join(ROOT_LOG_DIR, "sajtmaskin-local.log");
const ROOT_DOC_LOG_PATH = path.join(ROOT_LOG_DIR, "sajtmaskin-local-document.txt");
const MAX_LOG_CHARS = 1000;
const DEFAULT_DOC_MAX_WORDS = 10_000;
const MAX_DOC_MAX_WORDS = 20_000;
const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[-_]?key|session)/i;
const CHAT_SLUG_CACHE_LIMIT = 200;

type SanitizeOptions = {
  maxDepth: number;
  maxArrayItems: number;
  maxStringLength: number;
};

const ROLLING_SANITIZE_OPTIONS: SanitizeOptions = {
  maxDepth: 4,
  maxArrayItems: 12,
  maxStringLength: 260,
};

const DOCUMENT_SANITIZE_OPTIONS: SanitizeOptions = {
  maxDepth: 6,
  maxArrayItems: 40,
  maxStringLength: 4000,
};

const chatSlugMap = new Map<string, string>();
let latestSlug: string | null = null;

function isDevLoggingEnabled(): boolean {
  if (process.env.SAJTMASKIN_DEV_LOG === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function resolveDocumentWordLimit(): number {
  const raw = Number(process.env.SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS);
  if (!Number.isFinite(raw)) return DEFAULT_DOC_MAX_WORDS;
  return raw >= MAX_DOC_MAX_WORDS ? MAX_DOC_MAX_WORDS : DEFAULT_DOC_MAX_WORDS;
}

function truncateString(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function sanitizeValue(value: unknown, options: SanitizeOptions, depth = 0): unknown {
  if (depth > options.maxDepth) return "[truncated]";
  if (typeof value === "string") return truncateString(value, options.maxStringLength);
  if (typeof value !== "object" || value === null) return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayItems)
      .map((item) => sanitizeValue(item, options, depth + 1));
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeValue(entry, options, depth + 1);
  }
  return out;
}

function safeStringify(value: unknown, pretty = false): string {
  try {
    return JSON.stringify(value, null, pretty ? 2 : 0);
  } catch {
    return JSON.stringify({ value: "[unserializable]" }, null, pretty ? 2 : 0);
  }
}

function ensureRootLogFiles(): void {
  try {
    if (!fs.existsSync(ROOT_LOG_DIR)) {
      fs.mkdirSync(ROOT_LOG_DIR, { recursive: true });
    }
    if (!fs.existsSync(ROOT_LOG_PATH)) {
      fs.writeFileSync(ROOT_LOG_PATH, "", "utf8");
    }
    if (!fs.existsSync(ROOT_DOC_LOG_PATH)) {
      fs.writeFileSync(ROOT_DOC_LOG_PATH, "", "utf8");
    }
  } catch {
    // Best-effort. Never break API routes due to dev logging.
  }
}

function toSlug(value: string): string | null {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || null;
}

function readString(entry: DevLogEntry, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rememberChatSlug(chatId: string, slug: string): void {
  if (!chatId || !slug) return;
  chatSlugMap.set(chatId, slug);
  if (chatSlugMap.size <= CHAT_SLUG_CACHE_LIMIT) return;
  const firstKey = chatSlugMap.keys().next().value;
  if (firstKey) chatSlugMap.delete(firstKey);
}

function deriveSlugFromEntry(entry: DevLogEntry): string | null {
  const explicit = toSlug(
    readString(entry, "slug") ||
      readString(entry, "siteSlug") ||
      readString(entry, "projectSlug") ||
      "",
  );
  if (explicit) return explicit;

  const message = readString(entry, "message");
  if (message && readString(entry, "type") === "site.start") {
    return toSlug(message.split(/\s+/).slice(0, 12).join(" "));
  }

  const projectId = readString(entry, "projectId");
  if (projectId) return toSlug(`project-${projectId}`);

  const chatId = readString(entry, "chatId");
  if (chatId) return toSlug(`chat-${chatId}`);

  const type = readString(entry, "type");
  if (type) return toSlug(type);

  return null;
}

function enrichEntryWithSlug(entry: DevLogEntry): DevLogEntry {
  const enriched: DevLogEntry = { ...entry };
  const chatId = readString(enriched, "chatId");
  const explicitSlug = toSlug(
    readString(enriched, "slug") ||
      readString(enriched, "siteSlug") ||
      readString(enriched, "projectSlug") ||
      "",
  );

  let slug = explicitSlug;
  if (!slug && chatId) {
    slug = chatSlugMap.get(chatId) || null;
  }
  if (!slug) {
    slug = deriveSlugFromEntry(enriched);
  }
  if (!slug && latestSlug) {
    slug = latestSlug;
  }

  if (slug) {
    enriched.slug = slug;
    latestSlug = slug;
    if (chatId) {
      rememberChatSlug(chatId, slug);
    }
  }

  if (!slug && readString(enriched, "type") === "site.chatId" && chatId && latestSlug) {
    rememberChatSlug(chatId, latestSlug);
    enriched.slug = latestSlug;
  }

  return enriched;
}

function clipByWords(content: string, maxWords: number): string {
  if (!content) return content;
  const matches = Array.from(content.matchAll(/\S+/g));
  if (matches.length <= maxWords) return content;
  const start = matches[matches.length - maxWords]?.index ?? 0;
  return content.slice(start);
}

function appendRollingLine(target: DevLogTarget, entry: DevLogEntry): void {
  try {
    ensureRootLogFiles();
    const enriched = enrichEntryWithSlug(entry);
    const shortSanitized = sanitizeValue(enriched, ROLLING_SANITIZE_OPTIONS);
    const line = `${new Date().toISOString()} [${target}] ${safeStringify(shortSanitized)}\n`;
    const current = fs.existsSync(ROOT_LOG_PATH) ? fs.readFileSync(ROOT_LOG_PATH, "utf8") : "";
    const next = `${current}${line}`;
    const clipped = next.length > MAX_LOG_CHARS ? next.slice(-MAX_LOG_CHARS) : next;
    fs.writeFileSync(ROOT_LOG_PATH, clipped, "utf8");

    const docSanitized = sanitizeValue(enriched, DOCUMENT_SANITIZE_OPTIONS);
    const slugPart = readString(enriched, "slug");
    const docHeader = `${new Date().toISOString()} [${target}]${slugPart ? ` [slug:${slugPart}]` : ""}`;
    const docBlock = `${docHeader}\n${safeStringify(docSanitized, true)}\n\n`;
    const docCurrent = fs.existsSync(ROOT_DOC_LOG_PATH)
      ? fs.readFileSync(ROOT_DOC_LOG_PATH, "utf8")
      : "";
    const docNext = `${docCurrent}${docBlock}`;
    const docClipped = clipByWords(docNext, resolveDocumentWordLimit());
    fs.writeFileSync(ROOT_DOC_LOG_PATH, docClipped, "utf8");
  } catch {
    // Best-effort. Never break API routes due to dev logging.
  }
}

if (isDevLoggingEnabled()) {
  ensureRootLogFiles();
}

export function devLogStartNewSite(params: {
  message: string;
  modelId?: string;
  thinking?: boolean;
  imageGenerations?: boolean;
  projectId?: string;
  slug?: string;
}): void {
  if (!isDevLoggingEnabled()) return;

  appendRollingLine("in-progress", {
    type: "site.start",
    message: params.message,
    modelId: params.modelId ?? null,
    thinking: typeof params.thinking === "boolean" ? params.thinking : null,
    imageGenerations: typeof params.imageGenerations === "boolean" ? params.imageGenerations : null,
    projectId: params.projectId ?? null,
    slug: params.slug ?? null,
  });
}

export function devLogAppend(target: DevLogTarget, entry: DevLogEntry): void {
  if (!isDevLoggingEnabled()) return;
  appendRollingLine(target, entry);
}

export function devLogFinalizeSite(): void {
  if (!isDevLoggingEnabled()) return;
  appendRollingLine("latest", { type: "site.finalized" });
}
