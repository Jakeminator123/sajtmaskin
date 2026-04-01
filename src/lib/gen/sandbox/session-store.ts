/**
 * Sandbox preview session registry per `chatId` for VM reuse (`tryResumeSandboxById`).
 *
 * - **Sync API** (`getActiveSandboxSession`, …): in-process `Map` only — tests & same-instance hot path.
 * - **Async API** (`getActiveSandboxSessionAsync`, …): when `getRedis()` is configured (`FEATURES.useRedisCache`),
 *   entries are also stored in Redis so another serverless instance can resume the same sandbox (`preview-deploy.md`).
 */

import { REDIS_KEY_PREFIX } from "@/lib/config";
import { getRedis } from "@/lib/data/redis";

export type Tier2Provider = "vercel_sandbox" | "preview_host";

export type SandboxSessionEntry = {
  sandboxId: string;
  sandboxUrl: string;
  /** When set, reuse is only attempted if the requested preview matches this version. */
  versionId: string | null;
  createdAt: number;
  lastUsedAt: number;
  /**
   * Which tier-2 backend created this session — drives resume (`tryResumeTier2Runtime`).
   * Older Redis rows omit this and are treated as {@link Tier2Provider | `vercel_sandbox`}.
   */
  tier2Provider?: Tier2Provider;
};

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_HARD_CAP_MS = 2 * 60 * 60 * 1000;

const REDIS_SESSION_PREFIX = `${REDIS_KEY_PREFIX}sandbox-preview:session:`;
const REDIS_TTL_SECONDS = Math.ceil(DEFAULT_HARD_CAP_MS / 1000);

const sessions = new Map<string, SandboxSessionEntry>();

function redisSessionKey(chatId: string): string {
  return `${REDIS_SESSION_PREFIX}${encodeURIComponent(chatId)}`;
}

function parseTier2Provider(raw: unknown): Tier2Provider | undefined {
  if (raw === "preview_host" || raw === "vercel_sandbox") return raw;
  return undefined;
}

function parseSandboxSessionJson(raw: string): SandboxSessionEntry | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.sandboxId !== "string" || typeof o.sandboxUrl !== "string") return null;
    const createdAt = Number(o.createdAt);
    const lastUsedAt = Number(o.lastUsedAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(lastUsedAt)) return null;
    let versionId: string | null = null;
    if (typeof o.versionId === "string") versionId = o.versionId.trim() ? o.versionId.trim() : null;
    else if (o.versionId !== null && o.versionId !== undefined) return null;
    const tier2Provider = parseTier2Provider(o.tier2Provider);
    return {
      sandboxId: o.sandboxId,
      sandboxUrl: o.sandboxUrl,
      versionId,
      createdAt,
      lastUsedAt,
      ...(tier2Provider ? { tier2Provider } : {}),
    };
  } catch {
    return null;
  }
}

async function readSandboxSessionFromRedis(chatId: string): Promise<SandboxSessionEntry | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(redisSessionKey(chatId));
    if (!raw || typeof raw !== "string") return null;
    return parseSandboxSessionJson(raw);
  } catch (err) {
    console.warn("[sandbox-session] Redis get failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function writeSandboxSessionToRedis(chatId: string, entry: SandboxSessionEntry): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(
      redisSessionKey(chatId),
      REDIS_TTL_SECONDS,
      JSON.stringify({
        sandboxId: entry.sandboxId,
        sandboxUrl: entry.sandboxUrl,
        versionId: entry.versionId,
        createdAt: entry.createdAt,
        lastUsedAt: entry.lastUsedAt,
        ...(entry.tier2Provider ? { tier2Provider: entry.tier2Provider } : {}),
      }),
    );
  } catch (err) {
    console.warn("[sandbox-session] Redis setex failed:", err instanceof Error ? err.message : err);
  }
}

