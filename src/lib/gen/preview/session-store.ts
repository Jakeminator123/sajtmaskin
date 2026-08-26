/**
 * Preview session registry per `chatId` for preview-host/Fly reuse.
 *
 * - **Sync API** (`getActivePreviewSession`, …): in-process `Map` only — tests & same-instance hot path.
 * - **Async API** (`getActivePreviewSessionAsync`, …): when `getRedis()` is configured (`FEATURES.useRedisCache`),
 *   entries are also stored in Redis so another serverless instance can resume the same session (`llm-pipeline.md`).
 */

import { REDIS_KEY_PREFIX } from "@/lib/config";
import { getRedis } from "@/lib/data/redis";

export type Tier2Provider = "preview_host";

export type PreviewSessionEntry = {
  previewSessionId: string;
  /** Host-issued fencing token for this exact session lifecycle. */
  lifecycleToken: string | null;
  /** Host-issued monotonic receipt ordering mutations within this session. */
  mutationRevision: number | null;
  previewUrl: string;
  /** When set, reuse is only attempted if the requested preview matches this version. */
  versionId: string | null;
  /** DB-generated revision of the exact files sent to the preview host. */
  filesRevision: string | null;
  createdAt: number;
  lastUsedAt: number;
  /** Which tier-2 backend created this session. */
  tier2Provider?: Tier2Provider;
};

const DEFAULT_IDLE_MS = 90 * 60 * 1000;
const DEFAULT_HARD_CAP_MS = 2 * 60 * 60 * 1000;

const REDIS_SESSION_PREFIX = `${REDIS_KEY_PREFIX}preview-session:session:`;
const LEGACY_REDIS_SESSION_PREFIX = `${REDIS_KEY_PREFIX}sandbox-preview:session:`;
const REDIS_TTL_SECONDS = Math.ceil(DEFAULT_HARD_CAP_MS / 1000);

const sessions = new Map<string, PreviewSessionEntry>();

function redisSessionKey(chatId: string): string {
  return `${REDIS_SESSION_PREFIX}${encodeURIComponent(chatId)}`;
}

function legacyRedisSessionKey(chatId: string): string {
  return `${LEGACY_REDIS_SESSION_PREFIX}${encodeURIComponent(chatId)}`;
}

function parseTier2Provider(raw: unknown): Tier2Provider | undefined {
  if (raw === "preview_host") return raw;
  return undefined;
}

function nonEmptyString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseMutationRevision(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null;
}

function parsePreviewSessionJson(raw: string): PreviewSessionEntry | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const previewSessionId = nonEmptyString(o.previewSessionId) ?? nonEmptyString(o.sandboxId);
    const previewUrl = nonEmptyString(o.previewUrl) ?? nonEmptyString(o.sandboxUrl);
    if (!previewSessionId || !previewUrl) return null;
    const createdAt = Number(o.createdAt);
    const lastUsedAt = Number(o.lastUsedAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(lastUsedAt)) return null;
    let versionId: string | null = null;
    if (typeof o.versionId === "string") versionId = o.versionId.trim() ? o.versionId.trim() : null;
    else if (o.versionId !== null && o.versionId !== undefined) return null;
    const filesRevision = nonEmptyString(o.filesRevision);
    const lifecycleToken = nonEmptyString(o.lifecycleToken);
    const mutationRevision = parseMutationRevision(o.mutationRevision);
    const tier2Provider = parseTier2Provider(o.tier2Provider);
    return {
      previewSessionId,
      previewUrl,
      versionId,
      filesRevision,
      lifecycleToken,
      mutationRevision,
      createdAt,
      lastUsedAt,
      ...(tier2Provider ? { tier2Provider } : {}),
    };
  } catch {
    return null;
  }
}

