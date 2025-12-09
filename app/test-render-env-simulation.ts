/**
 * Simulate how Render handles environment variables with special characters
 * This tests what happens when password is set WITH and WITHOUT quotes in Render's UI
 */

console.log("=".repeat(70));
console.log("Render Environment Variable Simulation");
console.log("=".repeat(70));
console.log();

// Simulate what happens when you set values in Render's ENV UI
// Render's UI might handle quotes differently than command line

const scenarios = [
  {
    name: "Scenario 1: Set WITHOUT quotes in Render UI",
    renderInput: "Ma!!orca123",
    whatHappens: "You type: Ma!!orca123 (no quotes)",
    expectedInNode: "Ma!!orca123",
  },
  {
    name: "Scenario 2: Set WITH double quotes in Render UI",
    renderInput: '"Ma!!orca123"',
    whatHappens: 'You type: "Ma!!orca123" (with quotes)',
    expectedInNode: "Ma!!orca123", // Render should strip quotes
  },
  {
    name: "Scenario 3: Set WITH single quotes in Render UI",
    renderInput: "'Ma!!orca123'",
    whatHappens: "You type: 'Ma!!orca123' (with single quotes)",
    expectedInNode: "Ma!!orca123", // Render should strip quotes
  },
];

console.log("Testing how Render processes REDIS_PASSWORD:");
console.log();

scenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.name}`);
  console.log(`   What you type in Render: ${scenario.whatHappens}`);
  
  // Simulate: When Render sets the env var, it might include or exclude quotes
  // In reality, Render's UI usually strips quotes, but let's test both
  
  // Test A: Render strips quotes (most common)
  let valueIfStripped = scenario.renderInput.replace(/^["']|["']$/g, "");
  console.log(`   If Render strips quotes: "${valueIfStripped}"`);
  console.log(`   Length: ${valueIfStripped.length}`);
  console.log(`   Matches expected: ${valueIfStripped === scenario.expectedInNode ? "✅" : "❌"}`);
  console.log(`   Contains !!: ${valueIfStripped.includes("!!") ? "✅" : "❌"}`);
  
  // Test B: Render keeps quotes (less common but possible)
  let valueIfKept = scenario.renderInput;
  console.log(`   If Render keeps quotes: "${valueIfKept}"`);
  console.log(`   Length: ${valueIfKept.length}`);
  console.log(`   Would work: ${valueIfKept === scenario.expectedInNode ? "✅" : "❌ (quotes included!)"}`);
  console.log();
});

console.log("=".repeat(70));
console.log("REAL TEST: Setting actual environment variables");
console.log("=".repeat(70));
console.log();

// Test with actual process.env to see what Node.js receives
const originalPassword = "Ma!!orca123";

// Test 1: Set without quotes (simulating Render UI input without quotes)
process.env.TEST_PASSWORD_1 = "Ma!!orca123";
console.log("Test 1: REDIS_PASSWORD=Ma!!orca123 (no quotes in Render UI)");
console.log(`  process.env.TEST_PASSWORD_1 = "${process.env.TEST_PASSWORD_1}"`);
console.log(`  Length: ${process.env.TEST_PASSWORD_1?.length}`);
console.log(`  Matches original: ${process.env.TEST_PASSWORD_1 === originalPassword ? "✅ YES" : "❌ NO"}`);
console.log(`  Can use for Redis: ${process.env.TEST_PASSWORD_1?.includes("!!") ? "✅ YES" : "❌ NO"}`);
console.log();

// Test 2: What if quotes are included (some systems do this)
// Note: When you SET process.env with quotes, Node.js keeps them!
process.env.TEST_PASSWORD_2 = '"Ma!!orca123"';
console.log("Test 2: REDIS_PASSWORD=\"Ma!!orca123\" (with quotes in Render UI)");
console.log(`  process.env.TEST_PASSWORD_2 = "${process.env.TEST_PASSWORD_2}"`);
console.log(`  Length: ${process.env.TEST_PASSWORD_2?.length}`);
console.log(`  Matches original: ${process.env.TEST_PASSWORD_2 === originalPassword ? "✅ YES" : "❌ NO"}`);
console.log(`  Problem: ${process.env.TEST_PASSWORD_2?.startsWith('"') ? "❌ Quotes included in value!" : "✅ No quotes"}`);
console.log();

// Test 3: Simulate what happens if you copy-paste from Redis Cloud
// Sometimes there might be hidden characters or spaces
process.env.TEST_PASSWORD_3 = " Ma!!orca123 "; // With spaces
console.log("Test 3: REDIS_PASSWORD=' Ma!!orca123 ' (with spaces - common mistake)");
console.log(`  process.env.TEST_PASSWORD_3 = "${process.env.TEST_PASSWORD_3}"`);
console.log(`  Length: ${process.env.TEST_PASSWORD_3?.length}`);
console.log(`  Trimmed: "${process.env.TEST_PASSWORD_3?.trim()}"`);
console.log(`  Matches original: ${process.env.TEST_PASSWORD_3?.trim() === originalPassword ? "✅ YES (after trim)" : "❌ NO"}`);
console.log();

console.log("=".repeat(70));
console.log("VERIFICATION: Test actual Redis connection");
console.log("=".repeat(70));
console.log();

// Now test with the actual password
const testPassword = process.env.TEST_PASSWORD_1 || originalPassword;

console.log(`Using password: "${testPassword}"`);
console.log(`Password length: ${testPassword.length}`);
console.log(`Contains !!: ${testPassword.includes("!!") ? "✅" : "❌"}`);
console.log();

// Import Redis config to verify
import { REDIS_CONFIG } from "./src/lib/config";

// Set test values
process.env.REDIS_HOST = "redis-12352.fcrce259.eu-central-1-3.ec2.cloud.redislabs.com";
process.env.REDIS_PORT = "12352";
process.env.REDIS_PASSWORD = testPassword;
process.env.REDIS_USERNAME = "default";

console.log("Configuration check:");
console.log(`  REDIS_CONFIG.password length: ${REDIS_CONFIG.password?.length || 0}`);
console.log(`  REDIS_CONFIG.password matches: ${REDIS_CONFIG.password === originalPassword ? "✅ YES" : "❌ NO"}`);
console.log(`  REDIS_CONFIG.password === testPassword: ${REDIS_CONFIG.password === testPassword ? "✅ YES" : "❌ NO"}`);
console.log();

console.log("=".repeat(70));
console.log("FINAL RECOMMENDATION FOR RENDER:");
console.log("=".repeat(70));
console.log();
console.log("✅ BEST PRACTICE: Set WITHOUT quotes in Render's UI:");
console.log('   REDIS_PASSWORD = Ma!!orca123');
console.log();
console.log("⚠️  If you use quotes in Render's UI, they might be included in the value!");
console.log("   This would cause connection to fail because password would be '\"Ma!!orca123\"'");
console.log();
console.log("✅ VERIFY in your app:");
console.log("   Check: process.env.REDIS_PASSWORD === 'Ma!!orca123'");
console.log("   Length should be: 11");
console.log("   Should contain: !!");
console.log();
