import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Code-owned minimum classification. The JSON policy may add routes, but it
// must not be able to remove or broadly overlap its way around the checks that
// make a repository surface safe. `collectImpact` therefore uses these globs
// both as effective routes and as the only basis for deciding that a path is
// classified enough to avoid the unknown-path fail-safe.
export const PATH_GROUP_FLOORS = Object.freeze({
  // Diagramkällor och renderade bilder är dokumentation: de körs aldrig, så de
  // ska inte utlösa unknown-path-skyddet nedan och dra in hela testsviten.
  // `.yaml` är medvetet bara klassat inne i dokumentationsträdet `övrigt/` —
  // en ny `infra/*.yaml` ska fortsätta falla i skyddet.
  docs: Object.freeze([
    "**/*.md",
    "**/*.mdx",
    "docs/**",
    "**/*.mmd",
    "**/*.svg",
    "övrigt/**/*.yaml",
    "övrigt/**/*.yml",
  ]),
  controlPlane: Object.freeze([
    "docs/schemas/**",
    "config/control-plane/**",
    "config/backoffice/**",
  ]),
  agent: Object.freeze([
    "AGENTS.md",
    ".agents/**",
    ".codex/**",
    ".cursor/**",
    "config/agent-workflow.json",
    "scripts/dev/check-agent-context-budget.mjs",
    "scripts/workflow/**",
  ]),
  runtime: Object.freeze([
    "src/**",
    "tests/**",
    "e2e/**",
    "backoffice/**",
    "scripts/**",
    "preview-host/**",
    "public/**",
    "infra/**",
    "drizzle/**",
    "config/**",
    "*.config.js",
    "*.config.mjs",
    "*.config.ts",
    "tsconfig*.json",
    "vercel.json",
    "knip.json",
    ".node-version",
    "package.json",
    "package-lock.json",
    "requirements*.txt",
    "sajtmaskin_backoffice.py",
  ]),
  backoffice: Object.freeze([
    "backoffice/**",
    "scripts/template_curator/**",
    "sajtmaskin_backoffice.py",
    "requirements.backoffice*.txt",
  ]),
  database: Object.freeze([
    "src/lib/db/**",
    "scripts/db/**",
    "drizzle/**",
    "requirements.dbtest.txt",
    "**/migrations/**",
  ]),
  dependencies: Object.freeze([
    "package.json",
    "package-lock.json",
    "preview-host/package.json",
    "requirements*.txt",
    ".node-version",
  ]),
  ci: Object.freeze([".github/**", "scripts/ci/**", "scripts/pr-review/**"]),
  previewHost: Object.freeze(["preview-host/**"]),
  observability: Object.freeze(["scripts/observability/**", "requirements.genlogs.txt"]),
  e2e: Object.freeze(["e2e/**", "playwright*.config.ts"]),
});

export function normalizeRepoPath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/");
}

/**
 * Parse `git diff --name-status -z`. Rename/copy records own two paths; both
 * must enter impact analysis or moving a protected source to an ordinary
 * destination can silently erase the source owner from the verification plan.
 */
export function parseGitNameStatus(value) {
  const fields = String(value ?? "").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const paths = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!/^[ACDMRTUXB](?:\d{1,3})?$/u.test(status)) {
      throw new Error(`malformed git name-status record: ${JSON.stringify(status)}`);
    }
    const source = fields[index++];
    if (source === undefined || source === "") {
      throw new Error(`git name-status record ${status} is missing its path`);
    }
    paths.push(source);

    if (/^[RC]/u.test(status)) {
      const destination = fields[index++];
      if (destination === undefined || destination === "") {
        throw new Error(`git name-status record ${status} is missing its destination`);
      }
      paths.push(destination);
    }
  }

  return [...new Set(paths.map(normalizeRepoPath))];
}

export function normalizeOwnerPattern(value) {
  const withoutNote = String(value ?? "").split(" (")[0];
  return normalizeRepoPath(withoutNote.split("#")[0].trim());
}

export function expandBraces(pattern) {
  const match = /\{([^{}]+)\}/.exec(pattern);
  if (!match) return [pattern];
  return match[1]
    .split(",")
    .flatMap((part) =>
      expandBraces(
        `${pattern.slice(0, match.index)}${part}${pattern.slice(match.index + match[0].length)}`,
      ),
    );
}

