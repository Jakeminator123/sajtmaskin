import { createHash } from "node:crypto";

import type { CodeFile } from "@/lib/gen/parser";

export const IMPORTED_REPO_CONTRACT_SCHEMA_VERSION = 1 as const;
export const IMPORTED_REPO_BASELINE_SNAPSHOT_KEY = "importedRepoBaseline" as const;

const MAX_PATHS = 20;
const MAX_ENV_KEYS = 24;
const MAX_ALIASES = 8;
const MAX_RISKS = 16;
const MAX_FRAMEWORK_PACKAGES = 10;

export type ImportedRepoOriginKind = "v0_template" | "zip" | "github" | "unknown";

export interface ImportedRepoOrigin {
  kind: ImportedRepoOriginKind;
  templateId?: string;
  templateCategory?: string;
  archiveSha256?: string;
}

export type ImportedRepoFramework = "next" | "vite" | "astro" | "remix" | "sveltekit" | "unknown";

export type ImportedRepoRouter = "app" | "pages" | "mixed" | "none";
export type ImportedRepoSourceRoot = "root" | "src" | "mixed" | "unknown";
export type ImportedRepoPackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";
export type ImportedRepoScriptFamily =
  "next" | "vite" | "astro" | "remix" | "react-scripts" | "nuxt" | "svelte-kit" | "unknown";

export type ImportedRepoRisk =
  | "missing-package-json"
  | "invalid-package-json"
  | "missing-dev-script"
  | "multiple-lockfiles"
  | "multiple-package-json"
  | "mixed-router"
  | "mixed-source-roots"
  | "unknown-framework"
  | "routes-truncated"
  | "aliases-truncated"
  | "env-keys-truncated";

export interface ImportedRepoPackageContract {
  packageJsonPath: string | null;
  packageJsonValid: boolean;
  manager: ImportedRepoPackageManager;
  lockfiles: string[];
  scripts: Partial<Record<"dev" | "build" | "start", ImportedRepoScriptFamily>>;
  frameworkVersions: Record<string, string>;
}

export interface ImportedRepoStructureContract {
  framework: ImportedRepoFramework;
  router: ImportedRepoRouter;
  sourceRoot: ImportedRepoSourceRoot;
  entries: string[];
  configs: string[];
  styles: string[];
  routes: string[];
  /** Array shape avoids snapshot key-name filtering for aliases such as `@auth/*`. */
  aliases: Array<{ name: string; target: string }>;
}

export interface ImportedRepoContractV1 {
  schemaVersion: typeof IMPORTED_REPO_CONTRACT_SCHEMA_VERSION;
  contractHash: string;
  origin: ImportedRepoOrigin;
  package: ImportedRepoPackageContract;
  structure: ImportedRepoStructureContract;
  envKeys: string[];
  risks: ImportedRepoRisk[];
}

export interface ImportedRepoBaselineSnapshot {
  schemaVersion: typeof IMPORTED_REPO_CONTRACT_SCHEMA_VERSION;
  capturedAt: string;
  versionId: string;
  filesRevision: string | null;
  contract: ImportedRepoContractV1;
}

export interface ImportedRepoContractContext {
  baseline: ImportedRepoBaselineSnapshot | null;
  current: ImportedRepoContractV1;
}

const FRAMEWORK_PACKAGES = [
  "next",
  "react",
  "react-dom",
  "typescript",
  "tailwindcss",
  "vite",
  "astro",
  "@remix-run/react",
  "@sveltejs/kit",
  "svelte",
] as const;

const CONFIG_BASENAMES = new Set([
  "components.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "astro.config.js",
  "astro.config.mjs",
  "astro.config.ts",
  "svelte.config.js",
  "svelte.config.mjs",
  "remix.config.js",
  "remix.config.mjs",
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.mjs",
  "postcss.config.cjs",
  "tsconfig.json",
  "jsconfig.json",
]);

