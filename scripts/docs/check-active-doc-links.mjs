import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const HISTORICAL_DOC_PREFIXES = Object.freeze([
  "docs/archive/",
  "docs/audits/",
  "docs/old/",
  "docs/plans/archived/",
  "docs/plans/avklarat/",
  "_parkering/",
]);

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

export function isActiveMarkdown(path) {
  const extension = extname(path).toLowerCase();
  return (
    (extension === ".md" || extension === ".mdx") &&
    !HISTORICAL_DOC_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function withoutCode(content) {
  return content
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

export function extractLocalLinkTargets(content) {
  const source = withoutCode(content);
  const targets = new Set();
  const candidates = [
    ...source.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g),
    ...source.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm),
    ...source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi),
  ];

  for (const match of candidates) {
    let target = match[1]?.trim();
    if (!target) continue;
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
    targets.add(target);
  }
  return [...targets].sort(compareText);
}

export function resolveLocalTarget(sourcePath, rawTarget) {
  const targetWithoutFragment = rawTarget.split("#", 1)[0]?.split("?", 1)[0] ?? "";
  if (!targetWithoutFragment) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(targetWithoutFragment);
  } catch {
    return { error: "invalid URI encoding", target: rawTarget };
  }

  const normalized = decoded.replaceAll("\\", "/");
  const repoPath = normalized.startsWith("/")
    ? posix.normalize(normalized.slice(1))
    : posix.normalize(posix.join(posix.dirname(sourcePath), normalized));

  if (repoPath === ".." || repoPath.startsWith("../")) {
    return { error: "points outside the repository", target: rawTarget };
  }
  return { path: repoPath, target: rawTarget };
}

export async function checkActiveDocLinks({
  trackedPaths,
  readTrackedFile,
} = {}) {
  const tracked = trackedPaths ??
    execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const trackedSet = new Set(tracked);
  const trackedTopLevel = new Set(tracked.map((path) => path.split("/", 1)[0]));
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));
  const failures = [];

  for (const sourcePath of tracked.filter(isActiveMarkdown).sort(compareText)) {
    const content = await read(sourcePath);
    for (const rawTarget of extractLocalLinkTargets(content)) {
      if (rawTarget.startsWith("/")) {
        const topLevel = rawTarget.slice(1).split(/[/?#]/, 1)[0];
        if (!trackedTopLevel.has(topLevel)) continue;
      }
      const resolved = resolveLocalTarget(sourcePath, rawTarget);
      if (!resolved) continue;
      if (resolved.error) {
        failures.push({ sourcePath, target: rawTarget, reason: resolved.error });
        continue;
      }

      const path = resolved.path;
      const exists = trackedSet.has(path) || tracked.some((candidate) => candidate.startsWith(`${path}/`));
      if (!exists) failures.push({ sourcePath, target: rawTarget, resolvedPath: path, reason: "missing" });
    }
  }
  return failures;
}

async function main() {
  const failures = await checkActiveDocLinks();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `[docs:links] ${failure.sourcePath}: ${failure.target} -> ${
          failure.resolvedPath ?? failure.reason
        } (${failure.reason})`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log("[docs:links] Active Markdown links resolve to tracked repository paths.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
