/**
 * Test exact password values to see what Redis receives
 */

import Redis from "ioredis";

async function testExactPassword(password: string, description: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(description);
  console.log("=".repeat(70));
  
  console.log(`Password string: "${password}"`);
  console.log(`Password length: ${password.length}`);
  console.log(`Password bytes: ${Buffer.from(password).toString("hex")}`);
  console.log(`Contains !!: ${password.includes("!!")}`);
  
  const redis = new Redis({
    host: "redis-12352.fcrce259.eu-central-1-3.ec2.cloud.redislabs.com",
    port: 12352,
    username: "default",
    password: password,
    lazyConnect: true,
    connectTimeout: 5000,
  });
  
  try {
    await redis.connect();
    const pong = await redis.ping();
    console.log(`✅ Connection SUCCESS - PING: ${pong}`);
    await redis.quit();
    return true;
  } catch (error) {
    console.log(`❌ Connection FAILED: ${error instanceof Error ? error.message : String(error)}`);
    try {
      await redis.quit();
    } catch {}
    return false;
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("Exact Password Value Test");
  console.log("=".repeat(70));
  console.log("\nTesting what Redis actually receives with different password formats");
  
  const tests = [
    {
      password: "Ma!!orca123",
      description: "1. CORRECT: No quotes (what you should set in Render)",
    },
    {
      password: '"Ma!!orca123"',
      description: '2. WITH QUOTES: Double quotes included (wrong - if you added quotes)',
    },
    {
      password: "'Ma!!orca123'",
      description: "3. WITH QUOTES: Single quotes included (wrong - if you added quotes)",
    },
    {
      password: " Ma!!orca123 ",
      description: "4. WITH SPACES: Leading/trailing spaces (common mistake)",
    },
    {
      password: "Ma!!orca123\n",
      description: "5. WITH NEWLINE: Newline at end (copy-paste issue)",
    },
  ];
  
  const results: Array<{ description: string; success: boolean; password: string }> = [];
  
  for (const test of tests) {
    const success = await testExactPassword(test.password, test.description);
    results.push({ ...test, success });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(70));
  
  results.forEach((result) => {
    const icon = result.success ? "✅" : "❌";
    console.log(`${icon} ${result.description}`);
    if (!result.success) {
      console.log(`   Password that failed: "${result.password}"`);
      console.log(`   Length: ${result.password.length}`);
    }
  });
  
  console.log("\n" + "=".repeat(70));
  console.log("VERIFICATION FOR RENDER");
  console.log("=".repeat(70));
  console.log();
  console.log("✅ CORRECT way to set in Render's Environment Variables:");
  console.log("   Key: REDIS_PASSWORD");
  console.log("   Value: Ma!!orca123");
  console.log("   (Type exactly: Ma!!orca123 - NO quotes, NO spaces)");
  console.log();
  console.log("❌ WRONG ways (will cause connection to fail):");
  console.log('   Value: "Ma!!orca123"  (with quotes - quotes become part of password)');
  console.log("   Value: 'Ma!!orca123'  (with single quotes)");
  console.log("   Value:  Ma!!orca123   (with spaces)");
  console.log();
  console.log("🔍 To verify in your Render app, add this debug log:");
  console.log('   console.log("REDIS_PASSWORD:", process.env.REDIS_PASSWORD);');
  console.log('   console.log("Length:", process.env.REDIS_PASSWORD?.length);');
  console.log('   console.log("Should be 11, contains !!:", process.env.REDIS_PASSWORD?.includes("!!"));');
  console.log();
}

main().catch(console.error);
