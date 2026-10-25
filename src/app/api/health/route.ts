/**
 * Health Check API
 * ================
 * GET /api/health - Check system status including Redis
 */

import { NextResponse } from "next/server";
import { getRedis } from "@/lib/data/redis";
import { FEATURES } from "@/lib/config";

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
        const pong = await redis.ping();

        checks.redis = {
          status: pong === "PONG" ? "connected" : "degraded",
        };
      } else {
        checks.redis = {
          status: "client_null",
          error: "Redis client returned null",
        };
      }
    } catch (error) {
      console.error("[API/health] Redis check failed:", error);
      checks.redis = {
        status: "error",
      };
    }
  } else {
    checks.redis = {
      status: "disabled",
      reason: "REDIS_URL/KV_URL not configured",
    };
  }

  return NextResponse.json(checks, {
    headers: { "Cache-Control": "no-store" },
  });
}