function globRegExp(pattern) {
  let source = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      const followedBySlash = pattern[i + 2] === "/";
      source += followedBySlash ? "(?:.*/)?" : ".*";
      i += followedBySlash ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

export function pathMatchesPattern(rawPath, rawPattern) {
  const path = normalizeRepoPath(rawPath);
  const normalized = normalizeOwnerPattern(rawPattern);
  if (!path || !normalized) return false;
  return expandBraces(normalized).some((pattern) => {
    if (pattern.endsWith("/") && !pattern.includes("*")) return path.startsWith(pattern);
    if (!/[?*]/.test(pattern)) return path === pattern;
    return globRegExp(pattern).test(path);
  });
}

function matchesAny(path, patterns = []) {
  return patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

function entryMatches(entry, changedFiles) {
  return changedFiles.some((path) => pathMatchesPattern(path, entry.sourceOfTruth));
}

function pagePatterns(page) {
  return [
    ...(page.canonicalPaths ?? []),
    ...(page.docsPaths ?? []),
    ...(page.humanSchemaPaths ?? []),
    ...(page.strictSchemaPaths ?? []),
    ...(page.codeReaders ?? []),
  ];
}

export function collectImpact({
  changedFiles,
  policy,
  schemaRegistry,
  policyRegistry,
  domainMap,
  forceFull = false,
}) {
  const files = [...new Set(changedFiles.map(normalizeRepoPath).filter(Boolean))].sort();
  const groupNames = [
    ...new Set([...Object.keys(PATH_GROUP_FLOORS), ...Object.keys(policy.pathGroups)]),
  ];
  const groups = Object.fromEntries(
    groupNames.map((name) => {
      const patterns = [...(PATH_GROUP_FLOORS[name] ?? []), ...(policy.pathGroups[name] ?? [])];
      return [name, files.filter((path) => matchesAny(path, patterns))];
    }),
  );
  const authorities = [...schemaRegistry.entries, ...policyRegistry.entries]
    .filter((entry) => entryMatches(entry, files))
    .map((entry) => ({
      id: entry.id,
      sourceOfTruth: entry.sourceOfTruth,
      validator: entry.validator,
      ciStatus: entry.ciStatus,
      runtimeStatus: entry.runtimeStatus,
      backofficeSurface: entry.backoffice?.surface ?? null,
    }));

  const backofficePages = Object.entries(domainMap.pages)
    .filter(([, page]) => files.some((path) => matchesAny(path, pagePatterns(page))))
    .map(([name]) => name)
    .sort();
  for (const entry of authorities) {
    if (entry.backofficeSurface && !backofficePages.includes(entry.backofficeSurface)) {
      backofficePages.push(entry.backofficeSurface);
    }
  }
  backofficePages.sort();

  const protectedFiles = files.filter((path) => matchesAny(path, policy.protectedPaths));
  const commands = new Set(policy.verificationProfiles.always);
  for (const [group, matched] of Object.entries(groups)) {
    if (matched.length > 0) {
      for (const command of policy.verificationProfiles[group] ?? []) commands.add(command);
    }
  }
  for (const entry of authorities) {
    if (entry.validator && entry.ciStatus === "hard") commands.add(entry.validator);
  }
  if (backofficePages.length > 0) {
    for (const command of policy.verificationProfiles.backoffice) commands.add(command);
  }
  if (forceFull || protectedFiles.length > 0) {
    for (const command of policy.verificationProfiles.full) commands.add(command);
  }

  const ownedFiles = new Set();
  for (const file of files) {
    if (authorities.some((entry) => pathMatchesPattern(file, entry.sourceOfTruth)))
      ownedFiles.add(file);
    if (Object.values(domainMap.pages).some((page) => matchesAny(file, pagePatterns(page)))) {
      ownedFiles.add(file);
    }
  }
  const unmappedRuntimeFiles = groups.runtime.filter((file) => !ownedFiles.has(file));
  // Only the code-owned floor may suppress unknown-path verification. An
  // editable catch-all such as docs=["**"] may select extra docs checks, but
  // cannot make a new product area look safely classified and thereby shallow.
  const classifiedFiles = new Set(
    files.filter((file) =>
      Object.values(PATH_GROUP_FLOORS).some((patterns) => matchesAny(file, patterns)),
    ),
  );
  const unclassifiedFiles = files.filter((file) => !classifiedFiles.has(file));

  // Unknown paths and runtime files without a declared owner fail safe into
  // both the broad runtime checks and the supplemental full profile. This is
  // deliberately expensive: adding a new repo area must never produce a green
  // plan that only ran the workflow self-check.
  if (unmappedRuntimeFiles.length > 0 || unclassifiedFiles.length > 0) {
    for (const command of policy.verificationProfiles.runtime) commands.add(command);
    for (const command of policy.verificationProfiles.full) commands.add(command);
  }

  return {
    files,
    groups,
    authorities,
    backofficePages,
    protectedFiles,
    unmappedRuntimeFiles,
    unclassifiedFiles,
    commands: [...commands],
    manualValidators: authorities
      .filter((entry) => entry.validator && entry.ciStatus === "manual")
      .map((entry) => entry.validator),
  };
}

export function loadWorkflowInputs(root = process.cwd()) {
  const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return {
    policy: readJson("config/agent-workflow.json"),
    schemaRegistry: readJson("config/control-plane/schema-registry.json"),
    policyRegistry: readJson("config/control-plane/policy-registry.json"),
    domainMap: readJson("config/backoffice/domain-map.json"),
  };
}
