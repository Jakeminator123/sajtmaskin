/**
 * Pure helpers for `dump-redis-cache.mjs`.
 *
 * Extracted so chat-scope policy, timestamp parsing and preview key
 * candidates can be unit-tested without opening a Redis connection
 * (the dump script connects on load).
 */
import { truncateMetaStrings } from "./dump-logs-meta.mjs";

/** Shown in `skipped.handoffs` when `--chat` is set. */
export const HANDOFF_CHAT_SKIP_REASON =
  "kan inte chat-filtreras (nycklar är id-only; payloaden saknar chatId)";

/** Shown in `skipped.anonBriefs` when `--chat` is set. Init-briefs use `anon`. */
export const ANON_BRIEF_CHAT_SKIP_REASON =
  "init-briefs cachas som anon och kan inte knytas till chatId";

export const EMPTY_CHAT_FLAG_ERROR =
  "--chat was given but empty. Pass a chatId or omit the flag.";

/**
 * Prompt-handoff keys are `{prefix}prompt_handoff:{id}`. The payload
 * (`CachedPromptHandoff`) has projectId / userId / sessionId — sessionId is
 * the auth cookie, not engine chatId. There is no reliable chat join, so a
 * `--chat` dump must not SCAN the whole handoff namespace (other users'
 * full prompts).
 */
export function handoffSkipReason(chatId) {
  return chatId ? HANDOFF_CHAT_SKIP_REASON : null;
}

export function anonBriefSkipReason(chatId) {
  return chatId ? ANON_BRIEF_CHAT_SKIP_REASON : null;
}

export function chatFlagPresent(argv) {
  return argv.some((a) => a === "--chat" || a.startsWith("--chat="));
}

/**
 * `--chat` omitted → unscoped dump. `--chat=` / `--chat` without a value is
 * a footgun (empty substitution) and must fail closed, not scan everyone.
 */
export function resolveChatId(raw, flagPresent) {
  if (!flagPresent) return { chatId: null };
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { error: EMPTY_CHAT_FLAG_ERROR };
  return { chatId: trimmed };
}

/** Key shape: `{prefix}brief:v1:{modelId}:{chatId|anon}:{promptHash}`. */
export function briefKeyBelongsToChat(key, chatId) {
  if (!chatId) return true;
  return String(key).includes(`:${chatId}:`);
}

export function toEpochMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export function parseCacheValue(raw) {
  if (raw == null) return { value: null, cachedAt: null };
  try {
    const parsed = JSON.parse(raw);
    const cachedAt =
      parsed && typeof parsed === "object"
        ? toEpochMs(parsed.cachedAt) ??
          toEpochMs(parsed.createdAt) ??
          toEpochMs(parsed.lastUsedAt)
        : null;
    return { value: truncateMetaStrings(parsed), cachedAt };
  } catch {
    return { value: truncateMetaStrings(String(raw)), cachedAt: null };
  }
}

export function decodeUserinfo(value) {
  if (!value || !value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Pathname `/1` → db 1. Empty path → 0. Never returns the URL. */
export function redisDbFromPathname(pathname) {
  const dbRaw = String(pathname ?? "").replace(/^\//, "").split("/")[0];
  if (dbRaw === "") return 0;
  const db = Number.parseInt(dbRaw, 10);
  return Number.isFinite(db) ? db : 0;
}

export function parseRedisConnect(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return { error: "REDIS_URL / KV_URL is missing a host." };
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: decodeUserinfo(parsed.username) || "default",
      password: decodeUserinfo(parsed.password),
      db: redisDbFromPathname(parsed.pathname),
      useTls: /^rediss:\/\//i.test(url),
    };
  } catch {
    return { error: "REDIS_URL / KV_URL is not a valid URL." };
  }
}

export function sortByCachedAtDesc(entries) {
  return [...entries].sort((a, b) => (b.cachedAt ?? -1) - (a.cachedAt ?? -1));
}

function escapeRedisGlob(value) {
  return String(value).replace(/[\\*?[\]]/g, "\\$&");
}

/**
 * Exact GET candidates for one chat. Matches `readPreviewSessionFromRedis`:
 * current `preview-session:session:` then legacy `sandbox-preview:session:`,
 * raw chatId plus `encodeURIComponent` (same as session-store.ts).
 */
export function previewExactKeys(prefix, chatId) {
  const encoded = encodeURIComponent(chatId);
  const suffixes = [
    `preview-session:session:${chatId}`,
    `preview-session:session:${encoded}`,
    `sandbox-preview:session:${chatId}`,
    `sandbox-preview:session:${encoded}`,
  ];
  return [...new Set(suffixes.map((suffix) => `${prefix}${suffix}`))];
}

export function kindPatterns(kind, prefix, chatId) {
  if (kind === "briefs") {
    if (chatId) {
      const escaped = escapeRedisGlob(chatId);
      return [`${prefix}brief:v1:*:${escaped}:*`];
    }
    return [`${prefix}brief:v1:*`];
  }
  if (kind === "handoffs") {
    // Empty when `--chat` is set: do not SCAN other users' prompts.
    return chatId ? [] : [`${prefix}prompt_handoff:*`];
  }
  if (kind === "previews") {
    return chatId
      ? []
      : [`${prefix}preview-session:session:*`, `${prefix}sandbox-preview:session:*`];
  }
  return [];
}
