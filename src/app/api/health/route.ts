/**
 * Health Check API
 * ================
 * GET /api/health - Check system status including Redis
 */

import { NextResponse } from "next/server";
import { getRedis } from "@/lib/data/redis";
import { FEATURES, REDIS_CONFIG } from "@/lib/config";

export async function GET() {
  const imageGenReason = FEATURES.useBuilderImageGenerations
    ? null
    : "OPENAI_API_KEY saknas — bildinstruktioner i prompt kräver OpenAI (own engine).";
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    features: {
      redis: FEATURES.useRedisCache,
      /** Own-engine builder: prompt image-generation instructions (OpenAI). */
      imageGenerations: FEATURES.useBuilderImageGenerations,
      vercel: FEATURES.useVercelApi,
      vercelBlob: FEATURES.useVercelBlob,
    },
    featureReasons: {
      imageGenerations: imageGenReason,
      vercelBlob: FEATURES.useVercelBlob ? null : "Missing BLOB_READ_WRITE_TOKEN",
    },
  };

  // Test Redis connection
  if (FEATURES.useRedisCache) {
    try {
      const redis = getRedis();
      if (redis) {
        const testKey = "health:test";
        const testValue = `test-${Date.now()}`;

        // Write test
        await redis.setex(testKey, 10, testValue);

        // Read test
        const readValue = await redis.get(testKey);

        // Delete test
        await redis.del(testKey);

        checks.redis = {
          status: "connected",
          host: REDIS_CONFIG.host,
          port: REDIS_CONFIG.port,
          writeTest: readValue === testValue ? "OK" : "FAILED",
        };
      } else {
        checks.redis = {
          status: "client_null",
          error: "Redis client returned null",
        };
      }
    } catch (error) {
      checks.redis = {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  } else {
    checks.redis = {
      status: "disabled",
      reason: "REDIS_URL/KV_URL not configured",
    };
  }

  return NextResponse.json(checks);
}