async function readPreviewSessionFromRedis(chatId: string): Promise<PreviewSessionEntry | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw =
      (await redis.get(redisSessionKey(chatId))) ||
      (await redis.get(legacyRedisSessionKey(chatId)));
    if (!raw || typeof raw !== "string") return null;
    return parsePreviewSessionJson(raw);
  } catch (err) {
    console.warn("[preview-session] Redis get failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function serializePreviewSession(entry: PreviewSessionEntry): string {
  return JSON.stringify({
    previewSessionId: entry.previewSessionId,
    previewUrl: entry.previewUrl,
    versionId: entry.versionId,
    filesRevision: entry.filesRevision,
    lifecycleToken: entry.lifecycleToken,
    mutationRevision: entry.mutationRevision,
    createdAt: entry.createdAt,
    lastUsedAt: entry.lastUsedAt,
    ...(entry.tier2Provider ? { tier2Provider: entry.tier2Provider } : {}),
  });
}

const REDIS_MISSING_VALUE = "__sajtmaskin_preview_session_missing__";
const WRITE_IF_UNCHANGED_SCRIPT = [
  "local canonical = redis.call('GET', KEYS[1]) or ARGV[3]",
  "local legacy = redis.call('GET', KEYS[2]) or ARGV[3]",
  "if canonical ~= ARGV[1] or legacy ~= ARGV[2] then return 0 end",
  "redis.call('SETEX', KEYS[1], tonumber(ARGV[4]), ARGV[5])",
  "redis.call('DEL', KEYS[2])",
  "return 1",
].join("\n");

type RedisSessionSnapshot = {
  canonicalRaw: string | null;
  legacyRaw: string | null;
  entry: PreviewSessionEntry | null;
};

async function readRedisSessionSnapshot(chatId: string): Promise<RedisSessionSnapshot> {
  const redis = getRedis();
  if (!redis) return { canonicalRaw: null, legacyRaw: null, entry: null };
  const canonicalRaw = await redis.get(redisSessionKey(chatId));
  const legacyRaw = await redis.get(legacyRedisSessionKey(chatId));
  const canonical = typeof canonicalRaw === "string" ? canonicalRaw : null;
  const legacy = typeof legacyRaw === "string" ? legacyRaw : null;
  return {
    canonicalRaw: canonical,
    legacyRaw: legacy,
    entry: parsePreviewSessionJson(canonical ?? legacy ?? ""),
  };
}

async function writePreviewSessionToRedis(
  chatId: string,
  entry: PreviewSessionEntry,
  expected: RedisSessionSnapshot,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const written = await redis.eval(
    WRITE_IF_UNCHANGED_SCRIPT,
    2,
    redisSessionKey(chatId),
    legacyRedisSessionKey(chatId),
    expected.canonicalRaw ?? REDIS_MISSING_VALUE,
    expected.legacyRaw ?? REDIS_MISSING_VALUE,
    REDIS_MISSING_VALUE,
    String(REDIS_TTL_SECONDS),
    serializePreviewSession(entry),
  );
  return Number(written) === 1;
}

const DELETE_IF_UNCHANGED_SCRIPT = [
  "local canonical = redis.call('GET', KEYS[1]) or ARGV[3]",
  "local legacy = redis.call('GET', KEYS[2]) or ARGV[3]",
  "if canonical ~= ARGV[1] or legacy ~= ARGV[2] then return 0 end",
  "redis.call('DEL', KEYS[1], KEYS[2])",
  "return 1",
].join("\n");

type PreviewSessionFence = {
  expectedPreviewSessionId: string;
  expectedLifecycleToken: string | null;
};

function matchesPreviewSessionFence(
  entry: PreviewSessionEntry,
  expected: PreviewSessionFence,
): boolean {
  return (
    entry.previewSessionId === expected.expectedPreviewSessionId &&
    entry.lifecycleToken === expected.expectedLifecycleToken
  );
}

async function deletePreviewSessionFromRedis(
  chatId: string,
  expected?: PreviewSessionFence,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    if (!expected) {
      await redis.del(redisSessionKey(chatId), legacyRedisSessionKey(chatId));
      return true;
    }

    // Compare BOTH canonical and legacy snapshots in one Lua operation. The
    // legacy-only path used to compare/delete just the legacy key, so a start
    // that created canonical N+1 between GET(legacy) and EVAL was invisible and
    // the stale clear incorrectly reported success.
    let snapshot = await readRedisSessionSnapshot(chatId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!snapshot.canonicalRaw && !snapshot.legacyRaw) return true;
      if (!snapshot.entry || !matchesPreviewSessionFence(snapshot.entry, expected)) return false;
      const deleted = await redis.eval(
        DELETE_IF_UNCHANGED_SCRIPT,
        2,
        redisSessionKey(chatId),
        legacyRedisSessionKey(chatId),
        snapshot.canonicalRaw ?? REDIS_MISSING_VALUE,
        snapshot.legacyRaw ?? REDIS_MISSING_VALUE,
        REDIS_MISSING_VALUE,
      );
      if (Number(deleted) === 1) return true;
      snapshot = await readRedisSessionSnapshot(chatId);
    }
    return !snapshot.canonicalRaw && !snapshot.legacyRaw;
  } catch (err) {
    console.warn("[preview-session] Redis del failed:", err instanceof Error ? err.message : err);
    throw err;
  }
}

