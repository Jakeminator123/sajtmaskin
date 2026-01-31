#!/usr/bin/env node
/**
 * Token Refresh Script (Node.js wrapper)
 * Called by npm run dev via predev hook
 *
 * Checks if VERCEL_OIDC_TOKEN is expired and refreshes it automatically.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";

const ENV_FILE = ".env.local";
const STATUS_FILE = ".token-status.json";
const REFRESH_THRESHOLD_MINUTES = 60; // Refresh if less than 60 min remaining

function log(msg, type = "info") {
  const time = new Date().toLocaleTimeString("sv-SE");
  const colors = {
    info: "\x1b[36m", // cyan
    success: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
    reset: "\x1b[0m",
  };
  console.log(`${colors[type]}[${time}] ${msg}${colors.reset}`);
}

function decodeJwtExpiry(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    let payload = parts[1];
    // Add base64 padding
    payload = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";

    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return decoded.exp;
  } catch {
    return null;
  }
}

function updateStatus(action, expiry, status) {
  const statusObj = {
    lastCheck: new Date().toISOString(),
    lastAction: action,
    tokenExpiry: expiry ? new Date(expiry * 1000).toISOString() : "unknown",
    status,
  };
  writeFileSync(STATUS_FILE, JSON.stringify(statusObj, null, 2));
}

async function main() {
  log("Checking OIDC token status...");

  if (!existsSync(ENV_FILE)) {
    log("No .env.local found - skipping token check", "warn");
    return;
  }

  const envContent = readFileSync(ENV_FILE, "utf8");
  const tokenMatch = envContent.match(/VERCEL_OIDC_TOKEN="?([^"\r\n]+)"?/);

  if (!tokenMatch) {
    log("No VERCEL_OIDC_TOKEN found - run 'vercel env pull' first", "warn");
    updateStatus("skip", null, "no_token");
    return;
  }

  const currentToken = tokenMatch[1];
  const expiry = decodeJwtExpiry(currentToken);

  if (!expiry) {
    log("Could not decode token expiry", "warn");
    updateStatus("skip", null, "decode_error");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = expiry - now;
  const remainingMinutes = Math.floor(remainingSeconds / 60);

  const expiryDate = new Date(expiry * 1000).toLocaleString("sv-SE");
  log(`Token expires: ${expiryDate} (${remainingMinutes} min remaining)`);

  if (remainingSeconds > REFRESH_THRESHOLD_MINUTES * 60) {
    log("Token is valid - no refresh needed", "success");
    updateStatus("valid", expiry, "ok");
    return;
  }

  if (remainingSeconds <= 0) {
    log("Token EXPIRED - refreshing now...", "error");
  } else {
    log("Token expires soon - refreshing...", "warn");
  }

  // Refresh token
  log("Pulling fresh environment from Vercel...");

  const tempFile = ".env.vercel-temp";

  try {
    execSync(`vercel env pull ${tempFile} --yes`, {
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (err) {
    log(`Failed to pull env: ${err.message}`, "error");
    log("Try running 'vercel link' first", "warn");
    updateStatus("refresh_failed", expiry, "vercel_error");
    return;
  }

  if (!existsSync(tempFile)) {
    log("Temp file not created", "error");
    return;
  }

  const newEnvContent = readFileSync(tempFile, "utf8");
  const newTokenMatch = newEnvContent.match(/VERCEL_OIDC_TOKEN="?([^"\r\n]+)"?/);

  if (!newTokenMatch) {
    log("No OIDC token in pulled env", "error");
    try {
      unlinkSync(tempFile);
    } catch {}
    return;
  }

  const newToken = newTokenMatch[1];
  const newExpiry = decodeJwtExpiry(newToken);

  // Update only the OIDC token in .env.local
  const updatedContent = envContent.replace(
    /VERCEL_OIDC_TOKEN="?[^"\r\n]+"?/,
    `VERCEL_OIDC_TOKEN="${newToken}"`,
  );
  writeFileSync(ENV_FILE, updatedContent);

  // Cleanup
  try {
    unlinkSync(tempFile);
  } catch {}

  const newExpiryDate = new Date(newExpiry * 1000).toLocaleString("sv-SE");
  const newRemainingMinutes = Math.floor((newExpiry - now) / 60);

  log("Token refreshed successfully!", "success");
  log(`New expiry: ${newExpiryDate} (${newRemainingMinutes} min)`, "success");

  updateStatus("refreshed", newExpiry, "ok");
}

main().catch(console.error);
