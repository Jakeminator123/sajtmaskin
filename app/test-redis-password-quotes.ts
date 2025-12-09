/**
 * Test Redis connection with password WITH and WITHOUT quotes
 * This verifies if quotes in Render ENV are the problem
 */

import { getRedis } from "./src/lib/redis";
import { REDIS_CONFIG, FEATURES } from "./src/lib/config";

async function testConnection(password: string, description: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Test: ${description}`);
  console.log("=".repeat(70));
  
  // Set the password
  process.env.REDIS_PASSWORD = password;
  process.env.REDIS_HOST = "redis-12352.fcrce259.eu-central-1-3.ec2.cloud.redislabs.com";
  process.env.REDIS_PORT = "12352";
  process.env.REDIS_USERNAME = "default";
  
  // Force reload config (in real app, this happens on startup)
  // We need to clear the module cache to reload config
  delete require.cache[require.resolve("./src/lib/config")];
  delete require.cache[require.resolve("./src/lib/redis")];
  
  // Re-import to get fresh config
  const { REDIS_CONFIG: freshConfig, FEATURES: freshFeatures } = await import("./src/lib/config");
  const { getRedis: freshGetRedis } = await import("./src/lib/redis");
  
  console.log(`Password value: "${password}"`);
  console.log(`Password length: ${password.length}`);
  console.log(`Contains !!: ${password.includes("!!") ? "✅" : "❌"}`);
  console.log(`Config enabled: ${freshFeatures.useRedisCache}`);
  console.log(`Config password length: ${freshConfig.password?.length || 0}`);
  
  if (!freshFeatures.useRedisCache) {
    console.log("❌ Redis disabled - password not set correctly");
    return false;
  }
  
  const redis = freshGetRedis();
  if (!redis) {
    console.log("❌ Failed to create Redis client");
    return false;
  }
  
  try {
    await redis.connect();
    console.log("✅ Connected successfully!");
    
    // Test PING
    const pong = await redis.ping();
    console.log(`✅ PING: ${pong}`);
    
    await redis.quit();
    return true;
  } catch (error) {
    console.log(`❌ Connection failed: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function runTests() {
  console.log("=".repeat(70));
  console.log("Redis Password Quote Verification Test");
  console.log("=".repeat(70));
  console.log("\nThis test verifies if quotes in Render ENV variables cause issues.");
  
  const tests = [
    {
      password: "Ma!!orca123",
      description: "CORRECT: Password WITHOUT quotes (as it should be in Render)",
    },
    {
      password: '"Ma!!orca123"',
      description: "WRONG: Password WITH double quotes (if you added quotes in Render)",
    },
    {
      password: "'Ma!!orca123'",
      description: "WRONG: Password WITH single quotes (if you added quotes in Render)",
    },
  ];
  
  const results: Array<{ description: string; success: boolean }> = [];
  
  for (const test of tests) {
    const success = await testConnection(test.password, test.description);
    results.push({ description: test.description, success });
    
    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.description}`);
    console.log(`   Result: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`);
  });
  
  console.log("\n" + "=".repeat(70));
  console.log("CONCLUSION");
  console.log("=".repeat(70));
  console.log();
  
  const correctTest = results[0];
  const wrongTests = results.slice(1);
  
  if (correctTest.success && wrongTests.every((t) => !t.success)) {
    console.log("✅ VERIFIED: Quotes ARE the problem!");
    console.log();
    console.log("If you add quotes in Render's ENV UI, the password becomes:");
    console.log('  "Ma!!orca123"  (with quotes included)');
    console.log();
    console.log("But Redis expects:");
    console.log("  Ma!!orca123  (without quotes)");
    console.log();
    console.log("✅ SOLUTION: In Render's Environment Variables, set:");
    console.log("   REDIS_PASSWORD = Ma!!orca123");
    console.log("   (NO quotes around the value!)");
  } else if (correctTest.success) {
    console.log("⚠️  All passwords work - quotes might not be the issue");
    console.log("   Check for other problems (spaces, hidden characters, etc.)");
  } else {
    console.log("❌ Even correct password fails - check Redis connection");
  }
  
  console.log();
}

runTests().catch(console.error);
