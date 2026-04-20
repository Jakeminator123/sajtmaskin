/**
 * Redis cache for `/api/ai/brief` responses.
 *
 * Identical prompts (refresh / retry / multiple variants of the same model)
 * skip the LLM round-trip and replay the previously generated brief. Keys are
 * versioned so a future shape change can be rolled out by bumping the prefix.
 *
 * Audit reference: `docs/reports/audit-2026-04-20-komplexitet-vs-varde/02-forbattringar.md` §2.7.
 */

import { createHash } from "node:crypto";
import { FEATURES, REDIS_KEY_PREFIX } from "@/lib/config";
import { getRedis } from "@/lib/data/redis";
import { devLogAppend } from "@/lib/logging/devLog";

export type BriefCacheKey = {
  chatId: string | null;
  promptHash: string;
  modelId: string;
};

export type CachedBrief = {
  json: unknown;
  cachedAt: number;
};

export const BRIEF_CACHE_TTL_SECONDS = 60 * 60 * 24;

const BRIEF_CACHE_PREFIX = `${REDIS_KEY_PREFIX}brief:v1:`;
const PROMPT_HASH_HEX_LENGTH = 24;

type ExtraInputs = Record<string, string | number | boolean | null>;

function sortExtras(extras: ExtraInputs | undefined): ExtraInputs {
  if (!extras) return {};
  const sorted: ExtraInputs = {};
  for (const key of Object.keys(extras).sort()) {
    sorted[key] = extras[key];
  }
  return sorted;
}

function computePromptHash(prompt: string, extras: ExtraInputs | undefined): string {
  const payload = JSON.stringify({
    prompt: prompt.trim(),
    ...sortExtras(extras),
  });
  return createHash("sha256")
    .update(payload, "utf8")
    .digest("hex")
    .slice(0, PROMPT_HASH_HEX_LENGTH);
}

export function buildBriefCacheKey(input: {
  chatId?: string | null;
  prompt: string;
  modelId: string;
  extraInputsForHash?: ExtraInputs;
}): BriefCacheKey {
  return {
    chatId: input.chatId ?? null,
    promptHash: computePromptHash(input.prompt, input.extraInputsForHash),
    modelId: input.modelId,
  };
}

function toRedisKey(key: BriefCacheKey): string {
  const chatPart = key.chatId ?? "anon";
  return `${BRIEF_CACHE_PREFIX}${key.modelId}:${chatPart}:${key.promptHash}`;
}

export async function readBriefCache(key: BriefCacheKey): Promise<CachedBrief | null> {
  if (!FEATURES.useRedisCache) return null;
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(toRedisKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBrief;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.cachedAt !== "number") {
      return null;
    }
    return parsed;
  } catch (error) {
    devLogAppend("latest", {
      type: "brief-cache.read.error",
      modelId: key.modelId,
      chatId: key.chatId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function writeBriefCache(key: BriefCacheKey, value: unknown): Promise<void> {
  if (!FEATURES.useRedisCache) return;
  const redis = getRedis();
  if (!redis) return;

  const entry: CachedBrief = { json: value, cachedAt: Date.now() };
  try {
    await redis.setex(toRedisKey(key), BRIEF_CACHE_TTL_SECONDS, JSON.stringify(entry));
  } catch (error) {
    devLogAppend("latest", {
      type: "brief-cache.write.error",
      modelId: key.modelId,
      chatId: key.chatId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
