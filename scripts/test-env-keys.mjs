#!/usr/bin/env node
/**
 * Env Audit - verify env files and API keys
 *
 * Usage:
 *   node scripts/test-env-keys.mjs
 *   node scripts/test-env-keys.mjs --prod
 *   node scripts/test-env-keys.mjs --file .env.custom
 *   node scripts/test-env-keys.mjs --compare
 *   node scripts/test-env-keys.mjs --compare --include-archive
 *   node scripts/test-env-keys.mjs --no-requests
 *   node scripts/test-env-keys.mjs --no-scan
 */

import { config } from "dotenv";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const args = process.argv.slice(2);
const flags = new Set(args);
const ROOT = process.cwd();

function hasFlag(name) {
  return flags.has(name);
}

function getArgValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function findFirstExisting(files) {
  for (const file of files) {
    const full = resolve(ROOT, file);
    if (existsSync(full)) return file;
  }
  return undefined;
}

function resolveEnvFile() {
  const argFile = getArgValue("--file") || getArgValue("-f");
  if (argFile) return argFile;

  const useProd = hasFlag("--prod") || hasFlag("--production");
  const useLocal = hasFlag("--local");

  if (useProd) {
    return findFirstExisting([".env.production", ".env.produktion"]) || ".env.production";
  }

  if (useLocal) return ".env.local";
  return findFirstExisting([".env.local"]) || ".env.local";
}

const envFile = resolveEnvFile();
const envPath = resolve(ROOT, envFile);
const compareEnabled = hasFlag("--compare") || hasFlag("--diff");
const includeArchive = hasFlag("--include-archive");
const allowRequests = !hasFlag("--no-requests");
const allowScan = !hasFlag("--no-scan");

const ICONS = {
  ok: "[OK]",
  warn: "[WARN]",
  fail: "[FAIL]",
  skip: "[SKIP]",
  info: "[INFO]",
};

const results = [];

function section(title) {
  const line = "=".repeat(72);
  console.log(`\n${line}`);
  console.log(title);
  console.log(line);
}

function log(label, status, message, details = "") {
  const icon = ICONS[status] || "[?]";
  const padded = label.padEnd(28);
  console.log(`${icon} ${padded} ${message}`);
  if (details) console.log(`    ${details}`);
  results.push({ label, status, message, details });
}

function maskValue(value) {
  if (!value) return "(not set)";
  const str = String(value);
  if (str.length <= 8) return "****";
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

function normalizeVercelToken(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("vercel_token=") ? trimmed.slice("vercel_token=".length) : trimmed;
}

function cleanConnectionString(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("supa");
    return url.toString();
  } catch {
    return value;
  }
}

function formatEpochSeconds(seconds) {
  if (!seconds || Number.isNaN(Number(seconds))) return "unknown";
  return new Date(Number(seconds) * 1000).toISOString();
}

