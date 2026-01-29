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
  // Project uses both names inconsistently - check both
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  const varName = process.env.VERCEL_TOKEN ? "VERCEL_TOKEN" : "VERCEL_API_TOKEN";

  if (!token) {
    log("Vercel API", "warn", "Not configured (set VERCEL_TOKEN)");
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
        `Connected as: ${data.user?.username || "verified"} (via ${varName})`,
      );
    } else {
      log("Vercel API", "fail", `HTTP ${res.status} (${varName})`);
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

async function testAIGateway() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    log("AI Gateway", "warn", "Not configured (optional)");
    return;
  }

  // AI Gateway keys start with "vck_" - just validate format
  if (key.startsWith("vck_") && key.length > 20) {
    log("AI Gateway", "ok", "Key format valid (vck_...)");
  } else {
    log("AI Gateway", "warn", "Key format unexpected");
  }
}

async function testGoogleOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log("Google OAuth", "warn", "Not configured (optional)");
    return;
  }

  // Google Client IDs end with .apps.googleusercontent.com
  if (clientId.endsWith(".apps.googleusercontent.com") && clientSecret.startsWith("GOCSPX-")) {
    log("Google OAuth", "ok", "Credentials format valid");
  } else {
    log("Google OAuth", "warn", "Credentials format unexpected");
  }
}

async function testGitHubOAuth() {
  const clientId = process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID_DEV;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET_DEV;

  if (!clientId || !clientSecret) {
    log("GitHub OAuth", "warn", "Not configured (optional)");
    return;
  }

  // GitHub OAuth apps have specific ID formats
  if (clientId.startsWith("Ov23li") && clientSecret.length === 40) {
    log("GitHub OAuth", "ok", "Credentials format valid");
  } else {
    log("GitHub OAuth", "warn", "Credentials format unexpected");
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
    log("Redis (ioredis)", "warn", "Not configured (optional)");
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
    log("Redis (ioredis)", "ok", `Connected to ${host.split(".")[0]}...`);
    await client.quit();
  } catch (error) {
    log("Redis (ioredis)", "fail", `Error: ${error.message?.slice(0, 50)}`);
  }
}

async function testUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    log("Upstash Redis", "warn", "Not configured (rate limiting uses memory fallback)");
    return;
  }

  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result === "PONG") {
        log("Upstash Redis", "ok", "Connected (rate limiting active)");
      } else {
        log("Upstash Redis", "warn", `Unexpected response: ${JSON.stringify(data)}`);
      }
    } else {
      log("Upstash Redis", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("Upstash Redis", "fail", `Error: ${error.message}`);
  }
}

async function testSupabase() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!url) {
    log("Supabase (PostgreSQL)", "warn", "Not configured");
    return;
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    const result = await client.query("SELECT 1 as test");
    client.release();
    await pool.end();
    if (result.rows[0]?.test === 1) {
      const host = url.match(/@([^:/]+)/)?.[1] || "unknown";
      log("Supabase (PostgreSQL)", "ok", `Connected to ${host.slice(0, 20)}...`);
    } else {
      log("Supabase (PostgreSQL)", "warn", "Connection OK but query failed");
    }
  } catch (error) {
    log("Supabase (PostgreSQL)", "fail", `Error: ${error.message?.slice(0, 50)}`);
  }
}

async function testAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    log("Anthropic", "warn", "Not configured (optional)");
    return;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });
    if (res.ok) {
      log("Anthropic", "ok", "API accessible");
    } else if (res.status === 401) {
      log("Anthropic", "fail", "Invalid API key");
    } else {
      log("Anthropic", "warn", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("Anthropic", "fail", `Error: ${error.message}`);
  }
}

async function testElevenLabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    log("ElevenLabs", "warn", "Not configured (optional)");
    return;
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
    });
    if (res.ok) {
      log("ElevenLabs", "ok", "API accessible");
    } else {
      log("ElevenLabs", "fail", `HTTP ${res.status}`);
    }
  } catch (error) {
    log("ElevenLabs", "fail", `Error: ${error.message}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

console.log("\n🔑 SAJTMASKIN API TEST\n");
console.log("═".repeat(60));

// Core AI services
await testV0Api();
await testOpenAI();
await testAnthropic();
await testAIGateway();

// Storage & Database
await testSupabase();
await testVercelBlob();
await testRedis();
await testUpstashRedis();

// Auth providers
await testGoogleOAuth();
await testGitHubOAuth();

// External services
await testVercelApi();
await testStripe();
await testUnsplash();
await testElevenLabs();

console.log("═".repeat(60));

const ok = results.filter((r) => r.status === "ok").length;
const warn = results.filter((r) => r.status === "warn").length;
const fail = results.filter((r) => r.status === "fail").length;

console.log(`\n📊 Summary: ${ok} OK, ${warn} warnings, ${fail} failed\n`);

if (fail > 0 || warn > 0) {
  console.log("🔧 SERVICE LINKS:\n");
  console.log("v0 API:       https://v0.dev/settings");
  console.log("OpenAI:       https://platform.openai.com/api-keys");
  console.log("Anthropic:    https://console.anthropic.com/settings/keys");
  console.log("AI Gateway:   https://vercel.com/dashboard (AI tab)");
  console.log("Supabase:     https://supabase.com/dashboard (Project Settings > Database)");
  console.log("Vercel Blob:  https://vercel.com/dashboard/stores");
  console.log("Redis Cloud:  https://app.redislabs.com/");
  console.log("Upstash:      https://console.upstash.com/");
  console.log("Google OAuth: https://console.cloud.google.com/apis/credentials");
  console.log("GitHub OAuth: https://github.com/settings/developers");
  console.log("Vercel API:   https://vercel.com/account/tokens");
  console.log("Stripe:       https://dashboard.stripe.com/apikeys");
  console.log("Unsplash:     https://unsplash.com/oauth/applications");
  console.log("ElevenLabs:   https://elevenlabs.io/app/settings/api-keys");
  console.log("");
}