async function deleteSandboxSessionFromRedis(chatId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(redisSessionKey(chatId));
  } catch (err) {
    console.warn("[sandbox-session] Redis del failed:", err instanceof Error ? err.message : err);
  }
}

function isExpired(entry: SandboxSessionEntry, now: number, idleMs: number, hardCapMs: number): boolean {
  if (now - entry.createdAt > hardCapMs) return true;
  if (now - entry.lastUsedAt > idleMs) return true;
  return false;
}

export type TouchSandboxSessionParams = {
  chatId: string;
  sandboxId: string;
  sandboxUrl: string;
  versionId?: string | null;
  now?: number;
  tier2Provider?: Tier2Provider;
};

function resolveTier2ProviderForTouch(
  params: TouchSandboxSessionParams,
  prev: SandboxSessionEntry | undefined,
): Tier2Provider {
  if (params.tier2Provider === "preview_host" || params.tier2Provider === "vercel_sandbox") {
    return params.tier2Provider;
  }
  if (prev && prev.sandboxId === params.sandboxId && prev.tier2Provider === "preview_host") {
    return "preview_host";
  }
  return "vercel_sandbox";
}

export function touchSandboxSession(params: TouchSandboxSessionParams): void {
  const now = params.now ?? Date.now();
  const prev = sessions.get(params.chatId);
  const versionId =
    typeof params.versionId === "string" && params.versionId.trim()
      ? params.versionId.trim()
      : null;
  const tier2Provider = resolveTier2ProviderForTouch(params, prev);
  sessions.set(params.chatId, {
    sandboxId: params.sandboxId,
    sandboxUrl: params.sandboxUrl,
    versionId,
    createdAt: prev?.sandboxId === params.sandboxId ? prev.createdAt : now,
    lastUsedAt: now,
    tier2Provider,
  });
}

export type GetSandboxSessionOptions = {
  now?: number;
  idleMs?: number;
  hardCapMs?: number;
};

export function getActiveSandboxSession(
  chatId: string,
  options?: GetSandboxSessionOptions,
): SandboxSessionEntry | null {
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

export function bumpSandboxSessionActivity(chatId: string, now?: number): void {
  const t = now ?? Date.now();
  const entry = getActiveSandboxSession(chatId, { now: t });
  if (!entry) return;
  entry.lastUsedAt = t;
  sessions.set(chatId, entry);
}

export function clearSandboxSession(chatId: string): void {
  sessions.delete(chatId);
}

/**
 * Prefer in preview start/resume paths when Redis may be available — cross-instance resume (`preview-deploy.md` § VM-resume).
 */
export async function getActiveSandboxSessionAsync(
  chatId: string,
  options?: GetSandboxSessionOptions,
): Promise<SandboxSessionEntry | null> {
  const now = options?.now ?? Date.now();
  const idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
  const hardCapMs = options?.hardCapMs ?? DEFAULT_HARD_CAP_MS;

  if (getRedis()) {
    const fromRedis = await readSandboxSessionFromRedis(chatId);
    if (fromRedis) {
      if (isExpired(fromRedis, now, idleMs, hardCapMs)) {
        await deleteSandboxSessionFromRedis(chatId);
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
    await deleteSandboxSessionFromRedis(chatId);
    return null;
  }
  return entry;
}

export async function touchSandboxSessionAsync(params: TouchSandboxSessionParams): Promise<void> {
  touchSandboxSession(params);
  const entry = sessions.get(params.chatId);
  if (entry) await writeSandboxSessionToRedis(params.chatId, entry);
}

export async function clearSandboxSessionAsync(chatId: string): Promise<void> {
  clearSandboxSession(chatId);
  await deleteSandboxSessionFromRedis(chatId);
}

/** @internal */
export function resetSandboxSessionStoreForTests(): void {
  sessions.clear();
}

export const SANDBOX_SESSION_IDLE_MS = DEFAULT_IDLE_MS;
export const SANDBOX_SESSION_HARD_CAP_MS = DEFAULT_HARD_CAP_MS;