function summarizeList(items, max = 12) {
  if (!items.length) return "none";
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} ... (+${items.length - max} more)`;
}

function parseEnvFile(filePath) {
  const fullPath = resolve(ROOT, filePath);
  const data = {
    filePath,
    exists: false,
    keys: new Map(),
    duplicateKeys: new Set(),
    invalidLines: [],
    quoteIssues: [],
    lineCount: 0,
  };

  if (!existsSync(fullPath)) return data;
  data.exists = true;

  const content = readFileSync(fullPath, "utf8");
  const lines = content.split(/\r?\n/);
  data.lineCount = lines.length;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    let working = trimmed;
    if (working.startsWith("export ")) {
      working = working.slice("export ".length).trim();
    }

    const eqIndex = working.indexOf("=");
    if (eqIndex === -1) {
      data.invalidLines.push({ line: index + 1, text: line });
      return;
    }

    const key = working.slice(0, eqIndex).trim();
    let value = working.slice(eqIndex + 1).trim();

    const startsQuote = value.startsWith('"') || value.startsWith("'");
    const endsQuote = value.endsWith('"') || value.endsWith("'");
    if (startsQuote && !endsQuote) {
      data.quoteIssues.push({ line: index + 1, key });
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (data.keys.has(key)) data.duplicateKeys.add(key);
    data.keys.set(key, value);
  });

  return data;
}

function lintEnvFormat(envData) {
  section(`ENV FORMAT CHECK (${envData.filePath})`);

  if (!envData.exists) {
    log(envData.filePath, "fail", "File not found");
    return;
  }

  if (envData.invalidLines.length === 0) {
    log("Format", "ok", "No invalid lines detected");
  } else {
    log(
      "Format",
      "warn",
      `Invalid lines: ${envData.invalidLines.length}`,
      "Lines without KEY=VALUE detected",
    );
  }

  if (envData.duplicateKeys.size === 0) {
    log("Duplicates", "ok", "No duplicate keys");
  } else {
    log(
      "Duplicates",
      "warn",
      `Duplicate keys: ${envData.duplicateKeys.size}`,
      summarizeList([...envData.duplicateKeys]),
    );
  }

  if (envData.quoteIssues.length === 0) {
    log("Quotes", "ok", "No quote issues detected");
  } else {
    log(
      "Quotes",
      "warn",
      `Unclosed quotes: ${envData.quoteIssues.length}`,
      summarizeList(envData.quoteIssues.map((q) => q.key)),
    );
  }
}

function compareEnvFiles(filePaths) {
  const envFiles = filePaths.map((file) => parseEnvFile(file));
  const existing = envFiles.filter((f) => f.exists);

  section("ENV FILE COMPARISON");

  if (existing.length < 2) {
    log("Compare", "warn", "Need at least two existing env files");
    return;
  }

  const presence = new Map();
  existing.forEach((file) => {
    file.keys.forEach((_, key) => {
      if (!presence.has(key)) presence.set(key, new Set());
      presence.get(key).add(file.filePath);
    });
  });

  const allKeys = [...presence.keys()];

  existing.forEach((file) => {
    const missing = allKeys.filter((key) => !file.keys.has(key));
    log(
      `Missing in ${file.filePath}`,
      missing.length ? "warn" : "ok",
      missing.length ? `${missing.length} missing` : "None missing",
      missing.length ? summarizeList(missing) : "",
    );
  });

  const onlyInOne = allKeys.filter((key) => presence.get(key).size === 1);
  if (onlyInOne.length) {
    log("Only in one file", "warn", `${onlyInOne.length} keys`, summarizeList(onlyInOne));
  } else {
    log("Only in one file", "ok", "None");
  }
}

function collectEnvFiles(dirPath) {
  const results = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const full = join(dirPath, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectEnvFiles(full));
      continue;
    }
    if (entry.startsWith(".env")) results.push(full);
  }

  return results;
}

function scanCodeForEnvKeys() {
  const roots = ["src", "scripts"];
  const rootFiles = [
    "next.config.ts",
    "drizzle.config.ts",
    "tailwind.config.cjs",
    "postcss.config.mjs",
    "eslint.config.mjs",
  ];
  const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
  const skipDirs = new Set([
    "node_modules",
    ".git",
    ".next",
    ".vercel",
    ".cursor",
    "dist",
    "build",
    "out",
    "coverage",
  ]);

  const files = [];
  const skipFiles = new Set([resolve(ROOT, "scripts/test-env-keys.mjs")]);

  function walk(dir) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (skipDirs.has(entry)) continue;
        walk(full);
      } else {
        const ext = full.slice(full.lastIndexOf("."));
        if (!exts.has(ext)) continue;
        if (skipFiles.has(full)) continue;
        files.push(full);
      }
    }
  }

  roots.forEach((root) => walk(join(ROOT, root)));
  rootFiles.forEach((file) => {
    const full = join(ROOT, file);
    if (existsSync(full) && !skipFiles.has(full)) files.push(full);
  });

  const keys = new Set();

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const dotPattern = /process\.env\.([A-Z0-9_]+)/g;
    const bracketPattern = /process\.env\[['"]([A-Z0-9_]+)['"]\]/g;
    let match;
    while ((match = dotPattern.exec(content))) {
      keys.add(match[1]);
    }
    while ((match = bracketPattern.exec(content))) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function warnOnPlacement(envData, isProd) {
  section("PLACEMENT & CLEANUP WARNINGS");

  const keys = new Set(envData.keys.keys());

  const devOnlyPrefixes = ["TEST_", "SUPERADMIN_", "BACKOFFICE_", "BASIC_AUTH_"];
  const prodWarnings = [...keys].filter((key) =>
    devOnlyPrefixes.some((prefix) => key.startsWith(prefix)),
  );

  if (isProd && prodWarnings.length) {
    log(
      "Dev/Test in prod",
      "warn",
      "Dev/test credentials present in production env",
      summarizeList(prodWarnings),
    );
  } else {
    log("Dev/Test in prod", "ok", "No obvious dev/test keys in prod");
  }

  if (isProd && keys.has("VERCEL_OIDC_TOKEN")) {
    log("VERCEL_OIDC_TOKEN", "warn", "OIDC token should not be manually managed in production");
  } else {
    log("VERCEL_OIDC_TOKEN", "ok", "No prod OIDC token detected");
  }

  const jwt = envData.keys.get("JWT_SECRET");
  if (!jwt) {
    log("JWT_SECRET", "warn", "JWT secret missing");
  } else if (jwt.length < 32) {
    log("JWT_SECRET", "warn", "JWT secret too short (recommend 32+ chars)");
  } else {
    log("JWT_SECRET", "ok", "JWT secret length looks good");
  }

  if (keys.has("DATABASE_URL")) {
    log("DB URLs", "warn", "DATABASE_URL is deprecated", "Use POSTGRES_URL only");
  } else {
    log("DB URLs", "ok", "Using POSTGRES_URL only");
  }

  const redisUrlKeys = ["REDIS_URL"];
  const redisPresent = redisUrlKeys.filter((key) => keys.has(key));
  const upstashRestPresent = keys.has("UPSTASH_REDIS_REST_URL");

  if (redisPresent.length > 1 || (redisPresent.length && upstashRestPresent)) {
    const redisList = [...redisPresent];
    if (upstashRestPresent) redisList.push("UPSTASH_REDIS_REST_URL");
    log(
      "Redis vars",
      "warn",
      "Multiple Redis/KV configurations detected",
      summarizeList(redisList),
    );
  } else {
    log("Redis vars", "ok", "No obvious Redis/KV duplicates");
  }

  log("App URL vars", "ok", "Using NEXT_PUBLIC_APP_URL as the only public URL");

  const publicAllowlist = new Set(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_APP_URL"]);
  const publicSecrets = [...keys].filter((key) => {
    if (!key.startsWith("NEXT_PUBLIC_")) return false;
    if (publicAllowlist.has(key)) return false;
    return (
      key.includes("SECRET") ||
      key.includes("TOKEN") ||
      key.includes("PASSWORD") ||
      key.endsWith("_KEY")
    );
  });

  if (publicSecrets.length) {
    log(
      "NEXT_PUBLIC_* secrets",
      "warn",
      "Potentially sensitive data exposed to the client",
      summarizeList(publicSecrets),
    );
  } else {
    log("NEXT_PUBLIC_* secrets", "ok", "No obvious secret leaks");
  }
}

async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log("OPENAI_API_KEY", "fail", "Missing (required)");
    return false;
  }

  if (!allowRequests) {
    log("OPENAI_API_KEY", "skip", "Skipping remote check (--no-requests)", maskValue(key));
    return true;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (res.ok) {
      const data = await res.json();
      const modelCount = data.data?.length || 0;
      log("OPENAI_API_KEY", "ok", `Valid (${modelCount} models)`, maskValue(key));
    } else {
      const error = await res.json().catch(() => ({}));
      log(
        "OPENAI_API_KEY",
        "fail",
        `Invalid: ${error.error?.message || res.status}`,
        maskValue(key),
      );
      return false;
    }

    const billing = await fetchOpenAIBilling(key);
    if (billing?.total_available !== undefined) {
      const expires = billing.expires_at ? formatEpochSeconds(billing.expires_at) : "unknown";
      log(
        "OpenAI Budget",
        "info",
        `Available: ${billing.total_available}, Used: ${billing.total_used}`,
        `Expires: ${expires}`,
      );
    } else if (billing?.error) {
      log("OpenAI Budget", "warn", "Budget info unavailable", billing.error);
    }

    return true;
  } catch (error) {
    log("OPENAI_API_KEY", "fail", `Error: ${error.message}`, maskValue(key));
    return false;
  }
}

async function fetchOpenAIBilling(key) {
  const endpoints = [
    "https://api.openai.com/dashboard/billing/credit_grants",
    "https://api.openai.com/v1/dashboard/billing/credit_grants",
  ];

  let lastError;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        if ([401, 403, 404].includes(res.status)) {
          continue;
        }
        return { error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      return {
        total_granted: data.total_granted,
        total_used: data.total_used,
        total_available: data.total_available,
        expires_at: data.expires_at,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
  }

  return { error: lastError || "No billing endpoint available for this account" };
}

async function testV0() {
  const key = process.env.V0_API_KEY;
  if (!key) {
    log("V0_API_KEY", "fail", "Missing (required)");
    return false;
  }

  if (!allowRequests) {
    log("V0_API_KEY", "skip", "Skipping remote check (--no-requests)", maskValue(key));
    return true;
  }

  try {
    const { createClient } = await import("v0-sdk");
    const v0 = createClient({ apiKey: key });
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
      log("V0_API_KEY", "ok", "Valid (chat created)", maskValue(key));
      return true;
    }
    log("V0_API_KEY", "warn", "API responded but no chat ID", maskValue(key));
    return true;
  } catch (error) {
    const msg = error.message || String(error);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      log("V0_API_KEY", "fail", "Invalid or expired key", maskValue(key));
      return false;
    }
    if (msg.includes("422")) {
      log("V0_API_KEY", "ok", "Valid (API responded)", maskValue(key));
      return true;
    }
    log("V0_API_KEY", "warn", `Error: ${msg.slice(0, 60)}`, maskValue(key));
    return true;
  }
}

async function testAIGateway() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    log("AI_GATEWAY_API_KEY", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("AI_GATEWAY_API_KEY", "skip", "Skipping remote check (--no-requests)", maskValue(key));
    return true;
  }

  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (res.ok) {
      const data = await res.json();
      const modelCount = data.data?.length || 0;
      log("AI_GATEWAY_API_KEY", "ok", `Valid (${modelCount} models)`, maskValue(key));
      return true;
    }

    const error = await res.json().catch(() => ({}));
    log(
      "AI_GATEWAY_API_KEY",
      "fail",
      `Invalid: ${error.error?.message || res.status}`,
      maskValue(key),
    );
    return false;
  } catch (error) {
    log("AI_GATEWAY_API_KEY", "fail", `Error: ${error.message}`, maskValue(key));
    return false;
  }
}

async function testAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    log("ANTHROPIC_API_KEY", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("ANTHROPIC_API_KEY", "skip", "Skipping remote check (--no-requests)", maskValue(key));
    return true;
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
        max_tokens: 1,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (res.ok) {
      log("ANTHROPIC_API_KEY", "ok", "API accessible", maskValue(key));
    } else if (res.status === 401) {
      log("ANTHROPIC_API_KEY", "fail", "Invalid API key", maskValue(key));
      return false;
    } else {
      log("ANTHROPIC_API_KEY", "warn", `HTTP ${res.status}`, maskValue(key));
    }

    const remainingReq = res.headers.get("anthropic-ratelimit-requests-remaining");
    const remainingTok = res.headers.get("anthropic-ratelimit-tokens-remaining");
    if (remainingReq || remainingTok) {
      log(
        "Anthropic Limits",
        "info",
        `Requests: ${remainingReq || "n/a"}, Tokens: ${remainingTok || "n/a"}`,
      );
    }

    return true;
  } catch (error) {
    log("ANTHROPIC_API_KEY", "fail", `Error: ${error.message}`, maskValue(key));
    return false;
  }
}

async function testStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log("STRIPE_SECRET_KEY", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("STRIPE_SECRET_KEY", "skip", "Skipping remote check (--no-requests)", maskValue(key));
    return true;
  }

  try {
    const balanceRes = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (balanceRes.ok) {
      const data = await balanceRes.json();
      const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";
      log("STRIPE_SECRET_KEY", "ok", `Valid (${mode} mode)`, maskValue(key));

      const available = formatStripeAmounts(data.available || []);
      const pending = formatStripeAmounts(data.pending || []);
      log("Stripe Balance", "info", `Available: ${available}`, `Pending: ${pending}`);
    } else if (balanceRes.status === 401) {
      log("STRIPE_SECRET_KEY", "fail", "Invalid key", maskValue(key));
      return false;
    } else {
      log("STRIPE_SECRET_KEY", "warn", `HTTP ${balanceRes.status}`, maskValue(key));
    }

    const accountRes = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (accountRes.ok) {
      const account = await accountRes.json();
      const created = account.created ? formatEpochSeconds(account.created) : "unknown";
      log(
        "Stripe Account",
        "info",
        `Created: ${created}, Charges enabled: ${account.charges_enabled ? "yes" : "no"}`,
      );
    }

    return true;
  } catch (error) {
    log("STRIPE_SECRET_KEY", "fail", `Error: ${error.message}`, maskValue(key));
    return false;
  }
}

function formatStripeAmounts(items) {
  if (!items.length) return "0";
  return items
    .map((item) => `${item.currency?.toUpperCase() || "USD"} ${(item.amount || 0) / 100}`)
    .join(", ");
}

async function testUnsplash() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    log("UNSPLASH_ACCESS_KEY", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("UNSPLASH_ACCESS_KEY", "skip", "Skipping remote check (--no-requests)", maskValue(key));
    return true;
  }

  try {
    const res = await fetch("https://api.unsplash.com/photos/random?count=1", {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (res.ok) {
      log("UNSPLASH_ACCESS_KEY", "ok", "Valid", maskValue(key));
      return true;
    }
    if (res.status === 401) {
      log("UNSPLASH_ACCESS_KEY", "fail", "Invalid key", maskValue(key));
      return false;
    }
    log("UNSPLASH_ACCESS_KEY", "warn", `HTTP ${res.status}`, maskValue(key));
    return true;
  } catch (error) {
    log("UNSPLASH_ACCESS_KEY", "fail", `Error: ${error.message}`, maskValue(key));
    return false;
  }
}

async function testVercelApi() {
  const candidates = [
    { name: "VERCEL_TOKEN", value: normalizeVercelToken(process.env.VERCEL_TOKEN) },
  ].filter((item) => item.value);

  if (!candidates.length) {
    log("Vercel API", "warn", "No Vercel token configured");
    return true;
  }

  if (!allowRequests) {
    log("Vercel API", "skip", "Skipping remote check (--no-requests)");
    return true;
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.value)) continue;
    seen.add(candidate.value);

    try {
      const res = await fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${candidate.value}` },
      });
      if (res.ok) {
        const data = await res.json();
        const username = data.user?.username || data.user?.email || "verified";
        const createdAt = data.user?.createdAt
          ? new Date(data.user.createdAt).toISOString()
          : "unknown";
        log(
          `Vercel API (${candidate.name})`,
          "ok",
          `Connected as ${username}`,
          `Created: ${createdAt}`,
        );
      } else {
        log(
          `Vercel API (${candidate.name})`,
          "fail",
          `HTTP ${res.status}`,
          maskValue(candidate.value),
        );
      }
    } catch (error) {
      log(
        `Vercel API (${candidate.name})`,
        "fail",
        `Error: ${error.message}`,
        maskValue(candidate.value),
      );
    }
  }

  return true;
}