function isExpired(entry: PreviewSessionEntry, now: number, idleMs: number, hardCapMs: number): boolean {
  if (now - entry.createdAt > hardCapMs) return true;
  if (now - entry.lastUsedAt > idleMs) return true;
  return false;
}

export type TouchPreviewSessionParams = {
  chatId: string;
  previewSessionId: string;
  lifecycleToken?: string | null;
  mutationRevision?: number | null;
  previewUrl: string;
  versionId?: string | null;
  filesRevision?: string | null;
  now?: number;
  tier2Provider?: Tier2Provider;
  /** Only a successful host `/start` receipt may replace an existing lifecycle token. */
  allowLifecycleAdvance?: boolean;
  /** Lifecycle pointer observed immediately before the host `/start` call. */
  expectedPreviousLifecycleToken?: string | null;
  /** Host mutation receipts retry compatible CAS conflicts; heartbeats never do. */
  writeIntent?: "refresh" | "authoritative";
};

function resolveTier2ProviderForTouch(
  params: TouchPreviewSessionParams,
  prev: PreviewSessionEntry | undefined,
): Tier2Provider {
  if (params.tier2Provider === "preview_host") {
    return params.tier2Provider;
  }
  if (
    prev &&
    prev.previewSessionId === params.previewSessionId &&
    prev.tier2Provider === "preview_host"
  ) {
    return "preview_host";
  }
  return "preview_host";
}

function buildTouchedPreviewSession(
  params: TouchPreviewSessionParams,
  prev: PreviewSessionEntry | undefined,
): PreviewSessionEntry {
  const now = params.now ?? Date.now();
  const versionId =
    typeof params.versionId === "string" && params.versionId.trim()
      ? params.versionId.trim()
      : null;
  const tier2Provider = resolveTier2ProviderForTouch(params, prev);
  const samePinnedContent =
    prev?.previewSessionId === params.previewSessionId && prev.versionId === versionId;
  const filesRevision =
    params.filesRevision === undefined && samePinnedContent
      ? prev.filesRevision
      : nonEmptyString(params.filesRevision);
  const lifecycleToken =
    params.lifecycleToken === undefined && prev?.previewSessionId === params.previewSessionId
      ? prev.lifecycleToken
      : nonEmptyString(params.lifecycleToken);
  const mutationRevision =
    params.mutationRevision === undefined && prev?.previewSessionId === params.previewSessionId
      ? prev.mutationRevision
      : parseMutationRevision(params.mutationRevision);
  return {
    previewSessionId: params.previewSessionId,
    lifecycleToken,
    mutationRevision,
    previewUrl: params.previewUrl,
    versionId,
    filesRevision,
    createdAt: prev?.previewSessionId === params.previewSessionId ? prev.createdAt : now,
    lastUsedAt: now,
    tier2Provider,
  };
}

function sameAuthoritativeReceipt(
  left: PreviewSessionEntry,
  right: PreviewSessionEntry,
): boolean {
  return (
    left.previewSessionId === right.previewSessionId &&
    left.lifecycleToken === right.lifecycleToken &&
    left.mutationRevision === right.mutationRevision &&
    left.previewUrl === right.previewUrl &&
    left.versionId === right.versionId &&
    left.filesRevision === right.filesRevision
  );
}

