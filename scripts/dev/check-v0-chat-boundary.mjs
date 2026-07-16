import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REMOVED_ROUTE_PREFIX = "src/app/api/v0/chats/";
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
const ACTIVE_CONFIG_BASENAMES = new Set(["vercel.json"]);
const NON_RUNTIME_CODE_PREFIXES = Object.freeze([
  "docs/",
  "archive/",
  ".cursor/",
  "grandmaster/",
]);
const HISTORICAL_DOC_PREFIXES = Object.freeze([
  "docs/archive/",
  "docs/audits/",
  "docs/old/",
  "docs/plans/archived/",
  "docs/plans/avklarat/",
]);
const EXEMPT_CODE_PATHS = new Set([
  "src/lib/api/engine-chats-path.ts",
  "scripts/dev/check-v0-chat-boundary.mjs",
  "scripts/dev/check-v0-chat-boundary.test.ts",
]);
const LEGACY_DOC_LINE_ALLOWLIST = new Map([
  [
    "docs/schemas/chat-message-ui-parts.md",
    new Set([
      "> Tidigare `/api/v0/chats/**`-aliases borttagna 2026-04-20 (P29 Fas 1B).",
    ]),
  ],
  [
    "docs/schemas/preview-session-contract.md",
    new Set([
      "(Tidigare `/api/v0/chats/[chatId]/preview-session`-aliaset borttaget i P29 Fas 1B 2026-04-20.)",
      "(Tidigare `/api/v0/chats/[chatId]/...`-aliases borttagna i P29 Fas 1B 2026-04-20.)",
    ]),
  ],
]);
const REMOVED_URL_PATTERN = /\/api\/v0\/chats(?=$|[^A-Za-z0-9_-])/;

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

function isTestPath(path) {
  return (
    /(?:^|\/)__tests__\//.test(path) ||
    /\.(?:test|spec)\.[^.]+$/.test(path)
  );
}

function isActiveCode(path) {
  const basename = path.split("/").at(-1);
  return (
    (CODE_EXTENSIONS.has(extname(path).toLowerCase()) ||
      ACTIVE_CONFIG_BASENAMES.has(basename)) &&
    !NON_RUNTIME_CODE_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    !isTestPath(path) &&
    !EXEMPT_CODE_PATHS.has(path)
  );
}

function isActiveDoc(path) {
  return (
    (path.endsWith(".md") || path.endsWith(".mdx")) &&
    !HISTORICAL_DOC_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function normalizeAppRoutePath(path) {
  return path
    .split("/")
    .filter((segment) => !/^\([^/]+\)$/.test(segment))
    .join("/");
}

function isAllowedLegacyDocLine(path, line) {
  return LEGACY_DOC_LINE_ALLOWLIST.get(path)?.has(line) ?? false;
}

export async function checkV0ChatBoundary({ trackedPaths, readTrackedFile } = {}) {
  const tracked = trackedPaths ??
    execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));
  const errors = [];

  for (const path of tracked) {
    if (normalizeAppRoutePath(path).startsWith(REMOVED_ROUTE_PREFIX)) {
      errors.push(`${path}: removed v0 chat route must not reappear`);
    }
  }

  for (const path of tracked.filter(isActiveCode).sort(compareText)) {
    const lines = (await read(path)).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (REMOVED_URL_PATTERN.test(lines[index])) {
        errors.push(`${path}:${index + 1}: active caller targets removed /api/v0/chats boundary`);
      }
    }
  }

  for (const path of tracked.filter(isActiveDoc).sort(compareText)) {
    const lines = (await read(path)).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (
        REMOVED_URL_PATTERN.test(lines[index]) &&
        !isAllowedLegacyDocLine(path, lines[index])
      ) {
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