const ENTRY_RE =
  /^(?:src\/)?(?:app\/(?:.*\/)?(?:page|layout|template|error|not-found)|pages\/(?:.*\/)?(?:index|_app|_document)|main|index|App)\.(?:[cm]?[jt]sx?)$/;
const STYLE_RE = /(?:^|\/)(?:globals?|index|styles?|theme|tokens?)\.(?:css|scss|sass|less)$/i;
const SAFE_PATH_RE = /^[A-Za-z0-9@_./()[\]{}+* -]+$/;
const SAFE_META_RE = /^[A-Za-z0-9@_./+ -]+$/;
const SAFE_PACKAGE_RE = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/;
const SAFE_VERSION_RE = /^[0-9A-Za-z.*^~<>=|+_ -]+$/;
const SAFE_ALIAS_RE = /^[A-Za-z0-9@#_./*+-]+$/;
const SAFE_ID_RE = /^[A-Za-z0-9._:-]+$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]{1,79}$/;

const ORIGIN_KINDS = new Set<ImportedRepoOriginKind>(["v0_template", "zip", "github", "unknown"]);
const FRAMEWORKS = new Set<ImportedRepoFramework>([
  "next",
  "vite",
  "astro",
  "remix",
  "sveltekit",
  "unknown",
]);
const ROUTERS = new Set<ImportedRepoRouter>(["app", "pages", "mixed", "none"]);
const SOURCE_ROOTS = new Set<ImportedRepoSourceRoot>(["root", "src", "mixed", "unknown"]);
const PACKAGE_MANAGERS = new Set<ImportedRepoPackageManager>([
  "pnpm",
  "npm",
  "yarn",
  "bun",
  "unknown",
]);
const SCRIPT_FAMILIES = new Set<ImportedRepoScriptFamily>([
  "next",
  "vite",
  "astro",
  "remix",
  "react-scripts",
  "nuxt",
  "svelte-kit",
  "unknown",
]);
const RISKS = new Set<ImportedRepoRisk>([
  "missing-package-json",
  "invalid-package-json",
  "missing-dev-script",
  "multiple-lockfiles",
  "multiple-package-json",
  "mixed-router",
  "mixed-source-roots",
  "unknown-framework",
  "routes-truncated",
  "aliases-truncated",
  "env-keys-truncated",
]);

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function normalizeSafePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.length > 180 ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "..") ||
    !SAFE_PATH_RE.test(normalized)
  ) {
    return null;
  }
  return normalized.replace(/\/{2,}/g, "/");
}

function sanitizeMetadata(value: unknown, maxLength = 100): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength && SAFE_META_RE.test(trimmed) ? trimmed : undefined;
}

