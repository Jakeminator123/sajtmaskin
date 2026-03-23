/**
 * Health Check API
 * ================
 * GET /api/health - Check system status including Redis
 */

import { NextResponse } from "next/server";
import { getRedis } from "@/lib/data/redis";
import { FEATURES, REDIS_CONFIG } from "@/lib/config";
import { dbConfigured, pool } from "@/lib/db/client";
import { resolveConfiguredDbEnv } from "@/lib/db/env";

export async function GET() {
  const v0Reason = FEATURES.useV0Api
    ? null
    : "V0_API_KEY is optional unless you use v0 prompt assist or other v0 integrations";
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    features: {
      redis: FEATURES.useRedisCache,
      v0: FEATURES.useV0Api,
      imageGenerations: FEATURES.useV0Api,
      vercel: FEATURES.useVercelApi,
      vercelBlob: FEATURES.useVercelBlob,
    },
    featureReasons: {
      v0: v0Reason,
      imageGenerations: v0Reason,
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

  // PostgreSQL (runtime pool — same URL as app, e.g. Supabase transaction pooler)
  if (dbConfigured && pool) {
    try {
      const res = await pool.query("SELECT 1 AS ok");
      const row = res.rows[0] as { ok?: number | string } | undefined;
      const ok = row != null && (Number(row.ok) === 1 || row.ok === 1);
      const cfg = resolveConfiguredDbEnv(process.env);
      const source = cfg?.name ?? "unknown";
      const raw = cfg ? (process.env[cfg.name] ?? "").toLowerCase() : "";
      const poolerHint =
        raw.includes("pooler.supabase") || raw.includes(":6543")
          ? "likely_supabase_transaction_pooler"
          : null;
      checks.db = {
        status: ok ? "ok" : "unexpected_result",
        source,
        poolerHint,
      };
    } catch (error) {
      checks.db = {
        status: "error",
        source: resolveConfiguredDbEnv(process.env)?.name ?? "unknown",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  } else {
    checks.db = {
      status: "not_configured",
      reason: "POSTGRES_URL (or fallback) missing",
    };
  }

  return NextResponse.json(checks);
}