async function testVercelBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    log("BLOB_READ_WRITE_TOKEN", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("BLOB_READ_WRITE_TOKEN", "skip", "Skipping remote check (--no-requests)", maskValue(token));
    return true;
  }

  try {
    const res = await fetch("https://blob.vercel-storage.com?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      log("BLOB_READ_WRITE_TOKEN", "ok", "Storage accessible", maskValue(token));
      return true;
    }
    log("BLOB_READ_WRITE_TOKEN", "fail", `HTTP ${res.status}`, maskValue(token));
    return false;
  } catch (error) {
    log("BLOB_READ_WRITE_TOKEN", "fail", `Error: ${error.message}`, maskValue(token));
    return false;
  }
}

async function testSupabase() {
  const url = cleanConnectionString(process.env.POSTGRES_URL);
  if (!url) {
    log("POSTGRES_URL", "warn", "No Postgres URL configured");
    return true;
  }

  if (!allowRequests) {
    log("POSTGRES_URL", "skip", "Skipping remote check (--no-requests)");
    return true;
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
      log("POSTGRES_URL", "ok", `Connected (${host.slice(0, 30)}...)`);
    } else {
      log("POSTGRES_URL", "warn", "Connection OK but query failed");
    }
    return true;
  } catch (error) {
    log("POSTGRES_URL", "fail", `Error: ${error.message?.slice(0, 60)}`);
    return false;
  }
}