function sanitizeOrigin(origin: ImportedRepoOrigin): ImportedRepoOrigin {
  const templateId = sanitizeMetadata(origin.templateId, 100);
  const templateCategory = sanitizeMetadata(origin.templateCategory, 100);
  const archiveSha256 =
    typeof origin.archiveSha256 === "string" && SHA256_RE.test(origin.archiveSha256.toLowerCase())
      ? origin.archiveSha256.toLowerCase()
      : undefined;
  return {
    kind: origin.kind,
    ...(templateId ? { templateId } : {}),
    ...(templateCategory ? { templateCategory } : {}),
    ...(archiveSha256 ? { archiveSha256 } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function canonicalImportedRepoContractJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function hashContractPayload(payload: Omit<ImportedRepoContractV1, "contractHash">): string {
  return createHash("sha256")
    .update(canonicalImportedRepoContractJson(payload), "utf8")
    .digest("hex");
}

function removeJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function parseJsonObject(content: string, allowJsonc = false): Record<string, unknown> | null {
  try {
    const source = allowJsonc ? removeJsonComments(content).replace(/,\s*([}\]])/g, "$1") : content;
    const parsed = JSON.parse(source) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function packageManagerFromField(value: unknown): ImportedRepoPackageManager | null {
  if (typeof value !== "string") return null;
  const name = value.trim().split("@")[0]?.toLowerCase();
  return name === "pnpm" || name === "npm" || name === "yarn" || name === "bun" ? name : null;
}

function lockfileManager(lockfiles: string[]): ImportedRepoPackageManager {
  if (lockfiles.some((path) => /(?:^|\/)pnpm-lock\.ya?ml$/.test(path))) return "pnpm";
  if (lockfiles.some((path) => /(?:^|\/)package-lock\.json$/.test(path))) return "npm";
  if (lockfiles.some((path) => /(?:^|\/)yarn\.lock$/.test(path))) return "yarn";
  if (lockfiles.some((path) => /(?:^|\/)bun\.lockb?$/.test(path))) return "bun";
  return "unknown";
}

function scriptFamily(value: unknown): ImportedRepoScriptFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const families: Array<[RegExp, ImportedRepoScriptFamily]> = [
    [/(?:^|\s)next(?:\s|$)/, "next"],
    [/(?:^|\s)vite(?:\s|$)/, "vite"],
    [/(?:^|\s)astro(?:\s|$)/, "astro"],
    [/(?:^|\s)remix(?:\s|$)/, "remix"],
    [/(?:^|\s)react-scripts(?:\s|$)/, "react-scripts"],
    [/(?:^|\s)nuxt(?:\s|$)/, "nuxt"],
    [/(?:^|\s)svelte-kit(?:\s|$)/, "svelte-kit"],
  ];
  return families.find(([pattern]) => pattern.test(normalized))?.[1] ?? "unknown";
}

function frameworkFromSignals(
  dependencies: Record<string, unknown>,
  paths: Set<string>,
): ImportedRepoFramework {
  if ("next" in dependencies || Array.from(paths).some((path) => /^next\.config\./.test(path))) {
    return "next";
  }
  if ("astro" in dependencies || Array.from(paths).some((path) => /^astro\.config\./.test(path))) {
    return "astro";
  }
  if (
    "@remix-run/react" in dependencies ||
    Array.from(paths).some((path) => /^remix\.config\./.test(path))
  ) {
    return "remix";
  }
  if (
    "@sveltejs/kit" in dependencies ||
    Array.from(paths).some((path) => /^svelte\.config\./.test(path))
  ) {
    return "sveltekit";
  }
  if ("vite" in dependencies || Array.from(paths).some((path) => /^vite\.config\./.test(path))) {
    return "vite";
  }
  return "unknown";
}

function appRoute(path: string): string | null {
  const match = /^(?:src\/)?app\/(.*\/)?page\.[cm]?[jt]sx?$/.exec(path);
  if (!match) return null;
  const segments = (match[1] ?? "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .filter((segment) => !segment.startsWith("@"));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function pagesRoute(path: string): string | null {
  const match = /^(?:src\/)?pages\/(.+)\.[cm]?[jt]sx?$/.exec(path);
  if (!match) return null;
  const relative = match[1];
  if (relative.startsWith("api/") || /^_(?:app|document|error)$/.test(relative)) return null;
  return `/${relative.replace(/\/index$/, "").replace(/^index$/, "")}`.replace(/\/$/, "") || "/";
}

function readAliases(filesByPath: Map<string, CodeFile>): {
  aliases: Array<{ name: string; target: string }>;
  truncated: boolean;
} {
  const collected: Array<[string, string]> = [];
  for (const configPath of ["tsconfig.json", "jsconfig.json"]) {
    const file = filesByPath.get(configPath);
    if (!file) continue;
    const parsed = parseJsonObject(file.content, true);
    const compilerOptions =
      parsed && isRecord(parsed.compilerOptions) ? parsed.compilerOptions : null;
    const paths = compilerOptions && isRecord(compilerOptions.paths) ? compilerOptions.paths : null;
    if (!paths) continue;
    for (const [alias, rawTargets] of Object.entries(paths)) {
      const target = Array.isArray(rawTargets) ? rawTargets[0] : rawTargets;
      const safeTarget = normalizeSafePath(target);
      if (
        SAFE_ALIAS_RE.test(alias) &&
        alias.length <= 80 &&
        safeTarget &&
        safeTarget.length <= 120
      ) {
        collected.push([alias, safeTarget]);
      }
    }
  }
  collected.sort(([a], [b]) => a.localeCompare(b));
  return {
    aliases: collected.slice(0, MAX_ALIASES).map(([name, target]) => ({ name, target })),
    truncated: collected.length > MAX_ALIASES,
  };
}

export function analyzeImportedRepo(
  files: readonly CodeFile[],
  origin: ImportedRepoOrigin,
): ImportedRepoContractV1 {
  const safeFiles = files
    .map((file) => ({ file, path: normalizeSafePath(file.path) }))
    .filter((entry): entry is { file: CodeFile; path: string } => entry.path !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
  const filesByPath = new Map(safeFiles.map(({ file, path }) => [path, file]));
  const paths = new Set(filesByPath.keys());
  const risks = new Set<ImportedRepoRisk>();

  const packagePaths = Array.from(paths)
    .filter((path) => /(?:^|\/)package\.json$/.test(path))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  if (packagePaths.length === 0) risks.add("missing-package-json");
  if (packagePaths.length > 1) risks.add("multiple-package-json");
  const packageJsonPath = packagePaths[0] ?? null;
  const packageJson = packageJsonPath
    ? parseJsonObject(filesByPath.get(packageJsonPath)?.content ?? "")
    : null;
  if (packageJsonPath && !packageJson) risks.add("invalid-package-json");

  const dependencies = {
    ...(packageJson && isRecord(packageJson.dependencies) ? packageJson.dependencies : {}),
    ...(packageJson && isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {}),
  };
  const frameworkVersions: Record<string, string> = {};
  for (const name of FRAMEWORK_PACKAGES.slice(0, MAX_FRAMEWORK_PACKAGES)) {
    const version = dependencies[name];
    if (
      typeof version === "string" &&
      SAFE_PACKAGE_RE.test(name) &&
      version.length <= 60 &&
      SAFE_VERSION_RE.test(version)
    ) {
      frameworkVersions[name] = version;
    }
  }

  const lockfiles = uniqueSorted(
    Array.from(paths).filter((path) =>
      /(?:^|\/)(?:pnpm-lock\.ya?ml|package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(path),
    ),
  ).slice(0, 8);
  const lockManagers = new Set(lockfiles.map((path) => lockfileManager([path])));
  if (lockManagers.size > 1) risks.add("multiple-lockfiles");
  const manager =
    packageManagerFromField(packageJson?.packageManager) ?? lockfileManager(lockfiles);

  const rawScripts = packageJson && isRecord(packageJson.scripts) ? packageJson.scripts : {};
  const scripts: ImportedRepoPackageContract["scripts"] = {};
  for (const name of ["dev", "build", "start"] as const) {
    const family = scriptFamily(rawScripts[name]);
    if (family) scripts[name] = family;
  }
  if (!scripts.dev) risks.add("missing-dev-script");

  const hasApp = Array.from(paths).some((path) => /^(?:src\/)?app\/.+/.test(path));
  const hasPages = Array.from(paths).some((path) => /^(?:src\/)?pages\/.+/.test(path));
  const router: ImportedRepoRouter =
    hasApp && hasPages ? "mixed" : hasApp ? "app" : hasPages ? "pages" : "none";
  if (router === "mixed") risks.add("mixed-router");

  const hasSrcRoot = Array.from(paths).some((path) => path.startsWith("src/"));
  const hasRootSource = Array.from(paths).some((path) =>
    /^(?:app|pages|components|lib)\//.test(path),
  );
  const sourceRoot: ImportedRepoSourceRoot =
    hasSrcRoot && hasRootSource ? "mixed" : hasSrcRoot ? "src" : hasRootSource ? "root" : "unknown";
  if (sourceRoot === "mixed") risks.add("mixed-source-roots");

  const framework = frameworkFromSignals(dependencies, paths);
  if (framework === "unknown") risks.add("unknown-framework");

  const allRoutes = uniqueSorted(
    Array.from(paths).flatMap(
      (path) => [appRoute(path), pagesRoute(path)].filter(Boolean) as string[],
    ),
  );
  if (allRoutes.length > MAX_PATHS) risks.add("routes-truncated");

  const aliasResult = readAliases(filesByPath);
  if (aliasResult.truncated) risks.add("aliases-truncated");

  const envKeys = new Set<string>();
  const envPattern = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g;
  for (const { file, path } of safeFiles) {
    if (/^\.env(?:\..+)?$/.test(path)) {
      for (const line of file.content.split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
        if (match && ENV_KEY_RE.test(match[1])) envKeys.add(match[1]);
      }
    }
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const match of file.content.matchAll(envPattern)) {
      const key = match[1] ?? match[2];
      if (key && ENV_KEY_RE.test(key)) envKeys.add(key);
    }
  }
  const sortedEnvKeys = uniqueSorted(envKeys);
  if (sortedEnvKeys.length > MAX_ENV_KEYS) risks.add("env-keys-truncated");

  const entries = uniqueSorted(Array.from(paths).filter((path) => ENTRY_RE.test(path))).slice(
    0,
    MAX_PATHS,
  );
  const configs = uniqueSorted(
    Array.from(paths).filter((path) => CONFIG_BASENAMES.has(path.split("/").at(-1) ?? "")),
  ).slice(0, MAX_PATHS);
  const styles = uniqueSorted(Array.from(paths).filter((path) => STYLE_RE.test(path))).slice(
    0,
    MAX_PATHS,
  );

  const payload: Omit<ImportedRepoContractV1, "contractHash"> = {
    schemaVersion: IMPORTED_REPO_CONTRACT_SCHEMA_VERSION,
    origin: sanitizeOrigin(origin),
    package: {
      packageJsonPath,
      packageJsonValid: packageJson !== null,
      manager,
      lockfiles,
      scripts,
      frameworkVersions,
    },
    structure: {
      framework,
      router,
      sourceRoot,
      entries,
      configs,
      styles,
      routes: allRoutes.slice(0, MAX_PATHS),
      aliases: aliasResult.aliases,
    },
    envKeys: sortedEnvKeys.slice(0, MAX_ENV_KEYS),
    risks: Array.from(risks)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_RISKS),
  };
  return { ...payload, contractHash: hashContractPayload(payload) };
}

export function buildImportedRepoBaselineSnapshot(params: {
  files: readonly CodeFile[];
  origin: ImportedRepoOrigin;
  versionId: string;
  filesRevision?: string | null;
  capturedAt?: string;
}): ImportedRepoBaselineSnapshot {
  const versionId = params.versionId.trim();
  if (!versionId || versionId.length > 160 || !SAFE_ID_RE.test(versionId)) {
    throw new Error("Invalid imported-repo baseline versionId");
  }
  const filesRevision = params.filesRevision?.trim() || null;
  if (filesRevision && (filesRevision.length > 160 || !SAFE_ID_RE.test(filesRevision))) {
    throw new Error("Invalid imported-repo baseline filesRevision");
  }
  const capturedAt = params.capturedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw new Error("Invalid imported-repo baseline capturedAt");
  }
  return {
    schemaVersion: IMPORTED_REPO_CONTRACT_SCHEMA_VERSION,
    capturedAt,
    versionId,
    filesRevision,
    contract: analyzeImportedRepo(params.files, params.origin),
  };
}

function isEnumValue<T extends string>(values: ReadonlySet<T>, value: unknown): value is T {
  return typeof value === "string" && values.has(value as T);
}

function parseStringArray(
  value: unknown,
  maxItems: number,
  predicate: (item: string) => boolean,
): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    !value.every((item) => typeof item === "string" && predicate(item))
  ) {
    return null;
  }
  return [...value];
}

