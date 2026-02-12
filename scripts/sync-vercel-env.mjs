#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PROD_ENV_PATH = path.join(ROOT, ".env.production");
const LOCAL_ENV_PATH = path.join(ROOT, ".env.local");

const API_BASE = "https://api.vercel.com";
const TARGETS = ["production", "preview", "development"];

const EXCLUDED_KEYS = new Set([
  "NODE_ENV",
  "VERCEL_OIDC_TOKEN",
]);

const LEGACY_KEYS_TO_DELETE = new Set([
  "OPEN_AI_KEY",
  "RESEND_FROM_EMAIL",
  "SAJTMASKIN_LOG_DIR",
  "STRIPE_PRICE_25_DIAMONDS",
  "STRIPE_PRICE_50_DIAMONDS",
  "STRIPE_PRICE_75_DIAMONDS",
]);

function readEnvFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return parseDotenv(raw);
}

function normalizeToken(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (trimmed.startsWith("vercel_token=")) {
    return trimmed.slice("vercel_token=".length).trim();
  }
  return trimmed;
}

function normalizeValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildDesiredPerTarget(prodEnv, localEnv) {
  const desired = {
    production: new Map(),
    preview: new Map(),
    development: new Map(),
  };

  const setIfPresent = (target, key, value) => {
    if (!key || EXCLUDED_KEYS.has(key)) return;
    const normalized = normalizeValue(value);
    if (!normalized) return;
    desired[target].set(key, normalized);
  };

  for (const [key, value] of Object.entries(prodEnv)) {
    setIfPresent("production", key, value);
    setIfPresent("preview", key, value);
  }

  for (const [key, value] of Object.entries(localEnv)) {
    setIfPresent("development", key, value);
  }

  return desired;
}

function collapseByValue(perTarget) {
  const allKeys = new Set([
    ...perTarget.production.keys(),
    ...perTarget.preview.keys(),
    ...perTarget.development.keys(),
  ]);

  const items = [];
  for (const key of allKeys) {
    const grouped = new Map();
    for (const target of TARGETS) {
      const value = perTarget[target].get(key);
      if (!value) continue;
      if (!grouped.has(value)) grouped.set(value, []);
      grouped.get(value).push(target);
    }
    for (const [value, targets] of grouped.entries()) {
      items.push({ key, value, targets });
    }
  }
  return items;
}

async function vercelRequest(token, pathWithQuery, init = {}) {
  const res = await fetch(`${API_BASE}${pathWithQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API ${res.status} ${res.statusText} for ${pathWithQuery}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function makeProjectQuery(teamId) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function listProjectEnv(token, projectId, teamId) {
  const query = makeProjectQuery(teamId);
  const data = await vercelRequest(
    token,
    `/v9/projects/${encodeURIComponent(projectId)}/env${query}`,
  );
  return Array.isArray(data?.envs) ? data.envs : [];
}

async function deleteEnvById(token, projectId, envId, teamId) {
  const query = makeProjectQuery(teamId);
  await vercelRequest(
    token,
    `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(envId)}${query}`,
    { method: "DELETE" },
  );
}

async function upsertEnv(token, projectId, item, teamId) {
  const queryParts = [];
  if (teamId) queryParts.push(`teamId=${encodeURIComponent(teamId)}`);
  queryParts.push("upsert=true");
  const query = `?${queryParts.join("&")}`;

  await vercelRequest(token, `/v10/projects/${encodeURIComponent(projectId)}/env${query}`, {
    method: "POST",
    body: JSON.stringify({
      key: item.key,
      value: item.value,
      type: "encrypted",
      target: item.targets,
    }),
  });
}

function summarizeTargets(envs) {
  const counts = { production: 0, preview: 0, development: 0 };
  for (const env of envs) {
    for (const target of env.target || []) {
      if (counts[target] !== undefined) counts[target] += 1;
    }
  }
  return counts;
}

async function main() {
  const prodEnv = readEnvFile(PROD_ENV_PATH);
  const localEnv = readEnvFile(LOCAL_ENV_PATH);

  const token = normalizeToken(prodEnv.VERCEL_TOKEN || localEnv.VERCEL_TOKEN);
  const projectId = normalizeValue(prodEnv.VERCEL_PROJECT_ID || localEnv.VERCEL_PROJECT_ID);
  const teamId = normalizeValue(prodEnv.VERCEL_TEAM_ID || localEnv.VERCEL_TEAM_ID) || undefined;

  if (!token) throw new Error("Missing VERCEL_TOKEN in .env.production/.env.local");
  if (!projectId) throw new Error("Missing VERCEL_PROJECT_ID in .env.production/.env.local");

  const desiredPerTarget = buildDesiredPerTarget(prodEnv, localEnv);
  const desiredItems = collapseByValue(desiredPerTarget);

  const before = await listProjectEnv(token, projectId, teamId);
  const beforeCounts = summarizeTargets(before);

  const deletions = before.filter((env) => env?.id && LEGACY_KEYS_TO_DELETE.has(env.key));
  for (const env of deletions) {
    await deleteEnvById(token, projectId, env.id, teamId);
  }

  for (const item of desiredItems) {
    await upsertEnv(token, projectId, item, teamId);
  }

  const after = await listProjectEnv(token, projectId, teamId);
  const afterCounts = summarizeTargets(after);

  const desiredKeys = new Set(desiredItems.map((item) => item.key));
  const remoteKeys = new Set(after.map((env) => env.key));
  const missingAfter = [...desiredKeys].filter((key) => !remoteKeys.has(key));

  console.log("Vercel env sync complete.");
  console.log(`Project: ${projectId}`);
  console.log(`Deleted legacy keys: ${deletions.length}`);
  console.log(`Upserted key-target groups: ${desiredItems.length}`);
  console.log(`Before counts: ${JSON.stringify(beforeCounts)}`);
  console.log(`After counts: ${JSON.stringify(afterCounts)}`);
  console.log(`Missing desired keys after sync: ${missingAfter.length}`);
  if (missingAfter.length) {
    console.log(missingAfter.join(", "));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