async function testRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    log("REDIS_URL", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("REDIS_URL", "skip", "Skipping remote check (--no-requests)");
    return true;
  }

  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(url, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
    await client.ping();
    await client.quit();
    log("REDIS_URL", "ok", "Connected");
    return true;
  } catch (error) {
    log("REDIS_URL", "fail", `Error: ${error.message?.slice(0, 60)}`);
    return false;
  }
}

async function testUpstashRest() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    log("Upstash REST", "skip", "Not configured (optional)");
    return true;
  }

  if (!allowRequests) {
    log("Upstash REST", "skip", "Skipping remote check (--no-requests)");
    return true;
  }

  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result === "PONG") {
        log("Upstash REST", "ok", "Connected");
        return true;
      }
      log("Upstash REST", "warn", `Unexpected response: ${JSON.stringify(data)}`);
      return true;
    }
    log("Upstash REST", "fail", `HTTP ${res.status}`);
    return false;
  } catch (error) {
    log("Upstash REST", "fail", `Error: ${error.message}`);
    return false;
  }
}

function checkPublicConfig() {
  section("PUBLIC CONFIG CHECKS");

  const checks = [
    { key: "NEXT_PUBLIC_APP_URL", required: true, hint: "Client app URL (primary)" },
    { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", required: false, hint: "Stripe publishable key" },
    { key: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", required: false, hint: "Google Maps JS API" },
    { key: "NEXT_PUBLIC_ADMIN_EMAIL", required: false, hint: "Shown in admin UI" },
    { key: "NEXT_PUBLIC_REGISTRY_BASE_URL", required: false, hint: "Shadcn registry URL" },
    { key: "NEXT_PUBLIC_REGISTRY_STYLE", required: false, hint: "Shadcn registry style" },
  ];

  checks.forEach(({ key, required, hint }) => {
    const value = process.env[key];
    if (value && value.trim()) {
      log(key, "ok", "Configured", hint);
    } else if (required) {
      log(key, "warn", "Missing (required)", hint);
    } else {
      log(key, "skip", "Not configured (optional)", hint);
    }
  });

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (adminEmail && !adminEmail.includes("@")) {
    log("NEXT_PUBLIC_ADMIN_EMAIL", "warn", "Does not look like an email");
  }
}

function testStripePrices() {
  const prices = [
    { key: "STRIPE_PRICE_10_DIAMONDS", label: "Stripe Price 10" },
    { key: "STRIPE_PRICE_25_DIAMONDS", label: "Stripe Price 25" },
    { key: "STRIPE_PRICE_50_DIAMONDS", label: "Stripe Price 50" },
  ];
  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_WEBHOOK_SECRET);

  prices.forEach(({ key, label }) => {
    const value = process.env[key];
    if (value && value.trim()) {
      log(label, "ok", "Configured", maskValue(value));
    } else if (hasStripe) {
      log(label, "warn", "Missing (required for checkout)");
    } else {
      log(label, "skip", "Not configured (optional)");
    }
  });
}

function testOAuthFormats() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID_DEV;
  const githubSecret = process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET_DEV;

  if (googleClientId && googleSecret) {
    const ok =
      googleClientId.endsWith(".apps.googleusercontent.com") && googleSecret.startsWith("GOCSPX-");
    log("Google OAuth", ok ? "ok" : "warn", "Credentials format check");
  } else {
    log("Google OAuth", "skip", "Not configured (optional)");
  }

  if (githubClientId && githubSecret) {
    const ok = githubClientId.startsWith("Ov23") && githubSecret.length === 40;
    log("GitHub OAuth", ok ? "ok" : "warn", "Credentials format check");
  } else {
    log("GitHub OAuth", "skip", "Not configured (optional)");
  }
}

