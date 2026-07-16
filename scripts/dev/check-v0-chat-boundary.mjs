import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REMOVED_ROUTE_PREFIX = "src/app/api/v0/chats/";
const ACTIVE_CODE_PREFIXES = Object.freeze([
  "src/",
  "scripts/",
  "preview-host/",
  "services/",
  "backoffice/",
]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
const HISTORICAL_DOC_PREFIXES = Object.freeze([
  "docs/archive/",
  "docs/audits/",
  "docs/old/",
  "docs/plans/archived/",
  "docs/plans/avklarat/",
]);
const LEGACY_DOC_ALLOWLIST = new Set([
  "docs/schemas/chat-message-ui-parts.md",
  "docs/schemas/preview-session-contract.md",
]);

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

function isActiveCode(path) {
  return (
    ACTIVE_CODE_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    CODE_EXTENSIONS.has(extname(path).toLowerCase()) &&
    path !== "src/lib/api/engine-chats-path.ts" &&
    path !== "scripts/dev/check-v0-chat-boundary.mjs" &&
    path !== "scripts/dev/check-v0-chat-boundary.test.ts"
  );
}

function isActiveDoc(path) {
  return (
    (path.endsWith(".md") || path.endsWith(".mdx")) &&
    !HISTORICAL_DOC_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

export async function checkV0ChatBoundary({ trackedPaths, readTrackedFile } = {}) {
  const tracked = trackedPaths ??
    execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));
  const errors = [];

  for (const path of tracked.filter((candidate) => candidate.startsWith(REMOVED_ROUTE_PREFIX))) {
    errors.push(`${path}: removed v0 chat route must not reappear`);
  }

  for (const path of tracked.filter(isActiveCode).sort(compareText)) {
    const lines = (await read(path)).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (/\/api\/v0\/chats(?:[/?#'"`]|$)/.test(lines[index])) {
        errors.push(`${path}:${index + 1}: active caller targets removed /api/v0/chats boundary`);
      }
    }
  }

  for (const path of tracked.filter(isActiveDoc).sort(compareText)) {
    if (LEGACY_DOC_ALLOWLIST.has(path)) continue;
    const lines = (await read(path)).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (/\/api\/v0\/chats(?:[/?#'"`*]|$)/.test(lines[index])) {
        errors.push(`${path}:${index + 1}: active docs reference removed /api/v0/chats boundary`);
      }
    }
  }

  return errors;
}

async function main() {
  const errors = await checkV0ChatBoundary();
  if (errors.length > 0) {
    for (const error of errors) console.error(`[compat:v0-chat] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("[compat:v0-chat] Removed v0 chat routes and callers remain absent.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
