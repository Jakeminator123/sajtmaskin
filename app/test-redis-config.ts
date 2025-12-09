/**
 * Test Redis configuration values
 */

import { REDIS_CONFIG, FEATURES } from "./src/lib/config";

console.log("=".repeat(60));
console.log("Redis Configuration Check");
console.log("=".repeat(60));
console.log();

console.log("Environment Variables:");
console.log(`  REDIS_HOST: ${process.env.REDIS_HOST || "NOT SET"}`);
console.log(`  REDIS_PORT: ${process.env.REDIS_PORT || "NOT SET"}`);
console.log(`  REDIS_USERNAME: ${process.env.REDIS_USERNAME || "NOT SET"}`);
console.log(`  REDIS_PASSWORD: ${process.env.REDIS_PASSWORD ? "***SET***" : "NOT SET"}`);
console.log();

console.log("Parsed Configuration:");
console.log(`  Host: ${REDIS_CONFIG.host || "NOT SET"}`);
console.log(`  Port: ${REDIS_CONFIG.port}`);
console.log(`  Username: ${REDIS_CONFIG.username || "NOT SET"}`);
console.log(`  Password: ${REDIS_CONFIG.password ? "***SET***" : "NOT SET"}`);
console.log(`  Password Length: ${REDIS_CONFIG.password?.length || 0}`);
console.log(`  Enabled: ${FEATURES.useRedisCache}`);
console.log();

// Check for potential issues
const issues: string[] = [];

if (!REDIS_CONFIG.host) {
  issues.push("❌ REDIS_HOST is not set");
} else {
  console.log("✅ REDIS_HOST is set");
  if (!REDIS_CONFIG.host.includes("redislabs.com")) {
    issues.push("⚠️  Host doesn't look like Redis Cloud (redislabs.com)");
  }
}

if (!REDIS_CONFIG.password) {
  issues.push("❌ REDIS_PASSWORD is not set");
} else {
  console.log("✅ REDIS_PASSWORD is set");
  if (REDIS_CONFIG.password.length < 8) {
    issues.push("⚠️  Password seems too short");
  }
  // Check if password contains special characters that might need escaping
  if (/[!@#$%^&*(),.?":{}|<>\[\]\\\/]/.test(REDIS_CONFIG.password)) {
    console.log("⚠️  Password contains special characters - make sure it's properly quoted in Render");
  }
}

if (REDIS_CONFIG.port === 6379 && REDIS_CONFIG.host.includes("redislabs.com")) {
  issues.push("⚠️  Using standard port 6379 with Redis Cloud - might need TLS or different port");
}

if (issues.length > 0) {
  console.log();
  console.log("Potential Issues:");
  issues.forEach((issue) => console.log(`  ${issue}`));
} else {
  console.log("✅ Configuration looks good!");
}

console.log();
console.log("=".repeat(60));