function isSafeStoredPath(value: string): boolean {
  return normalizeSafePath(value) === value;
}

function isSafeStoredRoute(value: string): boolean {
  return (
    value.length <= 180 &&
    value.startsWith("/") &&
    SAFE_PATH_RE.test(value) &&
    !value.split("/").some((part) => part === "..")
  );
}

function parseStoredOrigin(value: unknown): ImportedRepoOrigin | null {
  if (!isRecord(value) || !isEnumValue(ORIGIN_KINDS, value.kind)) return null;
  const candidate: ImportedRepoOrigin = {
    kind: value.kind,
    ...(typeof value.templateId === "string" ? { templateId: value.templateId } : {}),
    ...(typeof value.templateCategory === "string"
      ? { templateCategory: value.templateCategory }
      : {}),
    ...(typeof value.archiveSha256 === "string" ? { archiveSha256: value.archiveSha256 } : {}),
  };
  const sanitized = sanitizeOrigin(candidate);
  return canonicalImportedRepoContractJson(sanitized) === canonicalImportedRepoContractJson(value)
    ? sanitized
    : null;
}

function parseStoredPackage(value: unknown): ImportedRepoPackageContract | null {
  if (!isRecord(value)) return null;
  const packageJsonPath =
    value.packageJsonPath === null
      ? null
      : typeof value.packageJsonPath === "string" && isSafeStoredPath(value.packageJsonPath)
        ? value.packageJsonPath
        : undefined;
  const lockfiles = parseStringArray(value.lockfiles, 8, isSafeStoredPath);
  if (
    packageJsonPath === undefined ||
    typeof value.packageJsonValid !== "boolean" ||
    !isEnumValue(PACKAGE_MANAGERS, value.manager) ||
    !lockfiles ||
    !isRecord(value.scripts) ||
    !isRecord(value.frameworkVersions)
  ) {
    return null;
  }

  const scripts: ImportedRepoPackageContract["scripts"] = {};
  for (const [name, family] of Object.entries(value.scripts)) {
    if (
      !(["dev", "build", "start"] as string[]).includes(name) ||
      !isEnumValue(SCRIPT_FAMILIES, family)
    ) {
      return null;
    }
    scripts[name as "dev" | "build" | "start"] = family;
  }

  const frameworkVersionEntries = Object.entries(value.frameworkVersions);
  if (
    frameworkVersionEntries.length > MAX_FRAMEWORK_PACKAGES ||
    !frameworkVersionEntries.every(
      ([name, version]) =>
        SAFE_PACKAGE_RE.test(name) &&
        typeof version === "string" &&
        version.length <= 60 &&
        SAFE_VERSION_RE.test(version),
    )
  ) {
    return null;
  }

  return {
    packageJsonPath,
    packageJsonValid: value.packageJsonValid,
    manager: value.manager,
    lockfiles,
    scripts,
    frameworkVersions: Object.fromEntries(frameworkVersionEntries) as Record<string, string>,
  };
}

