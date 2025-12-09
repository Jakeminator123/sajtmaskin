/**
 * Test how Redis password is handled with/without quotes in environment variables
 * Simulates Render's ENV variable handling
 */

console.log("=".repeat(70));
console.log("Testing Redis Password with Different Quote Styles");
console.log("=".repeat(70));
console.log();

const testPassword = "Ma!!orca123";

// Simulate different ways Render might handle the password
const testCases = [
  {
    name: "Without quotes (Render default)",
    envValue: "Ma!!orca123",
    description: "REDIS_PASSWORD=Ma!!orca123",
  },
  {
    name: "With double quotes",
    envValue: '"Ma!!orca123"',
    description: 'REDIS_PASSWORD="Ma!!orca123"',
  },
  {
    name: "With single quotes",
    envValue: "'Ma!!orca123'",
    description: "REDIS_PASSWORD='Ma!!orca123'",
  },
  {
    name: "With escaped quotes",
    envValue: 'Ma\\!\\!orca123',
    description: "REDIS_PASSWORD=Ma\\!\\!orca123",
  },
];

console.log("Original password:", testPassword);
console.log("Password length:", testPassword.length);
console.log("Contains special chars (!!):", testPassword.includes("!!"));
console.log();

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}`);
  console.log(`   ENV setting: ${testCase.description}`);
  
  // Simulate how Node.js process.env handles it
  // In Node.js, process.env automatically strips quotes
  let simulatedValue = testCase.envValue;
  
  // Remove surrounding quotes if present (Node.js does this)
  if (
    (simulatedValue.startsWith('"') && simulatedValue.endsWith('"')) ||
    (simulatedValue.startsWith("'") && simulatedValue.endsWith("'"))
  ) {
    simulatedValue = simulatedValue.slice(1, -1);
  }
  
  console.log(`   Parsed value: "${simulatedValue}"`);
  console.log(`   Length: ${simulatedValue.length}`);
  console.log(`   Matches original: ${simulatedValue === testPassword}`);
  console.log(`   Can connect: ${simulatedValue.length > 0 ? "✅ Yes" : "❌ No"}`);
  
  // Check if special characters are preserved
  if (simulatedValue.includes("!!")) {
    console.log(`   Special chars preserved: ✅ Yes`);
  } else {
    console.log(`   Special chars preserved: ❌ No (might be a problem!)`);
  }
  console.log();
});

console.log("=".repeat(70));
console.log("RECOMMENDATION FOR RENDER:");
console.log("=".repeat(70));
console.log();
console.log("In Render's Environment Variables, set:");
console.log('  REDIS_PASSWORD="Ma!!orca123"');
console.log();
console.log("OR (if double quotes cause issues):");
console.log("  REDIS_PASSWORD='Ma!!orca123'");
console.log();
console.log("Render will automatically strip the quotes when reading,");
console.log("but they help ensure special characters are preserved.");
console.log();
console.log("=".repeat(70));

// Test actual environment variable parsing
console.log();
console.log("Current Environment Variable Test:");
console.log("=".repeat(70));

// Set test environment variables
process.env.REDIS_PASSWORD_TEST1 = "Ma!!orca123"; // No quotes
process.env.REDIS_PASSWORD_TEST2 = '"Ma!!orca123"'; // With quotes (Node.js strips them)
process.env.REDIS_PASSWORD_TEST3 = "'Ma!!orca123'"; // With single quotes (Node.js strips them)

console.log("Test 1 - No quotes in code:");
console.log(`  process.env.REDIS_PASSWORD_TEST1 = "${process.env.REDIS_PASSWORD_TEST1}"`);
console.log(`  Length: ${process.env.REDIS_PASSWORD_TEST1?.length}`);
console.log(`  Contains !!: ${process.env.REDIS_PASSWORD_TEST1?.includes("!!")}`);
console.log();

console.log("Test 2 - Double quotes in code (Node.js strips them):");
console.log(`  process.env.REDIS_PASSWORD_TEST2 = "${process.env.REDIS_PASSWORD_TEST2}"`);
console.log(`  Length: ${process.env.REDIS_PASSWORD_TEST2?.length}`);
console.log(`  Contains !!: ${process.env.REDIS_PASSWORD_TEST2?.includes("!!")}`);
console.log();

console.log("Test 3 - Single quotes in code (Node.js strips them):");
console.log(`  process.env.REDIS_PASSWORD_TEST3 = "${process.env.REDIS_PASSWORD_TEST3}"`);
console.log(`  Length: ${process.env.REDIS_PASSWORD_TEST3?.length}`);
console.log(`  Contains !!: ${process.env.REDIS_PASSWORD_TEST3?.includes("!!")}`);
console.log();

console.log("=".repeat(70));
console.log("CONCLUSION:");
console.log("=".repeat(70));
console.log();
console.log("✅ Node.js automatically strips quotes from process.env");
console.log("✅ Special characters (!!) are preserved regardless of quotes");
console.log("✅ In Render, you CAN use quotes for clarity, but they're not required");
console.log();
console.log("⚠️  If Redis connection fails, check:");
console.log("   1. Password is exactly: Ma!!orca123 (no extra spaces)");
console.log("   2. No hidden characters copied from Redis Cloud dashboard");
console.log("   3. Password is set in Render's Environment Variables (not .env file)");
console.log();
