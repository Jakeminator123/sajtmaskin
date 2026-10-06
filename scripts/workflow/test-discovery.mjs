#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { pathMatchesPattern } from "./path-impact.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_CANDIDATE =
  /(?:^|\/)(?:(?:test[^/]*|[^/]+_(?:test|tests|spec))\.py|[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?))$/iu;
const PYTHON_TEST = /(?:^|\/)(?:test[^/]*|[^/]+_(?:test|tests|spec))\.py$/iu;
const PREVIEW_HOST_TEST = /^preview-host\/scripts\/test-[^/]+\.mjs$/iu;
const PLAYWRIGHT_TEST = /^e2e\/.*\.spec\.ts$/iu;
const NODE_TEST = /\.(?:test|spec)\.(?:mjs|cjs|js)$/iu;

export function normalizeRepoPath(value, root = REPO_ROOT) {
  let normalized = String(value ?? "")
    .trim()
    .replace(/\\/gu, "/");
  if (isAbsolute(normalized)) normalized = relative(root, normalized).replace(/\\/gu, "/");
  return normalized.replace(/^\.\//u, "").replace(/\/+/gu, "/");
}

export function collectTestCandidates(files) {
  return [
    ...new Set(
      files
        .map((file) => normalizeRepoPath(file))
        .filter((file) => TEST_CANDIDATE.test(file) || PREVIEW_HOST_TEST.test(file)),
    ),
  ].sort();
}

function scriptValues(pkg) {
  return Object.values(pkg?.scripts ?? {}).map(String);
}

export function splitCommandSegments(script) {
  const segments = [];
  let current = "";
  let quote = "";
  const pushCurrent = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };
  for (let index = 0; index < script.length; index += 1) {
    const char = script[index];
    if (quote) {
      current += char;
      if (char === "\\" && quote === '"' && index + 1 < script.length) {
        current += script[index + 1];
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\\" && index + 1 < script.length) {
      current += char + script[index + 1];
      index += 1;
      continue;
    }
    if (char === "#" && (current.length === 0 || /\s/u.test(current.at(-1)))) {
      pushCurrent();
      while (index + 1 < script.length && !/[\r\n]/u.test(script[index + 1])) index += 1;
      continue;
    }
    const pair = script.slice(index, index + 2);
    const redirectedDescriptor =
      char === "&" && (/[<>]\s*$/u.test(current) || script[index + 1] === ">");
    if (
      pair === "&&" ||
      pair === "||" ||
      pair === "|&" ||
      char === ";" ||
      char === "\r" ||
      char === "\n" ||
      char === "|" ||
      (char === "&" && !redirectedDescriptor)
    ) {
      pushCurrent();
      index += pair === "&&" || pair === "||" ? 1 : 0;
      if (pair === "|&" || (char === "\r" && script[index + 1] === "\n")) index += 1;
      continue;
    }
    current += char;
  }
  pushCurrent();
  return segments;
}

function commandTokens(segment) {
  return [...segment.matchAll(/"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s]+)/gu)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

function pythonInvocation(tokens) {
  if (
    tokens[0] === "node" &&
    normalizeRepoPath(tokens[1]) === "scripts/dev/assert-git-checkout-unchanged.mjs"
  ) {
    const separator = tokens.indexOf("--");
    return separator >= 0 ? pythonInvocation(tokens.slice(separator + 1)) : null;
  }
  if (tokens[0] === "node" && normalizeRepoPath(tokens[1]) === "scripts/dev/run-python.mjs") {
    return tokens.slice(2);
  }
  if (/^(?:python|python3|py)(?:\.exe)?$/iu.test(tokens[0] ?? "")) return tokens.slice(1);
  return null;
}

function collectPythonAssignments(scripts, candidates) {
  const exact = new Set();
  const discover = [];
  for (const script of scripts) {
    for (const segment of splitCommandSegments(script)) {
      const args = pythonInvocation(commandTokens(segment));
      if (!args) continue;
      if (args[0]?.endsWith(".py")) exact.add(normalizeRepoPath(args[0]));
      if (args[0] !== "-m" || args[1] !== "unittest" || args[2] !== "discover") continue;
      const rootIndex = args.indexOf("-s");
      const patternIndex = args.indexOf("-p");
      if (rootIndex < 0 || patternIndex < 0 || !args[rootIndex + 1] || !args[patternIndex + 1]) {
        continue;
      }
      discover.push({
        root: normalizeRepoPath(args[rootIndex + 1]),
        pattern: args[patternIndex + 1],
      });
    }
  }
  return candidates.filter(
    (file) =>
      exact.has(file) ||
      discover.some((entry) => {
        if (!file.startsWith(`${entry.root}/`)) return false;
        const rest = file.slice(entry.root.length + 1);
        return !rest.includes("/") && pathMatchesPattern(rest, entry.pattern);
      }),
  );
}

function collectNodeTestAssignments(scripts) {
  const assigned = new Set();
  for (const script of scripts) {
    for (const segment of splitCommandSegments(script)) {
      const tokens = commandTokens(segment);
      if (tokens[0] !== "node" || tokens[1] !== "--test") continue;
      let skipRedirectTarget = false;
      for (const token of tokens.slice(2)) {
        if (skipRedirectTarget) {
          skipRedirectTarget = false;
          continue;
        }
        const redirect = token.match(/^(?:(?:\d+|&)?(?:<<<|<<|<>|>>|>\||<&|>&|>|<))(.*)$/u);
        if (redirect) {
          skipRedirectTarget = redirect[1] === "";
          continue;
        }
        if (NODE_TEST.test(token)) assigned.add(normalizeRepoPath(token));
      }
    }
  }
  return assigned;
}

function previewScriptRoots(rootScripts) {
  const roots = new Set();
  for (const script of rootScripts) {
    for (const segment of splitCommandSegments(script)) {
      const tokens = commandTokens(segment);
      if (
        tokens[0] === "npm" &&
        tokens[1] === "--prefix" &&
        tokens[2] === "preview-host" &&
        tokens[3] === "run" &&
        tokens[4]
      ) {
        roots.add(tokens[4]);
      }
    }
  }
  return roots;
}

function collectPreviewHostAssignments(rootScripts, previewScripts) {
  const queue = [...previewScriptRoots(rootScripts)];
  const visited = new Set();
  const assigned = new Set();
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || visited.has(name)) continue;
    visited.add(name);
    const script = String(previewScripts?.[name] ?? "");
    for (const segment of splitCommandSegments(script)) {
      const tokens = commandTokens(segment);
      if (tokens[0] === "npm" && tokens[1] === "run" && tokens[2]) queue.push(tokens[2]);
      if (tokens[0] === "node" && /^scripts\/test-[^/]+\.mjs$/iu.test(tokens[1] ?? "")) {
        assigned.add(normalizeRepoPath(`preview-host/${tokens[1]}`));
      }
    }
  }
  return assigned;
}

export function evaluateTestDiscovery({ files, discoveredFiles, packageJson, previewPackageJson }) {
  const candidates = collectTestCandidates(files);
  const discovered = new Set(discoveredFiles.map((file) => normalizeRepoPath(file)));
  const rootScripts = scriptValues(packageJson);
  const python = collectPythonAssignments(
    rootScripts,
    candidates.filter((file) => PYTHON_TEST.test(file)),
  );
  const node = collectNodeTestAssignments(rootScripts);
  const previewHost = collectPreviewHostAssignments(rootScripts, previewPackageJson?.scripts ?? {});
  const assigned = new Set([...discovered, ...python, ...node, ...previewHost]);
  const unassigned = candidates.filter((file) => !assigned.has(file));

  return {
    candidates,
    assigned: candidates.filter((file) => assigned.has(file)),
    unassigned,
    coverage: {
      discovered: candidates.filter((file) => discovered.has(file)).length,
      python: python.length,
      node: candidates.filter((file) => NODE_TEST.test(file) && node.has(file)).length,
      previewHost: candidates.filter(
        (file) => PREVIEW_HOST_TEST.test(file) && previewHost.has(file),
      ).length,
      playwright: candidates.filter((file) => PLAYWRIGHT_TEST.test(file) && discovered.has(file))
        .length,
    },
  };
}

export function deriveDiscoveryCommands(packageJson) {
  const vitestConfigs = new Set();
  const playwrightConfigs = new Set();
  for (const script of scriptValues(packageJson)) {
    for (const segment of splitCommandSegments(script)) {
      const rawTokens = commandTokens(segment);
      const tokens = rawTokens[0] === "npx" ? rawTokens.slice(1) : rawTokens;
      if (tokens[0] === "vitest" && tokens[1] === "run") {
        const configIndex = tokens.findIndex((token) => token === "-c" || token === "--config");
        vitestConfigs.add(configIndex >= 0 ? (tokens[configIndex + 1] ?? "") : "");
      }
      if (tokens[0] === "playwright" && tokens[1] === "test") {
        const configIndex = tokens.findIndex((token) => token === "-c" || token === "--config");
        if (configIndex >= 0 && tokens[configIndex + 1]) {
          playwrightConfigs.add(tokens[configIndex + 1]);
        }
      }
    }
  }
  return {
    vitestConfigs: [...vitestConfigs].sort(),
    playwrightConfigs: [...playwrightConfigs].sort(),
  };
}

async function runNodeCli(entry, args, root) {
  const result = await execFileAsync(process.execPath, [resolve(root, entry), ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return result.stdout;
}

async function listVitestFiles(config, root) {
  const args = ["list", "--filesOnly", ...(config ? ["-c", config] : [])];
  const output = await runNodeCli("node_modules/vitest/vitest.mjs", args, root);
  return output
    .split(/\r?\n/u)
    .map((line) => normalizeRepoPath(line, root))
    .filter((line) => TEST_CANDIDATE.test(line));
}

async function listPlaywrightFiles(config, root) {
  const output = await runNodeCli(
    "node_modules/@playwright/test/cli.js",
    ["test", "-c", config, "--list", "--reporter=json"],
    root,
  );
  const report = JSON.parse(output);
  const testRoot = normalizeRepoPath(report?.config?.rootDir, root);
  return (report?.suites ?? []).map((suite) =>
    normalizeRepoPath(`${testRoot}/${suite.file}`, root),
  );
}

export async function trackedAndUntrackedFiles(root) {
  const options = { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  const [listed, deleted] = await Promise.all([
    execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], options),
    execFileAsync("git", ["ls-files", "--deleted", "-z"], options),
  ]);
  const deletedPaths = new Set(deleted.stdout.split("\0").filter(Boolean));
  return listed.stdout.split("\0").filter((file) => file && !deletedPaths.has(file));
}

export async function checkTestDiscovery(root = REPO_ROOT) {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const previewPackageJson = JSON.parse(
    readFileSync(resolve(root, "preview-host/package.json"), "utf8"),
  );
  const commands = deriveDiscoveryCommands(packageJson);
  const [files, ...discoveryGroups] = await Promise.all([
    trackedAndUntrackedFiles(root),
    ...commands.vitestConfigs.map((config) => listVitestFiles(config, root)),
    ...commands.playwrightConfigs.map((config) => listPlaywrightFiles(config, root)),
  ]);
  const result = evaluateTestDiscovery({
    files,
    discoveredFiles: discoveryGroups.flat(),
    packageJson,
    previewPackageJson,
  });
  return { ...result, laneCount: discoveryGroups.length };
}

async function main() {
  try {
    const result = await checkTestDiscovery();
    if (result.unassigned.length > 0) {
      for (const file of result.unassigned)
        console.error(`[test-discovery] unassigned test file: ${file}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `[test-discovery] OK — candidates=${result.candidates.length}, assigned=${result.assigned.length}, ` +
        `lanes=${result.laneCount}, playwright=${result.coverage.playwright}, python=${result.coverage.python}, ` +
        `preview-host=${result.coverage.previewHost}, node=${result.coverage.node}`,
    );
  } catch (error) {
    console.error(
      `[test-discovery] failed to prove discovery: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