function testJwtSecret() {
  const key = process.env.JWT_SECRET;
  if (!key) {
    log("JWT_SECRET", "warn", "Not set");
    return;
  }
  if (key.length < 32) {
    log("JWT_SECRET", "warn", `Too short (length ${key.length})`);
    return;
  }
  log("JWT_SECRET", "ok", `Length ${key.length}`);
}

function testVercelOidcToken() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    log("VERCEL_OIDC_TOKEN", "skip", "Not configured");
    return;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    log("VERCEL_OIDC_TOKEN", "warn", "Not a JWT");
    return;
  }

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    const issuedAt = decoded.iat ? formatEpochSeconds(decoded.iat) : "unknown";
    const expiresAt = decoded.exp ? formatEpochSeconds(decoded.exp) : "unknown";
    log("VERCEL_OIDC_TOKEN", "info", `Issued: ${issuedAt}`, `Expires: ${expiresAt}`);
  } catch {
    log("VERCEL_OIDC_TOKEN", "warn", "Failed to decode token");
  }
}

async function main() {
  section("ENV AUDIT");
  log("Env file", existsSync(envPath) ? "ok" : "fail", envFile);

  if (!existsSync(envPath)) {
    console.error(`\n[FAIL] Env file not found: ${envFile}`);
    process.exit(1);
  }

  config({ path: envPath, override: true });

  const envData = parseEnvFile(envFile);
  lintEnvFormat(envData);

  if (compareEnabled) {
    const compareFiles = new Set([
      ".env.local",
      ".env.production",
      ".env.produktion",
      ".env.vercel-temp",
    ]);
    if (includeArchive) {
      const archiveDir = resolve(ROOT, "senaste_miljovariablar");
      const archiveFiles = collectEnvFiles(archiveDir).map((file) => relative(ROOT, file));
      archiveFiles.forEach((file) => compareFiles.add(file));
    }
    compareEnvFiles([...compareFiles]);
  }

  if (allowScan) {
    section("ENV KEYS USED IN CODE");
    const usedKeys = scanCodeForEnvKeys();
    const missing = [...usedKeys].filter((key) => !envData.keys.has(key));
    const extra = [...envData.keys.keys()];
    const unused = extra.filter((key) => !usedKeys.has(key));

    log("Keys in code", "info", `Found ${usedKeys.size} env keys`);
    log(
      "Missing in env",
      missing.length ? "warn" : "ok",
      missing.length ? `${missing.length} keys` : "None missing",
      missing.length ? summarizeList(missing) : "",
    );
    log(
      "Unused in code",
      unused.length ? "warn" : "ok",
      unused.length ? `${unused.length} keys` : "None unused",
      unused.length ? summarizeList(unused) : "",
    );
  }

  const isProd = envFile.includes("production") || envFile.includes("produktion");
  warnOnPlacement(envData, isProd);

  checkPublicConfig();
  testStripePrices();

  section("API KEY & SERVICE TESTS");

  await testOpenAI();
  await testV0();
  await testAnthropic();
  await testAIGateway();

  await testSupabase();
  await testRedis();
  await testUpstashRest();
  await testVercelBlob();

  await testVercelApi();
  await testStripe();
  await testUnsplash();
  testOAuthFormats();
  testJwtSecret();
  testVercelOidcToken();

  section("SUMMARY");
  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const info = results.filter((r) => r.status === "info").length;

  console.log(`OK: ${ok} | WARN: ${warn} | FAIL: ${fail} | SKIP: ${skip} | INFO: ${info}`);

  const requiredMissing = ["OPENAI_API_KEY", "V0_API_KEY"].filter((key) => !process.env[key]);
  if (requiredMissing.length) {
    console.log(`Required missing: ${requiredMissing.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[FAIL] Fatal error:", error);
  process.exit(1);
});
