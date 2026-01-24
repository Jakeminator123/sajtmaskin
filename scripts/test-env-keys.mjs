#!/usr/bin/env node
/**
 * Test Environment Keys - Verifierar alla API-nycklar
 *
 * Detta skript testar att dina API-nycklar fungerar genom att göra
 * enkla anrop till respektive API.
 *
 * ANVÄNDNING:
 *   node scripts/test-env-keys.mjs              # Testar .env.local
 *   node scripts/test-env-keys.mjs --prod       # Testar .env.production
 *
 * NYCKLAR SOM TESTAS:
 *   - OPENAI_API_KEY      (obligatorisk) - Testar models endpoint
 *   - V0_API_KEY          (obligatorisk) - Testar v0 API
 *   - AI_GATEWAY_API_KEY  (valfri)       - Testar Vercel AI Gateway
 *   - BLOB_READ_WRITE_TOKEN (valfri)     - Testar Vercel Blob
 *   - UNSPLASH_ACCESS_KEY (valfri)       - Testar Unsplash API
 *   - STRIPE_SECRET_KEY   (valfri)       - Testar Stripe API
 */

import { config } from "dotenv";
import { resolve } from "path";

// Parse command line arguments
const args = process.argv.slice(2);
const useProd = args.includes("--prod") || args.includes("-p");
const envFile = useProd ? ".env.production" : ".env.local";

// Load environment variables
config({ path: resolve(process.cwd(), envFile) });

console.log("\n" + "═".repeat(70));
console.log("🔑 SAJTMASKIN - API Key Verification");
console.log("═".repeat(70));
console.log(`\n📁 Testing keys from: ${envFile}\n`);

const results = [];

function log(key, status, message, details = "") {
  const icons = {
    ok: "✅",
    warn: "⚠️",
    fail: "❌",
    skip: "⏭️",
  };
  const icon = icons[status] || "❓";
  console.log(`${icon} ${key.padEnd(25)} ${message}`);
  if (details) {
    console.log(`   ${details}`);
  }
  results.push({ key, status, message, details });
}

function maskKey(key) {
  if (!key) return "(not set)";
  if (key.length <= 8) return "****";
  return key.substring(0, 4) + "..." + key.substring(key.length - 4);
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log("OPENAI_API_KEY", "fail", "Missing (REQUIRED)", "Set this in your env file");
    return false;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (response.ok) {
      const data = await response.json();
      const modelCount = data.data?.length || 0;
      log("OPENAI_API_KEY", "ok", `Valid (${modelCount} models available)`, maskKey(key));
      return true;
    } else {
      const error = await response.json().catch(() => ({}));
      log(
        "OPENAI_API_KEY",
        "fail",
        `Invalid: ${error.error?.message || response.status}`,
        maskKey(key),
      );
      return false;
    }
  } catch (error) {
    log("OPENAI_API_KEY", "fail", `Error: ${error.message}`, maskKey(key));
    return false;
  }
}

async function testV0() {
  const key = process.env.V0_API_KEY;
  if (!key) {
    log("V0_API_KEY", "fail", "Missing (REQUIRED)", "Get it from v0.dev/settings");
    return false;
  }

  try {
    // Use v0-sdk to test (same way as the app uses it)
    const { createClient } = await import("v0-sdk");
    const v0 = createClient({ apiKey: key });

    // Test with a simple chat creation
    const testResult = await v0.chats.create({
      message: "Say hi",
      system: "Be brief",
      chatPrivacy: "private",
      modelConfiguration: {
        modelId: "v0-1.5-md",
        imageGenerations: false,
        thinking: false,
      },
      responseMode: "sync",
    });

    if (testResult && testResult.id) {
      log(
        "V0_API_KEY",
        "ok",
        `Valid (chat created: ${testResult.id.slice(0, 8)}...)`,
        maskKey(key),
      );
      return true;
    } else {
      log("V0_API_KEY", "warn", "API responded but no chat ID", maskKey(key));
      return true;
    }
  } catch (error) {
    const msg = error.message || String(error);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      log("V0_API_KEY", "fail", "Invalid or expired key", maskKey(key));
      return false;
    } else if (msg.includes("422")) {
      // 422 = validation error, but key is valid
      log("V0_API_KEY", "ok", "Valid (API responded)", maskKey(key));
      return true;
    } else {
      // Other errors - might be network or API issues
      log("V0_API_KEY", "warn", `Error: ${msg.slice(0, 50)}`, maskKey(key));
      return true;
    }
  }
}

async function testAIGateway() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    log(
      "AI_GATEWAY_API_KEY",
      "skip",
      "Not configured (optional)",
      "Get it from vercel.com/ai-gateway",
    );
    return true;
  }

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (response.ok) {
      const data = await response.json();
      const modelCount = data.data?.length || 0;
      log("AI_GATEWAY_API_KEY", "ok", `Valid (${modelCount} models)`, maskKey(key));
      return true;
    } else {
      const error = await response.json().catch(() => ({}));
      log(
        "AI_GATEWAY_API_KEY",
        "fail",
        `Invalid: ${error.error?.message || response.status}`,
        maskKey(key),
      );
      return false;
    }
  } catch (error) {
    log("AI_GATEWAY_API_KEY", "fail", `Error: ${error.message}`, maskKey(key));
    return false;
  }
}

