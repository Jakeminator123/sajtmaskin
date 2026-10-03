#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEPENDENCY_SECTIONS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function matchesAllowedPackage(name, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith("/*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}

export function parseDependencyNames(value) {
  return [
    ...new Set(
      String(value ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function parseStableSemverSpec(value) {
  const match = /^([~^]?)(\d+)\.(\d+)\.(\d+)$/u.exec(String(value ?? ""));
  if (!match) return null;
  return {
    prefix: match[1],
    major: Number(match[2]),
    minor: Number(match[3]),
    patch: Number(match[4]),
  };
}

function assertPatchChange(name, before, after) {
  const oldVersion = parseStableSemverSpec(before);
  const newVersion = parseStableSemverSpec(after);
  invariant(oldVersion && newVersion, `${name}: endast stabila semver-specar får auto-mergas`);
  invariant(oldVersion.prefix === newVersion.prefix, `${name}: versionsprefix ändrades`);
  invariant(
    oldVersion.major === newVersion.major && oldVersion.minor === newVersion.minor,
    `${name}: uppdateringen är inte en patch`,
  );
  invariant(newVersion.patch > oldVersion.patch, `${name}: patchversionen ökade inte`);
}

function withoutDependencySections(value) {
  const copy = structuredClone(value ?? {});
  for (const section of DEPENDENCY_SECTIONS) delete copy[section];
  return copy;
}

export function validateManifestChanges(before, after, dependencyNames, allowedPatterns) {
  invariant(
    isDeepStrictEqual(withoutDependencySections(before), withoutDependencySections(after)),
    "package.json innehåller andra ändringar än beroendeversioner",
  );

  const metadataNames = new Set(dependencyNames);
  const directNames = new Set();
  const changedNames = new Set();
  for (const section of DEPENDENCY_SECTIONS) {
    const oldDeps = before?.[section] ?? {};
    const newDeps = after?.[section] ?? {};
    for (const name of new Set([...Object.keys(oldDeps), ...Object.keys(newDeps)])) {
      if (name in oldDeps || name in newDeps) directNames.add(name);
      if (oldDeps[name] === newDeps[name]) continue;
      invariant(metadataNames.has(name), `${section}.${name}: saknas i Dependabot-metadata`);
      invariant(
        matchesAllowedPackage(name, allowedPatterns),
        `${section}.${name}: paketet finns inte i auto-merge-allowlisten`,
      );
      invariant(name in oldDeps && name in newDeps, `${section}.${name}: paket lades till eller togs bort`);
      assertPatchChange(name, oldDeps[name], newDeps[name]);
      changedNames.add(name);
    }
  }

  for (const name of dependencyNames) {
    invariant(matchesAllowedPackage(name, allowedPatterns), `${name}: paketet är inte allowlistat`);
    invariant(directNames.has(name), `${name}: endast direkta npm-beroenden får auto-mergas`);
  }
  for (const name of changedNames) {
    invariant(metadataNames.has(name), `${name}: manifeständringen saknar metadata`);
  }
}

function parentPackagePath(packagePath) {
  if (!packagePath) return null;
  const nested = packagePath.lastIndexOf("/node_modules/");
  if (nested >= 0) return packagePath.slice(0, nested);
  return packagePath.startsWith("node_modules/") ? "" : null;
}

function resolveInstalledDependency(packagePath, dependencyName, packages) {
  let current = packagePath;
  while (current !== null) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    current = parentPackagePath(current);
  }
  return null;
}

function dependencyClosure(lock, dependencyNames) {
  const packages = lock?.packages ?? {};
  const seen = new Set();
  const queue = dependencyNames
    .map((name) => `node_modules/${name}`)
    .filter((packagePath) => packages[packagePath]);
  while (queue.length > 0) {
    const packagePath = queue.shift();
    if (!packagePath || seen.has(packagePath)) continue;
    seen.add(packagePath);
    const entry = packages[packagePath] ?? {};
    const dependencies = {
      ...(entry.dependencies ?? {}),
      ...(entry.optionalDependencies ?? {}),
    };
    for (const name of Object.keys(dependencies)) {
      const resolved = resolveInstalledDependency(packagePath, name, packages);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

function lockMetadata(lock) {
  const copy = structuredClone(lock ?? {});
  delete copy.packages;
  return copy;
}

function assertSafeRegistryEntry(packagePath, entry) {
  invariant(entry?.hasInstallScript !== true, `${packagePath}: install-script kräver manuell review`);
  if (entry?.resolved !== undefined) {
    invariant(
      String(entry.resolved).startsWith("https://registry.npmjs.org/"),
      `${packagePath}: resolved pekar inte på npm-registret`,
    );
  }
}

export function validateLockChanges(baseLock, headLock, dependencyNames, allowedPatterns) {
  invariant(
    isDeepStrictEqual(lockMetadata(baseLock), lockMetadata(headLock)),
    "package-lock metadata ändrades utanför packages",
  );
  invariant(baseLock?.lockfileVersion >= 2 && headLock?.lockfileVersion >= 2, "lockfile v2+ krävs");

  validateManifestChanges(
    baseLock?.packages?.[""] ?? {},
    headLock?.packages?.[""] ?? {},
    dependencyNames,
    allowedPatterns,
  );

  const allowedPaths = new Set([
    ...dependencyClosure(baseLock, dependencyNames),
    ...dependencyClosure(headLock, dependencyNames),
  ]);
  const basePackages = baseLock?.packages ?? {};
  const headPackages = headLock?.packages ?? {};
  for (const packagePath of new Set([...Object.keys(basePackages), ...Object.keys(headPackages)])) {
    if (isDeepStrictEqual(basePackages[packagePath], headPackages[packagePath])) continue;
    if (packagePath === "") continue;
    invariant(
      allowedPaths.has(packagePath),
      `${packagePath}: lockändringen ligger utanför allowlistade pakets beroendeträd`,
    );
    if (headPackages[packagePath]) assertSafeRegistryEntry(packagePath, headPackages[packagePath]);
  }
}

export function validateSnapshot({
  config,
  updateType,
  dependencyNames,
  changedFiles,
  basePackage,
  headPackage,
  baseLock,
  headLock,
}) {
  invariant(updateType === "version-update:semver-patch", `inte en patch: ${updateType || "okänd"}`);
  invariant(dependencyNames.length > 0, "Dependabot-metadata saknar paketnamn");
  const allowedFiles = new Set(config.allowedFiles);
  invariant(changedFiles.length > 0, "PR:n saknar ändrade filer");
  for (const file of changedFiles) invariant(allowedFiles.has(file), `${file}: filen kräver manuell review`);
  invariant(changedFiles.includes("package-lock.json"), "package-lock.json måste ingå");
  validateManifestChanges(basePackage, headPackage, dependencyNames, config.allowedPackages);
  validateLockChanges(baseLock, headLock, dependencyNames, config.allowedPackages);
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sajtmaskin-dependabot-automerge",
    },
  });
  invariant(response.ok, `GitHub API ${path} svarade ${response.status}`);
  return response.json();
}

async function readGitHubFile(repo, path, ref, token) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubJson(
    `/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  invariant(data?.encoding === "base64" && typeof data.content === "string", `${path}: ogiltigt API-svar`);
  return JSON.parse(Buffer.from(data.content.replace(/\s/gu, ""), "base64").toString("utf8"));
}

async function listPullRequestFiles(repo, prNumber, token) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const batch = await githubJson(
      `/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      token,
    );
    invariant(Array.isArray(batch), "GitHub returnerade ingen fillista");
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
}

export async function validateFromEnvironment(env = process.env) {
  invariant(env.GH_TOKEN, "GH_TOKEN saknas");
  invariant(env.REPO, "REPO saknas");
  invariant(env.PR_NUMBER, "PR_NUMBER saknas");
  invariant(env.BASE_SHA && env.HEAD_SHA, "base/head-SHA saknas");
  const config = JSON.parse(readFileSync(resolve(ROOT, "config/dependabot-automerge.json"), "utf8"));
  invariant(env.BASE_REF === config.baseBranch, `fel basgren: ${env.BASE_REF || "okänd"}`);
  const dependencyNames = parseDependencyNames(env.DEPENDENCY_NAMES);
  const changedFiles = await listPullRequestFiles(env.REPO, env.PR_NUMBER, env.GH_TOKEN);
  const [basePackage, headPackage, baseLock, headLock] = await Promise.all([
    readGitHubFile(env.REPO, "package.json", env.BASE_SHA, env.GH_TOKEN),
    readGitHubFile(env.REPO, "package.json", env.HEAD_SHA, env.GH_TOKEN),
    readGitHubFile(env.REPO, "package-lock.json", env.BASE_SHA, env.GH_TOKEN),
    readGitHubFile(env.REPO, "package-lock.json", env.HEAD_SHA, env.GH_TOKEN),
  ]);
  validateSnapshot({
    config,
    updateType: env.UPDATE_TYPE,
    dependencyNames,
    changedFiles,
    basePackage,
    headPackage,
    baseLock,
    headLock,
  });
  return { dependencyNames, changedFiles };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  validateFromEnvironment()
    .then(({ dependencyNames, changedFiles }) => {
      console.log(
        `Dependabot auto-merge godkänd: ${dependencyNames.join(", ")} (${changedFiles.join(", ")})`,
      );
    })
    .catch((error) => {
      console.error(`Dependabot auto-merge nekad: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
