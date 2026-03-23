import { Redis } from "@upstash/redis";

let _cached: Redis | null = null;
let _cacheKey: string | null = null;

/** Shared Upstash REST client (same credentials as rate limiting). */
export function getUpstashRestRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) {
    _cached = null;
    _cacheKey = null;
    return null;
  }
  const key = `${url}:${token}`;
  if (_cached && _cacheKey === key) return _cached;
  _cached = new Redis({ url, token });
  _cacheKey = key;
  return _cached;
}