function receiptOrder(
  requested: PreviewSessionEntry,
  previous: PreviewSessionEntry | undefined,
): "advance" | "duplicate" | "legacy" | "stale" {
  if (!previous) return requested.mutationRevision === null ? "legacy" : "advance";
  if (requested.mutationRevision === null) {
    return previous.mutationRevision === null ? "legacy" : "stale";
  }
  if (previous.mutationRevision === null) return "advance";
  if (requested.mutationRevision > previous.mutationRevision) return "advance";
  if (requested.mutationRevision < previous.mutationRevision) return "stale";
  return sameAuthoritativeReceipt(requested, previous) ? "duplicate" : "stale";
}

export function touchPreviewSession(params: TouchPreviewSessionParams): void {
  const prev = sessions.get(params.chatId);
  if (params.writeIntent === "refresh") {
    if (
      !prev ||
      prev.previewSessionId !== params.previewSessionId ||
      prev.lifecycleToken !== nonEmptyString(params.lifecycleToken)
    ) return;
    sessions.set(params.chatId, { ...prev, lastUsedAt: params.now ?? Date.now() });
    return;
  }
  const entry = buildTouchedPreviewSession(params, prev);
  if (receiptOrder(entry, prev) === "stale") return;
  sessions.set(
    params.chatId,
    entry,
  );
}

export type GetPreviewSessionOptions = {
  now?: number;
  idleMs?: number;
  hardCapMs?: number;
};

export function getActivePreviewSession(
  chatId: string,
  options?: GetPreviewSessionOptions,
): PreviewSessionEntry | null {
  const now = options?.now ?? Date.now();
  const idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
  const hardCapMs = options?.hardCapMs ?? DEFAULT_HARD_CAP_MS;
  const entry = sessions.get(chatId);
  if (!entry) return null;
  if (isExpired(entry, now, idleMs, hardCapMs)) {
    sessions.delete(chatId);
    return null;
  }
  return entry;
}

export function clearPreviewSession(chatId: string): void {
  sessions.delete(chatId);
}

/**
 * Prefer in preview start/resume paths when Redis may be available — cross-instance resume (`llm-pipeline.md` § VM-resume).
 */
export async function getActivePreviewSessionAsync(
  chatId: string,
  options?: GetPreviewSessionOptions,
): Promise<PreviewSessionEntry | null> {
  const now = options?.now ?? Date.now();
  const idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
  const hardCapMs = options?.hardCapMs ?? DEFAULT_HARD_CAP_MS;

  if (getRedis()) {
    const fromRedis = await readPreviewSessionFromRedis(chatId);
    if (fromRedis) {
      if (isExpired(fromRedis, now, idleMs, hardCapMs)) {
        const removed = await deletePreviewSessionFromRedis(chatId, {
          expectedPreviewSessionId: fromRedis.previewSessionId,
          expectedLifecycleToken: fromRedis.lifecycleToken,
        });
        if (!removed) {
          // Another instance advanced the pointer between our read and expiry
          // cleanup. Re-read once so this request can observe lifecycle N+1.
          const refreshed = await readPreviewSessionFromRedis(chatId);
          if (refreshed && !isExpired(refreshed, now, idleMs, hardCapMs)) {
            sessions.set(chatId, refreshed);
            return refreshed;
          }
        }
      } else {
        sessions.set(chatId, fromRedis);
        return fromRedis;
      }
    }
  }

  const entry = sessions.get(chatId);
  if (!entry) return null;
  if (isExpired(entry, now, idleMs, hardCapMs)) {
    sessions.delete(chatId);
    await deletePreviewSessionFromRedis(chatId, {
      expectedPreviewSessionId: entry.previewSessionId,
      expectedLifecycleToken: entry.lifecycleToken,
    });
    return null;
  }
  return entry;
}

