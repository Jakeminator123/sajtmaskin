/**
 * Redis Connection Test Script
 * Tests Redis connection and basic operations
 */

import { getRedis, setCache, getCache, getRedisInfo } from "./src/lib/redis";
import { REDIS_CONFIG, FEATURES } from "./src/lib/config";

async function testRedis() {
  console.log("=".repeat(60));
  console.log("Redis Connection Test");
  console.log("=".repeat(60));
  console.log();

  // Check configuration
  console.log("Configuration:");
  console.log(`  REDIS_HOST: ${REDIS_CONFIG.host || "NOT SET"}`);
  console.log(`  REDIS_PORT: ${REDIS_CONFIG.port}`);
  console.log(`  REDIS_USERNAME: ${REDIS_CONFIG.username || "NOT SET"}`);
  console.log(`  REDIS_PASSWORD: ${REDIS_CONFIG.password ? "***SET***" : "NOT SET"}`);
  console.log(`  Enabled: ${FEATURES.useRedisCache}`);
  console.log();

  if (!FEATURES.useRedisCache) {
    console.log("❌ Redis is disabled - missing configuration");
    console.log();
    console.log("To enable Redis, set these environment variables:");
    console.log("  export REDIS_HOST=your-redis-host");
    console.log("  export REDIS_PASSWORD=your-redis-password");
    console.log("  export REDIS_PORT=6379  (optional, defaults to 6379)");
    console.log("  export REDIS_USERNAME=default  (optional, defaults to 'default')");
    console.log();
    console.log("Example:");
    console.log("  export REDIS_HOST=redis-12345.upstash.io");
    console.log("  export REDIS_PASSWORD=your-password-here");
    console.log();
    process.exit(1);
  }

  // Get Redis client
  console.log("1. Creating Redis client...");
  const redis = getRedis();
  
  if (!redis) {
    console.log("❌ Failed to create Redis client");
    process.exit(1);
  }
  console.log("✅ Redis client created");
  console.log();

  // Test connection
  console.log("2. Testing connection...");
  try {
    // Connect explicitly (since lazyConnect is true)
    await redis.connect();
    console.log("✅ Connected to Redis");
  } catch (error) {
    console.log("❌ Connection failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
  console.log();

  // Test basic operations
  console.log("3. Testing basic operations...");
  try {
    const testKey = "test:sync";
    const testValue = { message: "Hello Redis!", timestamp: new Date().toISOString() };
    
    // Write
    console.log("   Writing test data...");
    await setCache(testKey, testValue, 60);
    console.log("   ✅ Write successful");
    
    // Read
    console.log("   Reading test data...");
    const readValue = await getCache<typeof testValue>(testKey);
    if (readValue && readValue.message === testValue.message) {
      console.log("   ✅ Read successful");
      console.log(`   Value: ${JSON.stringify(readValue)}`);
    } else {
      console.log("   ❌ Read failed - values don't match");
      console.log(`   Expected: ${JSON.stringify(testValue)}`);
      console.log(`   Got: ${JSON.stringify(readValue)}`);
    }
    
    // Delete
    console.log("   Deleting test data...");
    await redis.del(`cache:${testKey}`);
    console.log("   ✅ Delete successful");
  } catch (error) {
    console.log("   ❌ Operations failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
  console.log();

  // Get Redis info
  console.log("4. Getting Redis info...");
  try {
    const info = await getRedisInfo();
    if (info) {
      console.log("   ✅ Info retrieved:");
      console.log(`   Connected: ${info.connected}`);
      if (info.memoryUsed) {
        console.log(`   Memory Used: ${info.memoryUsed}`);
      }
      if (info.totalKeys !== undefined) {
        console.log(`   Total Keys: ${info.totalKeys}`);
      }
      if (info.uptime !== undefined) {
        console.log(`   Uptime: ${info.uptime}s`);
      }
    } else {
      console.log("   ❌ Failed to get info");
    }
  } catch (error) {
    console.log("   ❌ Info retrieval failed:", error instanceof Error ? error.message : error);
  }
  console.log();

  // Test ping
  console.log("5. Testing PING...");
  try {
    const pong = await redis.ping();
    console.log(`   ✅ PING successful: ${pong}`);
  } catch (error) {
    console.log("   ❌ PING failed:", error instanceof Error ? error.message : error);
  }
  console.log();

  // Close connection
  console.log("6. Closing connection...");
  try {
    await redis.quit();
    console.log("   ✅ Connection closed");
  } catch (error) {
    console.log("   ⚠️  Error closing connection:", error instanceof Error ? error.message : error);
  }
  console.log();

  console.log("=".repeat(60));
  console.log("✅ All tests passed!");
  console.log("=".repeat(60));
}

// Run test
testRedis().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
