#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function normalizeNodeVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(String(value ?? "").trim());
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function evaluateNodeVersion({ actual, expected }) {
  const normalizedActual = normalizeNodeVersion(actual);
  const normalizedExpected = normalizeNodeVersion(expected);
  if (!normalizedActual || !normalizedExpected) {
    return {
      valid: false,
      reason: `ogiltig Node-version (aktuell=${actual || "saknas"}, förväntad=${expected || "saknas"})`,
    };
  }
  if (normalizedActual !== normalizedExpected) {
    return {
      valid: false,
      reason:
        `Node ${normalizedExpected} krävs men ${normalizedActual} körs. ` +
        `Byt med Volta (volta install node@${normalizedExpected}) eller nvm-windows ` +
        `(nvm install ${normalizedExpected} && nvm use ${normalizedExpected}).`,
    };
  }
  return { valid: true, reason: `Node ${normalizedActual}` };
}

export function evaluateRepositoryNodeVersion({
  root = REPO_ROOT,
  actual = process.versions.node,
} = {}) {
  const expected = readFileSync(resolve(root, ".node-version"), "utf8").trim();
  return evaluateNodeVersion({ actual, expected });
}

function main() {
  const result = evaluateRepositoryNodeVersion();
  if (!result.valid) {
    console.error(`[node-version] STOPP: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[node-version] OK — ${result.reason}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