export async function touchPreviewSessionAsync(
  params: TouchPreviewSessionParams,
): Promise<boolean> {
  if (!getRedis()) {
    touchPreviewSession(params);
    return true;
  }

  let snapshot = await readRedisSessionSnapshot(params.chatId);
  const initialEntry = snapshot.entry ?? sessions.get(params.chatId);
  const requestedToken = nonEmptyString(params.lifecycleToken);
  const hasExpectedPreviousLifecycle = Object.prototype.hasOwnProperty.call(
    params,
    "expectedPreviousLifecycleToken",
  );
  const expectedPreviousLifecycleToken = hasExpectedPreviousLifecycle
    ? nonEmptyString(params.expectedPreviousLifecycleToken)
    : initialEntry?.lifecycleToken ?? null;
  const writeIntent = params.writeIntent ?? "authoritative";
  const maxAttempts = writeIntent === "authoritative" ? 4 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const prev = snapshot.entry ?? (attempt === 0 ? sessions.get(params.chatId) : undefined);
    if (writeIntent === "refresh") {
      if (
        !prev ||
        prev.previewSessionId !== params.previewSessionId ||
        prev.lifecycleToken !== requestedToken
      ) return false;
      const entry = { ...prev, lastUsedAt: params.now ?? Date.now() };
      if (await writePreviewSessionToRedis(params.chatId, entry, snapshot)) {
        sessions.set(params.chatId, entry);
        return true;
      }
      snapshot = await readRedisSessionSnapshot(params.chatId);
      if (snapshot.entry) sessions.set(params.chatId, snapshot.entry);
      return false;
    }

    const entry = buildTouchedPreviewSession(params, prev);
    const order = receiptOrder(entry, prev);
    if (order === "stale") {
      if (prev) sessions.set(params.chatId, prev);
      return false;
    }
    const previousToken = prev?.lifecycleToken ?? null;
    // New hosts provide the authoritative order. Lifecycle-token CAS remains
    // the rollout fallback only for receipts without a mutation revision.
    if (order === "legacy" && params.allowLifecycleAdvance === true) {
      if (!prev && expectedPreviousLifecycleToken !== null) return false;
      if (
        prev &&
        previousToken !== requestedToken &&
        previousToken !== expectedPreviousLifecycleToken
      ) {
        sessions.set(params.chatId, prev);
        return false;
      }
    }
    if (order === "legacy" &&
      prev?.lifecycleToken &&
      requestedToken &&
      prev.lifecycleToken !== requestedToken &&
      params.allowLifecycleAdvance !== true
    ) {
      sessions.set(params.chatId, prev);
      return false;
    }
    if (order === "legacy" && attempt > 0) {
      if (!prev || prev.previewSessionId !== params.previewSessionId) return false;
      const winnerToken = prev.lifecycleToken;
      if (params.allowLifecycleAdvance === true) {
        if (
          winnerToken !== requestedToken &&
          winnerToken !== expectedPreviousLifecycleToken
        ) return false;
      } else if (winnerToken !== requestedToken) {
        return false;
      }
    }
    if (await writePreviewSessionToRedis(params.chatId, entry, snapshot)) {
      sessions.set(params.chatId, entry);
      return true;
    }

    // Refresh writers (heartbeat/resume) only observe the CAS winner. A host
    // mutation receipt is authoritative for its lifecycle and may retry a
    // compatible heartbeat conflict, but never a different lifecycle/token.
    snapshot = await readRedisSessionSnapshot(params.chatId);
    if (snapshot.entry) sessions.set(params.chatId, snapshot.entry);
    if (writeIntent !== "authoritative") return false;
  }
  throw new Error("Preview session Redis CAS remained contended after authoritative host receipt.");
}

export async function clearPreviewSessionAsync(
  chatId: string,
  expected?: PreviewSessionFence,
): Promise<boolean> {
  if (!expected) {
    clearPreviewSession(chatId);
    await deletePreviewSessionFromRedis(chatId);
    return true;
  }

  const localBefore = sessions.get(chatId);
  if (localBefore && !matchesPreviewSessionFence(localBefore, expected)) return false;
  if (!(await deletePreviewSessionFromRedis(chatId, expected))) return false;

  // No await between this final compare and delete: a newer in-process touch
  // cannot be interleaved and therefore cannot be cleared by the old caller.
  const localAfter = sessions.get(chatId);
  if (localAfter && !matchesPreviewSessionFence(localAfter, expected)) return false;
  if (localAfter) sessions.delete(chatId);
  return true;
}

/** @internal */
export function resetPreviewSessionStoreForTests(): void {
  sessions.clear();
}

export const PREVIEW_SESSION_IDLE_MS = DEFAULT_IDLE_MS;
export const PREVIEW_SESSION_HARD_CAP_MS = DEFAULT_HARD_CAP_MS;