function parseStoredStructure(value: unknown): ImportedRepoStructureContract | null {
  if (
    !isRecord(value) ||
    !isEnumValue(FRAMEWORKS, value.framework) ||
    !isEnumValue(ROUTERS, value.router) ||
    !isEnumValue(SOURCE_ROOTS, value.sourceRoot)
  ) {
    return null;
  }
  const entries = parseStringArray(value.entries, MAX_PATHS, isSafeStoredPath);
  const configs = parseStringArray(value.configs, MAX_PATHS, isSafeStoredPath);
  const styles = parseStringArray(value.styles, MAX_PATHS, isSafeStoredPath);
  const routes = parseStringArray(value.routes, MAX_PATHS, isSafeStoredRoute);
  if (!entries || !configs || !styles || !routes || !Array.isArray(value.aliases)) return null;
  if (value.aliases.length > MAX_ALIASES) return null;

  const aliases: Array<{ name: string; target: string }> = [];
  for (const alias of value.aliases) {
    if (
      !isRecord(alias) ||
      Object.keys(alias).some((key) => key !== "name" && key !== "target") ||
      typeof alias.name !== "string" ||
      alias.name.length > 80 ||
      !SAFE_ALIAS_RE.test(alias.name) ||
      typeof alias.target !== "string" ||
      alias.target.length > 120 ||
      !isSafeStoredPath(alias.target)
    ) {
      return null;
    }
    aliases.push({ name: alias.name, target: alias.target });
  }

  return {
    framework: value.framework,
    router: value.router,
    sourceRoot: value.sourceRoot,
    entries,
    configs,
    styles,
    routes,
    aliases,
  };
}

