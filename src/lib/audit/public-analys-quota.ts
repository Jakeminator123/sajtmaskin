import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { REDIS_KEY_PREFIX } from "@/lib/config";

const RESERVATION_TTL_SECONDS = 360;
const COMMITTED_TTL_SECONDS = 48 * 60 * 60;
const REDIS_TIMEOUT_MS = 2_000;
const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const COMMITTED_PREFIX = "committed:";

type QuotaBackend = {
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<string | null>;
  get<TData = unknown>(key: string): Promise<TData | null>;
  eval<TArgs extends unknown[], TData = unknown>(
    script: string,
    keys: string[],
    args: TArgs,
  ): Promise<TData>;
};

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

export type PublicAnalysQuotaReservation = {
  key: string;
  token: string;
  mode: "redis" | "memory";
};

export type PublicAnalysQuotaAcquireResult =
  | { status: "acquired"; reservation: PublicAnalysQuotaReservation }
  | { status: "committed" | "reserved" | "unavailable" };

export type PublicAnalysQuotaMutationResult = "committed" | "released" | "lost" | "unavailable";

const COMMIT_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3])
  return 1
end
return 0
`;

const RELEASE_SCRIPT = `
local current = redis.call("get", KEYS[1])
if current == ARGV[1] or current == ARGV[2] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const memoryStore = new Map<string, MemoryEntry>();
let cachedRedis: QuotaBackend | null = null;
let cachedRedisKey: string | null = null;

function isDeployedRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "production"
  );
}

function getRedisBackend(): QuotaBackend | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) {
    cachedRedis = null;
    cachedRedisKey = null;
    return null;
  }

  const cacheKey = `${url}:${token}`;
  if (cachedRedis && cachedRedisKey === cacheKey) return cachedRedis;

  cachedRedis = new Redis({
    url,
    token,
    retry: false,
    signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
  }) as QuotaBackend;
  cachedRedisKey = cacheKey;
  return cachedRedis;
}

export function getStockholmCalendarDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function quotaKey(clientId: string, now: Date): string {
  const namespace = REDIS_KEY_PREFIX.replace(/:$/, "");
  const clientHash = createHash("sha256").update(clientId).digest("hex");
  return `sajtmaskin:${namespace}:public-analys-quota:${getStockholmCalendarDay(now)}:${clientHash}`;
}

function currentMemoryEntry(key: string, nowMs: number): MemoryEntry | null {
  const entry = memoryStore.get(key);
  if (entry && entry.expiresAt > nowMs) return entry;
  if (entry) memoryStore.delete(key);
  return null;
}

export async function acquirePublicAnalysQuota(
  clientId: string,
  now = new Date(),
): Promise<PublicAnalysQuotaAcquireResult> {
  const key = quotaKey(clientId, now);
  const token = `reserved:${randomUUID()}`;
  let backend: QuotaBackend | null;
  try {
    backend = getRedisBackend();
  } catch (error) {
    console.error("[PublicAnalysQuota] Failed to configure quota storage:", error);
    return { status: "unavailable" };
  }

  if (!backend) {
    if (isDeployedRuntime()) return { status: "unavailable" };
    const current = currentMemoryEntry(key, now.getTime());
    if (current?.value.startsWith(COMMITTED_PREFIX)) return { status: "committed" };
    if (current) return { status: "reserved" };
    memoryStore.set(key, {
      value: token,
      expiresAt: now.getTime() + RESERVATION_TTL_SECONDS * 1_000,
    });
    return { status: "acquired", reservation: { key, token, mode: "memory" } };
  }

  try {
    const didSet = await backend.set(key, token, { nx: true, ex: RESERVATION_TTL_SECONDS });
    if (didSet === "OK") {
      return { status: "acquired", reservation: { key, token, mode: "redis" } };
    }
    const current = await backend.get<string>(key);
    return {
      status:
        typeof current === "string" && current.startsWith(COMMITTED_PREFIX)
          ? "committed"
          : "reserved",
    };
  } catch (error) {
    console.error("[PublicAnalysQuota] Failed to reserve quota:", error);
    return { status: "unavailable" };
  }
}

export async function commitPublicAnalysQuota(
  reservation: PublicAnalysQuotaReservation,
  now = new Date(),
): Promise<PublicAnalysQuotaMutationResult> {
  if (reservation.mode === "memory") {
    const current = currentMemoryEntry(reservation.key, now.getTime());
    if (current?.value !== reservation.token) return "lost";
    memoryStore.set(reservation.key, {
      value: `${COMMITTED_PREFIX}${reservation.token}`,
      expiresAt: now.getTime() + COMMITTED_TTL_SECONDS * 1_000,
    });
    return "committed";
  }

  let backend: QuotaBackend | null;
  try {
    backend = getRedisBackend();
  } catch (error) {
    console.error("[PublicAnalysQuota] Failed to configure quota storage:", error);
    return "unavailable";
  }
  if (!backend) return "unavailable";
  try {
    const result = await backend.eval<[string, string, number], number>(
      COMMIT_SCRIPT,
      [reservation.key],
      [reservation.token, `${COMMITTED_PREFIX}${reservation.token}`, COMMITTED_TTL_SECONDS],
    );
    return result === 1 ? "committed" : "lost";
  } catch (error) {
    console.error("[PublicAnalysQuota] Failed to commit quota:", error);
    return "unavailable";
  }
}

export async function releasePublicAnalysQuota(
  reservation: PublicAnalysQuotaReservation,
  now = new Date(),
): Promise<PublicAnalysQuotaMutationResult> {
  if (reservation.mode === "memory") {
    const current = currentMemoryEntry(reservation.key, now.getTime());
    if (
      current?.value !== reservation.token &&
      current?.value !== `${COMMITTED_PREFIX}${reservation.token}`
    ) {
      return "lost";
    }
    memoryStore.delete(reservation.key);
    return "released";
  }

  let backend: QuotaBackend | null;
  try {
    backend = getRedisBackend();
  } catch (error) {
    console.error("[PublicAnalysQuota] Failed to configure quota storage:", error);
    return "unavailable";
  }
  if (!backend) return "unavailable";
  try {
    const result = await backend.eval<[string, string], number>(
      RELEASE_SCRIPT,
      [reservation.key],
      [reservation.token, `${COMMITTED_PREFIX}${reservation.token}`],
    );
    return result === 1 ? "released" : "lost";
  } catch (error) {
    console.error("[PublicAnalysQuota] Failed to release quota:", error);
    return "unavailable";
  }
}

export function resetPublicAnalysQuotaForTests(): void {
  memoryStore.clear();
  cachedRedis = null;
  cachedRedisKey = null;
}
