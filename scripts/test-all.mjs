#!/usr/bin/env node
/**
 * Sajtmaskin - Complete API & Integration Test
 * Tests all configured API keys and services
 *
 * Run: node scripts/test-all.mjs
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const results = [];

function log(service, status, message) {
  const icon = status === "ok" ? "✅" : status === "warn" ? "⚠️" : "❌";
  console.log(`${icon} ${service}: ${message}`);
  results.push({ service, status, message });
}

// ============================================================================
// API TESTS
// ============================================================================

async function testV0Api() {
  const key = process.env.V0_API_KEY;
  if (!key) {
    log("v0 API", "fail", "V0_API_KEY not set");
    return;
  }

  try {
    const { createClient } = await import("v0-sdk");
    const client = createClient({ apiKey: key });

    const result = await client.chats.create({
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

    if (result && result.id) {
      log("v0 API", "ok", `Working (chat: ${result.id.slice(0, 8)}...)`);
    } else {
      log("v0 API", "ok", "Working");
    }
  } catch (error) {
    const msg = error.message || String(error);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      log("v0 API", "fail", "Invalid key - get new at https://v0.dev/settings");
    } else if (msg.includes("422")) {
      log("v0 API", "ok", "Key valid (API responding)");
    } else {
      log("v0 API", "warn", `Error: ${msg.slice(0, 60)}`);
    }
  }
}

async function testVercelApi() {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    log("Vercel API", "warn", "Not configured (optional)");
    return;
  }

  try {
    const res = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      log(
        "Vercel API",
        "ok",
        `Connected as: ${data.user?.username || "verified"}`
      );
    } else {
      log("Vercel API", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("Vercel API", "fail", `Error: ${error.message}`);
  }
}

async function testVercelBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    log("Vercel Blob", "fail", "BLOB_READ_WRITE_TOKEN not set");
    return;
  }

  try {
    const res = await fetch("https://blob.vercel-storage.com?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      log("Vercel Blob", "ok", "Storage accessible");
    } else {
      log("Vercel Blob", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("Vercel Blob", "fail", `Error: ${error.message}`);
  }
}

async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log("OpenAI", "fail", "OPENAI_API_KEY not set");
    return;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      log("OpenAI", "ok", "API accessible");
    } else {
      log("OpenAI", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("OpenAI", "fail", `Error: ${error.message}`);
  }
}

async function testStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log("Stripe", "warn", "Not configured (optional)");
    return;
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const mode = key.startsWith("sk_test_") ? "TEST" : "LIVE";
      log("Stripe", "ok", `Working (${mode} mode)`);
    } else {
      log("Stripe", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("Stripe", "fail", `Error: ${error.message}`);
  }
}

async function testUnsplash() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    log("Unsplash", "warn", "Not configured (optional)");
    return;
  }

  try {
    const res = await fetch("https://api.unsplash.com/photos/random?count=1", {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (res.ok) {
      log("Unsplash", "ok", "Working");
    } else {
      log("Unsplash", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("Unsplash", "fail", `Error: ${error.message}`);
  }
}

async function testRedis() {
  const host = process.env.REDIS_HOST;
  const password = process.env.REDIS_PASSWORD;

  if (!host || !password) {
    log("Redis", "warn", "Not configured (optional)");
    return;
  }

  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis({
      host,
      port: parseInt(process.env.REDIS_PORT || "6379"),
      username: process.env.REDIS_USERNAME || "default",
      password,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
    await client.ping();
    log("Redis", "ok", `Connected to ${host}`);
    await client.quit();
  } catch (error) {
    log("Redis", "fail", `Error: ${error.message?.slice(0, 50)}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

console.log("\n🔑 SAJTMASKIN API TEST\n");
console.log("═".repeat(60));

await testV0Api();
await testVercelApi();
await testVercelBlob();
await testOpenAI();
await testStripe();
await testUnsplash();
await testRedis();

console.log("═".repeat(60));

const ok = results.filter((r) => r.status === "ok").length;
const warn = results.filter((r) => r.status === "warn").length;
const fail = results.filter((r) => r.status === "fail").length;

console.log(`\n📊 Summary: ${ok} OK, ${warn} warnings, ${fail} failed\n`);

if (fail > 0) {
  console.log("🔧 TO FIX FAILED KEYS:\n");
  console.log("v0 API:      https://v0.dev/settings");
  console.log("Vercel API:  https://vercel.com/account/tokens");
  console.log("Vercel Blob: https://vercel.com/dashboard/stores");
  console.log("OpenAI:      https://platform.openai.com/api-keys");
  console.log("Stripe:      https://dashboard.stripe.com/apikeys");
  console.log("Unsplash:    https://unsplash.com/oauth/applications");
  console.log("");
}