async function testBlob() {
  const key = process.env.BLOB_READ_WRITE_TOKEN;
  if (!key) {
    log(
      "BLOB_READ_WRITE_TOKEN",
      "skip",
      "Not configured (optional)",
      "Needed for AI-generated images",
    );
    return true;
  }

  try {
    // Just check format - actual test would require Vercel SDK
    if (key.length > 20) {
      log("BLOB_READ_WRITE_TOKEN", "ok", "Format valid (length check)", maskKey(key));
      return true;
    }
    log("BLOB_READ_WRITE_TOKEN", "warn", "Unusually short token", maskKey(key));
    return true;
  } catch (error) {
    log("BLOB_READ_WRITE_TOKEN", "fail", `Error: ${error.message}`, maskKey(key));
    return false;
  }
}

async function testUnsplash() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    log("UNSPLASH_ACCESS_KEY", "skip", "Not configured (optional)", "Needed for stock images");
    return true;
  }

  try {
    const response = await fetch("https://api.unsplash.com/photos/random?count=1", {
      headers: { Authorization: `Client-ID ${key}` },
    });

    if (response.ok) {
      log("UNSPLASH_ACCESS_KEY", "ok", "Valid", maskKey(key));
      return true;
    } else if (response.status === 401) {
      log("UNSPLASH_ACCESS_KEY", "fail", "Invalid key", maskKey(key));
      return false;
    } else if (response.status === 403) {
      log("UNSPLASH_ACCESS_KEY", "warn", "Rate limited or restricted", maskKey(key));
      return true;
    } else {
      log("UNSPLASH_ACCESS_KEY", "fail", `Status: ${response.status}`, maskKey(key));
      return false;
    }
  } catch (error) {
    log("UNSPLASH_ACCESS_KEY", "fail", `Error: ${error.message}`, maskKey(key));
    return false;
  }
}

async function testStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log("STRIPE_SECRET_KEY", "skip", "Not configured (optional)", "Needed for payments");
    return true;
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (response.ok) {
      log("STRIPE_SECRET_KEY", "ok", "Valid", maskKey(key));
      return true;
    } else if (response.status === 401) {
      log("STRIPE_SECRET_KEY", "fail", "Invalid key", maskKey(key));
      return false;
    } else {
      const error = await response.json().catch(() => ({}));
      log(
        "STRIPE_SECRET_KEY",
        "fail",
        error.error?.message || `Status: ${response.status}`,
        maskKey(key),
      );
      return false;
    }
  } catch (error) {
    log("STRIPE_SECRET_KEY", "fail", `Error: ${error.message}`, maskKey(key));
    return false;
  }
}

async function testJWT() {
  const key = process.env.JWT_SECRET;
  if (!key) {
    log("JWT_SECRET", "warn", "Not set (needed for production)", "Generate a random string");
    return true;
  }

  if (key.length < 32) {
    log("JWT_SECRET", "warn", "Too short (recommend 32+ chars)", `Length: ${key.length}`);
    return true;
  }

  log("JWT_SECRET", "ok", "Set and adequate length", `Length: ${key.length}`);
  return true;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("─".repeat(70));
  console.log("Testing API Keys...\n");

  // Run all tests
  await testOpenAI();
  await testV0();
  await testAIGateway();
  await testBlob();
  await testUnsplash();
  await testStripe();
  await testJWT();

  // Summary
  console.log("\n" + "─".repeat(70));
  console.log("SUMMARY:");
  console.log("─".repeat(70));

  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;

  console.log(`✅ Valid:    ${ok}`);
  console.log(`⚠️  Warning:  ${warn}`);
  console.log(`❌ Failed:   ${fail}`);
  console.log(`⏭️  Skipped:  ${skip}`);

  // Required keys check
  const requiredMissing = results.filter(
    (r) => r.status === "fail" && (r.key === "OPENAI_API_KEY" || r.key === "V0_API_KEY"),
  );

  if (requiredMissing.length > 0) {
    console.log("\n⚠️  REQUIRED KEYS MISSING:");
    requiredMissing.forEach((r) => {
      console.log(`   - ${r.key}`);
    });
    console.log("\nYour app will NOT work without these keys!");
  }

  // Feature availability
  console.log("\n" + "─".repeat(70));
  console.log("FEATURE AVAILABILITY:");
  console.log("─".repeat(70));

  const features = [
    { name: "Prompt Enhancement", key: "OPENAI_API_KEY", required: true },
    { name: "Code Generation", key: "V0_API_KEY", required: true },
    {
      name: "AI Gateway (multi-model)",
      key: "AI_GATEWAY_API_KEY",
      required: false,
    },
    {
      name: "AI-Generated Images",
      key: "BLOB_READ_WRITE_TOKEN",
      required: false,
    },
    { name: "Stock Images", key: "UNSPLASH_ACCESS_KEY", required: false },
    { name: "Payments", key: "STRIPE_SECRET_KEY", required: false },
  ];

  features.forEach((f) => {
    const result = results.find((r) => r.key === f.key);
    const available = result?.status === "ok" || result?.status === "warn";
    const icon = available ? "✅" : f.required ? "❌" : "⏹️";
    const status = available ? "Available" : f.required ? "MISSING" : "Not configured";
    console.log(`${icon} ${f.name.padEnd(25)} ${status}`);
  });

  console.log("\n" + "═".repeat(70));

  // Exit with error code if required keys are missing
  process.exit(requiredMissing.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