function parseStoredContract(value: unknown): ImportedRepoContractV1 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== IMPORTED_REPO_CONTRACT_SCHEMA_VERSION ||
    typeof value.contractHash !== "string" ||
    !SHA256_RE.test(value.contractHash)
  ) {
    return null;
  }
  const origin = parseStoredOrigin(value.origin);
  const packageContract = parseStoredPackage(value.package);
  const structure = parseStoredStructure(value.structure);
  const envKeys = parseStringArray(value.envKeys, MAX_ENV_KEYS, (key) => ENV_KEY_RE.test(key));
  if (
    !origin ||
    !packageContract ||
    !structure ||
    !envKeys ||
    !Array.isArray(value.risks) ||
    value.risks.length > MAX_RISKS ||
    !value.risks.every((risk) => isEnumValue(RISKS, risk))
  ) {
    return null;
  }
  const payload: Omit<ImportedRepoContractV1, "contractHash"> = {
    schemaVersion: IMPORTED_REPO_CONTRACT_SCHEMA_VERSION,
    origin,
    package: packageContract,
    structure,
    envKeys,
    risks: [...value.risks],
  };
  return hashContractPayload(payload) === value.contractHash
    ? { ...payload, contractHash: value.contractHash }
    : null;
}

export function readImportedRepoBaselineSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): ImportedRepoBaselineSnapshot | null {
  const value = snapshot?.[IMPORTED_REPO_BASELINE_SNAPSHOT_KEY];
  if (!isRecord(value) || value.schemaVersion !== IMPORTED_REPO_CONTRACT_SCHEMA_VERSION)
    return null;
  const contract = parseStoredContract(value.contract);
  if (
    typeof value.capturedAt !== "string" ||
    value.capturedAt.length > 80 ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    typeof value.versionId !== "string" ||
    !SAFE_ID_RE.test(value.versionId) ||
    value.versionId.length > 160 ||
    (value.filesRevision !== null &&
      (typeof value.filesRevision !== "string" ||
        !SAFE_ID_RE.test(value.filesRevision) ||
        value.filesRevision.length > 160)) ||
    !contract
  ) {
    return null;
  }
  return {
    schemaVersion: IMPORTED_REPO_CONTRACT_SCHEMA_VERSION,
    capturedAt: value.capturedAt,
    versionId: value.versionId,
    filesRevision: value.filesRevision,
    contract,
  };
}

export function buildImportedRepoContractContext(
  files: readonly CodeFile[],
  snapshot: Record<string, unknown> | null | undefined,
): ImportedRepoContractContext {
  const baseline = readImportedRepoBaselineSnapshot(snapshot);
  const projectOrigin = snapshot?.projectOrigin;
  const origin = baseline?.contract.origin ?? {
    kind: isEnumValue(ORIGIN_KINDS, projectOrigin) ? projectOrigin : "unknown",
  };
  return {
    baseline,
    current: analyzeImportedRepo(files, origin),
  };
}
