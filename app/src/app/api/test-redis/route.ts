/**
 * Redis Test API Endpoint
 * GET /api/test-redis - Test Redis connection and operations
 */

import { NextResponse } from "next/server";
import { getRedis, setCache, getCache, getRedisInfo } from "@/lib/redis";
import { REDIS_CONFIG, FEATURES } from "@/lib/config";

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    configuration: {
      host: REDIS_CONFIG.host || "NOT SET",
      port: REDIS_CONFIG.port,
      username: REDIS_CONFIG.username || "NOT SET",
      password: REDIS_CONFIG.password ? "***SET***" : "NOT SET",
      enabled: FEATURES.useRedisCache,
    },
    tests: {} as Record<string, unknown>,
  };

  if (!FEATURES.useRedisCache) {
    return NextResponse.json(
      {
        ...results,
        error: "Redis is disabled - missing configuration",
        message: "Set REDIS_HOST and REDIS_PASSWORD environment variables to enable",
      },
      { status: 503 }
    );
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      {
        ...results,
        error: "Failed to create Redis client",
      },
      { status: 500 }
    );
  }

  // Test 1: Connection
  try {
    await redis.connect();
    results.tests.connection = { status: "success", message: "Connected" };
  } catch (error) {
    results.tests.connection = {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
    return NextResponse.json(results, { status: 500 });
  }

  // Test 2: Write/Read/Delete
  try {
    const testKey = "test:sync";
    const testValue = {
      message: "Hello Redis!",
      timestamp: new Date().toISOString(),
    };

    // Write
    await setCache(testKey, testValue, 60);
    results.tests.write = { status: "success" };

    // Read
    const readValue = await getCache<typeof testValue>(testKey);
    if (readValue && readValue.message === testValue.message) {
      results.tests.read = {
        status: "success",
        value: readValue,
      };
    } else {
      results.tests.read = {
        status: "failed",
        expected: testValue,
        got: readValue,
      };
    }

    // Delete
    await redis.del(`cache:${testKey}`);
    results.tests.delete = { status: "success" };
  } catch (error) {
    results.tests.operations = {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Test 3: PING
  try {
    const pong = await redis.ping();
    results.tests.ping = { status: "success", response: pong };
  } catch (error) {
    results.tests.ping = {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Test 4: Info
  try {
    const info = await getRedisInfo();
    results.tests.info = {
      status: "success",
      data: info,
    };
  } catch (error) {
    results.tests.info = {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Close connection
  try {
    await redis.quit();
    results.tests.disconnect = { status: "success" };
  } catch (error) {
    results.tests.disconnect = {
      status: "warning",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Determine overall status
  const allTestsPassed = Object.values(results.tests).every(
    (test: unknown) =>
      typeof test === "object" &&
      test !== null &&
      "status" in test &&
      test.status === "success"
  );

  return NextResponse.json(
    {
      ...results,
      overall: allTestsPassed ? "success" : "partial",
    },
    { status: allTestsPassed ? 200 : 207 }
  );
}
