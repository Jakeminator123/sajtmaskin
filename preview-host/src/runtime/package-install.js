"use strict";

// Beroendeinstallation per session: installkommandon per pakethanterare,
// stale-lockfile-protokollet, dependency-fingerprint och install-postcondition.
// Ren extraktion ur runtime.js — ingen beteendeändring.

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const {
  appendRuntimeLog,
  clipVerifyOutput,
  dependencyStatePathForWorkspace,
  ensurePackageCacheDirs,
  readJsonIfExists,
  runInInstallSlot,
  runShellCommand,
  sanitizedEnv,
} = require("./shared.js");
// Ingen cykel: storage-cleanup kräver bara shared + prewarm-leases vid load
// (dess enda beroende åt detta håll är en lazy require av process-lifecycle).
const { cleanupPackageCachesUnqueued } = require("./storage-cleanup.js");

// Hård tidsgräns per install-försök (M#fly1-härdning): med den globala
// install-kön får ett enda hängt `npm install` (t.ex. ett genererat
// preinstall-script som aldrig avslutas) INTE kila fast alla senare
// boots/verifies — utan timeout vore enda utvägen VM-omstart. 0 = av.
const INSTALL_TIMEOUT_MS = parseInt(
  process.env.PREVIEW_HOST_INSTALL_TIMEOUT_MS ?? `${10 * 60 * 1000}`,
  10,
);

// Stale-lockfile protocol (prod incident 2026-07-31, chat 0d52e5c9 → radix-ui):
// när Normalize/dep-completer muterar `package.json` medan en låsfil finns kvar
// blir låsfilen inaktuell. Ett `pnpm install --frozen-lockfile` mot warm
// node_modules kan då svara "Already up to date" (exit 0) UTAN att installera
// det nya beroendet, och den nya fingerprinten skrivs ändå → runtime 500:ar för
// evigt på Next Build Error-overlayn. Appen markerar därför en muterad låsfil
// som inaktuell via denna sentinel i projektfilerna; host:en kör då EN
// icke-frozen install (som får uppdatera låsfilen) och skickar den regenererade
// låsfilen tillbaka så appen kan persistera den i `engine_versions.files_json`.
// Detta är INTE "radera låsfilen som generell fix" — låsfilen behålls och
// regenereras, bara frozen-läget hoppas över för exakt denna install.
const LOCKFILE_STALE_MARKER_PATH = ".sajtmaskin/lockfile-stale.json";

const PACKAGE_MANAGER_LOCKFILES = {
  pnpm: ["pnpm-lock.yaml", "pnpm-lock.yml"],
  yarn: ["yarn.lock"],
  npm: ["package-lock.json"],
};

const PACKAGE_MANAGER_LIST_COMMAND = {
  pnpm: "pnpm ls --depth 0 --json",
  yarn: "yarn list --depth=0 --json",
  npm: "npm ls --depth=0 --json",
};

function detectPackageManager(filesJson) {
  if (
    typeof filesJson?.["pnpm-lock.yaml"] === "string" ||
    typeof filesJson?.["pnpm-lock.yml"] === "string"
  ) {
    return "pnpm";
  }
  if (typeof filesJson?.["yarn.lock"] === "string") return "yarn";
  return "npm";
}

function readStaleLockfileMarker(filesJson) {
  const raw = filesJson?.[LOCKFILE_STALE_MARKER_PATH];
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const packageManager =
      parsed.packageManager === "pnpm" ||
      parsed.packageManager === "yarn" ||
      parsed.packageManager === "npm"
        ? parsed.packageManager
        : null;
    return {
      reason: typeof parsed.reason === "string" ? parsed.reason : "lockfile marked stale",
      packageManager,
      mutatedAt: typeof parsed.mutatedAt === "string" ? parsed.mutatedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Read the regenerated lockfile from the workspace for a package manager,
 * preferring the primary lockfile name. Returns `{ path, content }` or null.
 */
function readRegeneratedLockfile(workspaceDir, packageManager) {
  const names = PACKAGE_MANAGER_LOCKFILES[packageManager] ?? [];
  for (const name of names) {
    try {
      const content = fs.readFileSync(path.join(workspaceDir, name), "utf8");
      if (typeof content === "string" && content.length > 0) {
        return { path: name, content };
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

/**
 * Direct dependency graph declared in package.json — `dependencies` +
 * `devDependencies`. `optionalDependencies` and `peerDependencies` are skipped
 * on purpose (they may legitimately be absent from the installed graph). Used
 * by the install postcondition so a package-manager "exit 0" that installed
 * NOTHING (stale-lockfile "Already up to date") still fails closed.
 */
function requiredDirectDependencies(filesJson) {
  const raw = filesJson?.["package.json"];
  if (typeof raw !== "string") return [];
  try {
    const pkg = JSON.parse(raw);
    if (!pkg || typeof pkg !== "object") return [];
    const names = new Set();
    for (const bucket of ["dependencies", "devDependencies"]) {
      const map = pkg[bucket];
      if (map && typeof map === "object" && !Array.isArray(map)) {
        for (const [name, version] of Object.entries(map)) {
          // Skip workspace:/link:/file: specifiers — those resolve to local
          // paths the `ls` view lists inconsistently across managers.
          if (typeof version === "string" && /^(workspace|link|file):/.test(version)) {
            continue;
          }
          if (name.trim()) names.add(name.trim());
        }
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

/**
 * Parse the direct dependency NAMES the package manager reports as installed
 * from its `ls`/`list --json` output. Best-effort across pnpm/npm/yarn — the
 * shapes differ. Returns a Set, or null when the output was unparseable (the
 * caller then falls back to a filesystem probe rather than false-failing).
 */
function collectInstalledDirectDepNames(rawOutput, packageManager) {
  const output = String(rawOutput || "").trim();
  if (!output) return null;
  const names = new Set();
  const addFromDepMap = (map) => {
    if (map && typeof map === "object" && !Array.isArray(map)) {
      for (const key of Object.keys(map)) names.add(key);
    }
  };
  // yarn classic emits newline-delimited JSON (`{type:"tree",...}`); npm/pnpm
  // emit a single JSON document. Try whole-document first, then line-by-line.
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };
  const ingest = (parsed) => {
    if (!parsed) return;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) ingest(entry);
      return;
    }
    if (typeof parsed !== "object") return;
    addFromDepMap(parsed.dependencies);
    addFromDepMap(parsed.devDependencies);
    // yarn classic tree: { type:"tree", data:{ trees:[{ name:"pkg@1.2.3" }] } }
    if (parsed.type === "tree" && parsed.data && Array.isArray(parsed.data.trees)) {
      for (const tree of parsed.data.trees) {
        const label = typeof tree?.name === "string" ? tree.name : "";
        if (!label) continue;
        const at = label.lastIndexOf("@");
        const name = at > 0 ? label.slice(0, at) : label;
        if (name) names.add(name);
      }
    }
  };
  const whole = tryParse(output);
  if (whole !== undefined) {
    ingest(whole);
  } else {
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
      const parsed = tryParse(trimmed);
      if (parsed !== undefined) ingest(parsed);
    }
  }
  void packageManager;
  return names.size > 0 ? names : null;
}

/**
 * Install postcondition (prod incident 2026-07-31): after `install` exits 0,
 * confirm the declared direct dependency graph is actually present. Prefers the
 * package manager's OWN view (`pnpm ls`/`npm ls`/`yarn list --json`); only when
 * that output is unparseable does it fall back to a `node_modules/<pkg>`
 * probe — never as the sole signal (ESM/exports/optional make existsSync
 * unreliable). Fails closed if a required direct dep is missing.
 */
async function verifyInstalledDependencies(workspaceDir, filesJson, options = {}) {
  const required = requiredDirectDependencies(filesJson);
  if (required.length === 0) {
    return { ok: true, missing: [], checkedWith: "none", required };
  }
  const packageManager = options.packageManager || detectPackageManager(filesJson);
  const commandRunner =
    typeof options.commandRunner === "function" ? options.commandRunner : runShellCommand;
  const listCommand = PACKAGE_MANAGER_LIST_COMMAND[packageManager];
  let installedNames = null;
  try {
    const result = await commandRunner(listCommand, {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv({ NODE_ENV: "development" }),
      timeoutMs: 60_000,
      timeoutLabel: `Dependency postcondition (${listCommand})`,
    });
    installedNames = collectInstalledDirectDepNames(result.output, packageManager);
  } catch {
    installedNames = null;
  }
  if (installedNames) {
    const missing = required.filter((name) => !installedNames.has(name));
    return { ok: missing.length === 0, missing, checkedWith: `${packageManager}-ls`, required };
  }
  // PM view unusable → filesystem fallback (secondary signal only).
  const missing = required.filter(
    (name) => !fs.existsSync(path.join(workspaceDir, "node_modules", ...name.split("/"))),
  );
  return { ok: missing.length === 0, missing, checkedWith: "node_modules-fallback", required };
}

function resolveInstallCommand(filesJson) {
  const packageManager = detectPackageManager(filesJson);
  const lockfileStale = readStaleLockfileMarker(filesJson) !== null;
  const hasPnpmLock =
    typeof filesJson?.["pnpm-lock.yaml"] === "string" ||
    typeof filesJson?.["pnpm-lock.yml"] === "string";
  if (hasPnpmLock) {
    // NOTE: do NOT pass --no-optional. Prebuilt native binaries (napi-rs
    // packages like @tailwindcss/oxide, plus esbuild/sharp) ship as
    // optionalDependencies; skipping them leaves Tailwind v4 without its
    // musl `.node` on the Alpine VM and the dev server crash-loops on boot.
    //
    // Stale lockfile → run WITHOUT --frozen-lockfile as the primary command so
    // the newly-pinned dependency is actually installed and the lockfile is
    // regenerated (frozen would say "Already up to date" and install nothing).
    if (lockfileStale) {
      return {
        command: "pnpm install --no-frozen-lockfile --prod=false",
        successLabel: "pnpm install passed.",
        logLabel: "pnpm install --no-frozen-lockfile --prod=false (stale lockfile)",
        fallbackCommand: "pnpm install --no-frozen-lockfile --prod=false",
        fallbackLogLabel: "pnpm install --no-frozen-lockfile --prod=false",
        alwaysAllowFallback: true,
        packageManager,
        lockfileStale,
      };
    }
    return {
      command: "pnpm install --frozen-lockfile --prod=false",
      successLabel: "pnpm install passed.",
      logLabel: "pnpm install --frozen-lockfile --prod=false",
      fallbackCommand: "pnpm install --no-frozen-lockfile --prod=false",
      fallbackLogLabel: "pnpm install --no-frozen-lockfile --prod=false",
      alwaysAllowFallback: true,
      packageManager,
      lockfileStale,
    };
  }
  const hasYarnLock = typeof filesJson?.["yarn.lock"] === "string";
  if (hasYarnLock) {
    // Keep optional deps for the same native-binary reason as pnpm above.
    // Do not pass Yarn Classic's `--production=false`: Yarn Berry/4 rejects
    // that flag. The install runner forces NODE_ENV=development instead,
    // which keeps devDependencies for Classic while Berry installs them by
    // default. Stale lockfile → drop --frozen-lockfile so yarn may update it.
    return {
      command: lockfileStale ? "yarn install" : "yarn install --frozen-lockfile",
      successLabel: "yarn install passed.",
      logLabel: lockfileStale ? "yarn install (stale lockfile)" : "yarn install --frozen-lockfile",
      fallbackCommand: "yarn install",
      fallbackLogLabel: "yarn install",
      alwaysAllowFallback: true,
      packageManager,
      lockfileStale,
    };
  }
  const hasPackageLock = typeof filesJson?.["package-lock.json"] === "string";
  if (hasPackageLock) {
    // Stale lockfile → `npm install` (not `npm ci`): ci fails outright when the
    // lockfile disagrees with package.json, and even when it does not, it never
    // updates the lockfile. `npm install` reconciles and regenerates it.
    if (lockfileStale) {
      return {
        command: "npm install --no-audit --include=dev",
        successLabel: "npm install passed.",
        logLabel: "npm install --no-audit --include=dev (stale lockfile)",
        fallbackCommand: "npm install --no-audit --include=dev --legacy-peer-deps",
        fallbackLogLabel: "npm install --no-audit --include=dev --legacy-peer-deps",
        alwaysAllowFallback: true,
        packageManager,
        lockfileStale,
      };
    }
    return {
      command: "npm ci --no-audit --include=dev",
      successLabel: "npm ci passed.",
      logLabel: "npm ci --no-audit --include=dev",
      fallbackCommand: "npm ci --no-audit --include=dev --legacy-peer-deps",
      fallbackLogLabel: "npm ci --no-audit --include=dev --legacy-peer-deps",
      packageManager,
      lockfileStale,
    };
  }
  return {
    command: "npm install --no-audit --include=dev",
    successLabel: "npm install passed.",
    logLabel: "npm install --no-audit --include=dev",
    fallbackCommand: "npm install --no-audit --include=dev --legacy-peer-deps",
    fallbackLogLabel: "npm install --no-audit --include=dev --legacy-peer-deps",
    packageManager,
    lockfileStale,
  };
}

function isNoSpaceInstallFailure(output) {
  const text = String(output || "");
  if (!text.trim()) return false;
  return /ENOSPC|no space left on device|insufficient space/i.test(text);
}

/**
 * Rotorsak för ett misslyckat install, i en form som överlever vägen till
 * appens `engine_version_error_logs`.
 *
 * Bakgrund (`SM-035`, signatur `a0bc26af7689`: 17 träffar / 4 chattar): den
 * fulla utskriften skrivs till preview-hostens egen runtime-logg, men felet som
 * KASTAS — och som är det enda appen ser — bar bara «exit code 254». npm
 * använder 254 som generisk krasch, så error-loggen kunde inte skilja slut på
 * disk från nätverksfel från en dödad barnprocess. Utan den skillnaden går
 * incidenten inte att utreda i efterhand, och det är därför den här raden
 * fanns kvar öppen i backloggen i en vecka.
 *
 * `no_output` är ingen restpost utan ett eget svar: kraschade barnprocessen
 * innan den hann skriva något är just det diagnosen.
 */
function classifyInstallFailure(output, exitCode) {
  const text = String(output || "");

  // Ordningen är inte godtycklig. Ett mönster som fångas för tidigt döljer det
  // riktiga svaret, och en klassificerare som pekar fel är sämre än ingen alls
  // — den skickar felsökningen åt fel håll med falskt självförtroende.

  // Först: hostens EGEN timeout. `runShellCommand` avslutar med exit 124 och
  // skriver «timed out after Ns and was killed». Ordet «killed» där skulle
  // annars göra varje hängd install till en OOM.
  if (exitCode === 124 || /\btimed out after \d+s and was killed\b/i.test(text)) {
    return "timeout";
  }

  if (isNoSpaceInstallFailure(text)) return "no_space";

  // Före `network`: npm:s 404-utskrift innehåller registry-URL:en i GET-raden,
  // så ett saknat paket skulle annars rapporteras som nätverksfel.
  if (/\bETARGET\b|\bE404\b|No matching version|is not in this registry/i.test(text)) {
    return "missing_package";
  }

  if (isPeerDependencyInstallFailure(text)) return "peer_conflict";

  // Bara otvetydiga OOM-markörer. Bart «Killed» är för brett — se timeouten ovan.
  if (/heap out of memory|out of memory|oom-kill|Killed process/i.test(text)) {
    return "out_of_memory";
  }

  if (/ETIMEDOUT|ENOTFOUND|ECONNRESET|EAI_AGAIN|ERR_SOCKET|npm error network/i.test(text)) {
    return "network";
  }

  if (/EACCES|EPERM|permission denied/i.test(text)) return "permissions";

  // Ingen restpost: kraschade barnprocessen innan den hann skriva något är
  // just det diagnosen, och det är det observerade 254-fallet.
  if (!text.trim()) return "no_output";

  return exitCode === 254 ? "unknown_npm_crash" : "unknown";
}

function formatByteCount(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function isPeerDependencyInstallFailure(output) {
  const text = String(output || "");
  if (!text.trim()) return false;
  return (
    /ERESOLVE/i.test(text) ||
    /unable to resolve dependency tree/i.test(text) ||
    /peer dependency/i.test(text) ||
    /Conflicting peer dependency/i.test(text)
  );
}

async function runInstallCommandWithFallback(workspaceDir, install) {
  // Serialisera ALLA installs (live-boot + verify) genom en global kö så att
  // två tunga `npm install` aldrig slåss om VM:ns RAM samtidigt (OOM-mönstret
  // i Fly-loggarna 2026-07-02). Kön håller inga andra lås medan den väntar,
  // så den kan inte deadlocka mot verifyQueue (som bara väntar på den härifrån).
  return runInInstallSlot(() =>
    runInstallCommandWithFallbackUnqueued(workspaceDir, install),
  );
}

async function runInstallCommandWithFallbackUnqueued(workspaceDir, install) {
  ensurePackageCacheDirs();
  // Generated projects keep TypeScript/ESLint in devDependencies. Force every
  // package manager to include them even when the host itself runs with
  // NODE_ENV=production; ReleaseGate must never depend on ambient host mode.
  const env = sanitizedEnv({
    NODE_ENV: "development",
    NPM_CONFIG_PRODUCTION: "false",
    NPM_CONFIG_OMIT: "",
  });
  const runAttempt = async (command) => {
    const startedAt = Date.now();
    const result = await runShellCommand(command, {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      // Fail-fast: en hängd install får inte blockera den globala install-kön
      // (alla senare boots/verifies) tills VM-omstart.
      timeoutMs: INSTALL_TIMEOUT_MS > 0 ? INSTALL_TIMEOUT_MS : undefined,
      timeoutLabel: `Install (${command})`,
    });
    return {
      ...result,
      durationMs: Date.now() - startedAt,
      clippedOutput: clipVerifyOutput("install", result.output),
    };
  };

  let primary = await runAttempt(install.command);
  if (primary.exitCode === 0) {
    return {
      passed: true,
      exitCode: 0,
      durationMs: primary.durationMs,
      output: install.successLabel,
      usedFallback: false,
      peerConflictDetected: false,
    };
  }

  // A disk-full install is not a project error and retrying the same command
  // unchanged just reproduces it. Reclaim the package cache — the one thing on
  // this host that grows without bound — and try once more. Without this the
  // VM stays wedged for every chat until someone redeploys it by hand.
  if (isNoSpaceInstallFailure(primary.output)) {
    // Unqueued: we are inside the install slot already (see the doc comment on
    // `cleanupPackageCachesUnqueued`).
    const purge = await cleanupPackageCachesUnqueued({ force: true });
    const retryStartedAt = Date.now();
    const retried = await runAttempt(install.command);
    if (retried.exitCode === 0) {
      return {
        passed: true,
        exitCode: 0,
        durationMs: primary.durationMs + (Date.now() - retryStartedAt),
        output: [
          install.successLabel,
          `[quality-warning] Disk was full; reclaimed ${formatByteCount(purge.cacheBytesBefore)} of package cache and reinstalled.`,
        ].join("\n"),
        usedFallback: false,
        peerConflictDetected: false,
      };
    }
    primary = {
      ...retried,
      durationMs: primary.durationMs + retried.durationMs,
      clippedOutput: [
        `[disk-full] Reclaimed ${formatByteCount(purge.cacheBytesBefore)} of package cache and retried; still out of space.`,
        `The preview VM's filesystem is full. Free space on the host (see GET /admin/storage) — this is not a fault in the generated project.`,
        "",
        retried.clippedOutput || "",
      ].join("\n"),
    };
  }

  const peerConflictDetected = isPeerDependencyInstallFailure(primary.output);
  if ((peerConflictDetected || install.alwaysAllowFallback) && install.fallbackCommand) {
    const fallback = await runAttempt(install.fallbackCommand);
    if (fallback.exitCode === 0) {
      const warning =
        peerConflictDetected
          ? `[quality-warning] Peer dependency conflict detected. Compatibility fallback used: ${install.fallbackLogLabel}.`
          : `[quality-warning] Primary install failed. Compatibility fallback used: ${install.fallbackLogLabel}.`;
      return {
        passed: true,
        exitCode: 0,
        durationMs: primary.durationMs + fallback.durationMs,
        output: [
          install.successLabel,
          warning,
        ].join("\n"),
        usedFallback: true,
        peerConflictDetected,
      };
    }

    return {
      passed: false,
      exitCode: fallback.exitCode,
      durationMs: primary.durationMs + fallback.durationMs,
      output: [
        `[primary] ${install.logLabel} failed:`,
        primary.clippedOutput || `(No install output captured; exit ${primary.exitCode}).`,
        "",
        `[fallback] ${install.fallbackLogLabel} failed:`,
        fallback.clippedOutput || `(No install output captured; exit ${fallback.exitCode}).`,
      ].join("\n"),
      usedFallback: true,
      peerConflictDetected,
    };
  }

  return {
    passed: false,
    exitCode: primary.exitCode,
    durationMs: primary.durationMs,
    output:
      primary.clippedOutput ||
      `(No install output captured; exit ${primary.exitCode}).`,
    usedFallback: false,
    peerConflictDetected,
  };
}

function trimSnippet(input) {
  if (input.length <= 4000) return input;
  return input.slice(input.length - 4000);
}

// Bump when the install COMMAND policy changes (not just the deps). The
// fingerprint is mixed with this token so a policy change invalidates every
// prior `.preview-host-deps.json` on the persistent /data volume and forces a
// one-time reinstall. Without it, a workspace whose deps were installed under
// the old `--no-optional`/`--ignore-optional` policy (missing native binaries)
// would keep matching its cached fingerprint on reuse (e.g. a follow-up edit on
// an imported template) and skip the corrective reinstall — leaving Tailwind v4
// crash-looping. (Codex P2 on PR #454.)
const DEPENDENCY_INSTALL_POLICY = "2026-07-13-dev-deps-local-toolchain";

function dependencyFingerprint(filesJson) {
  const hash = createHash("sha256");
  hash.update("policy:");
  hash.update(DEPENDENCY_INSTALL_POLICY);
  hash.update("\n");
  for (const key of ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-lock.yml", "yarn.lock"]) {
    if (typeof filesJson[key] === "string") {
      hash.update(key);
      hash.update("\n");
      hash.update(filesJson[key]);
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

function readDependencyFingerprintForWorkspace(workspaceDir) {
  const state = readJsonIfExists(dependencyStatePathForWorkspace(workspaceDir));
  if (!state || typeof state !== "object") return null;
  const fingerprint =
    typeof state.fingerprint === "string" && state.fingerprint.trim().length > 0
      ? state.fingerprint.trim()
      : null;
  return fingerprint;
}

function tryShareNodeModules(params) {
  const {
    sourceWorkspaceDir,
    targetWorkspaceDir,
    expectedFingerprint,
  } = params;
  if (!expectedFingerprint) {
    return { reused: false, reason: "missing_fingerprint" };
  }
  const sourceFingerprint = readDependencyFingerprintForWorkspace(sourceWorkspaceDir);
  if (!sourceFingerprint || sourceFingerprint !== expectedFingerprint) {
    return { reused: false, reason: "fingerprint_mismatch" };
  }

  const sourceNodeModules = path.join(sourceWorkspaceDir, "node_modules");
  const targetNodeModules = path.join(targetWorkspaceDir, "node_modules");
  if (!fs.existsSync(sourceNodeModules)) {
    return { reused: false, reason: "source_node_modules_missing" };
  }

  fs.rmSync(targetNodeModules, { recursive: true, force: true });

  try {
    // Verify workspaces must never point at the live workspace. A subsequent
    // tool invocation may write caches or metadata under node_modules; a
    // symlink would mutate the running site's dependency tree.
    fs.cpSync(sourceNodeModules, targetNodeModules, { recursive: true });
    return { reused: true, method: "copy" };
  } catch (error) {
    return {
      reused: false,
      reason: `share_failed:${error instanceof Error ? error.message : "unknown"}`,
    };
  }
}

// Injectable runners for the LIVE-boot install path (`runInstallCommand`), so
// the guard tests can drive the stale-lockfile / postcondition / fingerprint
// flow without a real package manager. Production uses the real runners.
let bootInstallRunner = runInstallCommandWithFallback;
let bootPostconditionRunner = null;

async function runInstallCommand(workspaceDir, previewSessionId, filesJson) {
  const fingerprint = dependencyFingerprint(filesJson);
  const install = resolveInstallCommand(filesJson);
  const nodeModulesDir = path.join(workspaceDir, "node_modules");
  const priorDeps = readJsonIfExists(dependencyStatePathForWorkspace(workspaceDir));
  // Stale-lockfile marker forces the reconcile even on a fingerprint match
  // (Bugbot finding 2): a prior boot may have stamped this exact fingerprint
  // BEFORE the lockfile was marked stale (e.g. warm node_modules + a
  // just-pinned dep), so a plain fingerprint-equality skip would ignore the
  // marker forever and never run the one non-frozen install. When the marker is
  // present we always fall through to the (non-frozen) install + postcondition;
  // `runInstallCommand` clears the marker on success by returning the
  // regenerated lockfile for persistence.
  if (
    fingerprint &&
    priorDeps &&
    priorDeps.fingerprint === fingerprint &&
    fs.existsSync(nodeModulesDir) &&
    !install.lockfileStale
  ) {
    await appendRuntimeLog(
      previewSessionId,
      `Skipping npm install; dependency fingerprint unchanged (${fingerprint.slice(0, 12)}).`,
    );
    return { installed: false, skipped: true };
  }
  if (install.lockfileStale && fingerprint && priorDeps?.fingerprint === fingerprint) {
    await appendRuntimeLog(
      previewSessionId,
      `Dependency fingerprint unchanged (${fingerprint.slice(0, 12)}) but a stale-lockfile marker is present; forcing a non-frozen reconcile with ${install.logLabel} instead of skipping.`,
    );
  }
  const priorFingerprint =
    priorDeps && typeof priorDeps.fingerprint === "string"
      ? priorDeps.fingerprint.slice(0, 12)
      : "none";
  await appendRuntimeLog(
    previewSessionId,
    `Dependency fingerprint changed (prior=${priorFingerprint}, next=${fingerprint.slice(0, 12)}); installing with ${install.logLabel}.`,
  );
  const installResult = await bootInstallRunner(workspaceDir, install);
  if (installResult.passed) {
    // Postcondition BEFORE stamping the fingerprint: a package manager can exit
    // 0 while installing nothing (stale-lockfile "Already up to date"). Confirm
    // the declared direct dependency graph is actually present; only then write
    // the fingerprint, so a failed postcondition leaves the state untouched and
    // the next boot re-runs install instead of skipping on a false "installed".
    const postcondition = await verifyInstalledDependencies(workspaceDir, filesJson, {
      packageManager: install.packageManager,
      commandRunner: bootPostconditionRunner ?? undefined,
    });
    if (!postcondition.ok) {
      await appendRuntimeLog(
        previewSessionId,
        `${install.logLabel} exited 0 but the dependency postcondition failed (checked via ${postcondition.checkedWith}): missing ${postcondition.missing.join(", ")}. Not stamping dependency fingerprint so the next boot re-runs install.`,
      );
      throw new Error(
        `Dependency postcondition failed after install: missing ${postcondition.missing.join(", ")} (checked via ${postcondition.checkedWith}).`,
      );
    }
    fs.writeFileSync(
      dependencyStatePathForWorkspace(workspaceDir),
      JSON.stringify({ fingerprint }, null, 2),
      "utf8",
    );
    if (installResult.usedFallback) {
      const fallbackReason = installResult.peerConflictDetected
        ? "encountered peer dependency conflicts"
        : "primary install failed";
      await appendRuntimeLog(
        previewSessionId,
        `${install.logLabel} ${fallbackReason}; fallback ${install.fallbackLogLabel} succeeded.`,
      );
      await appendRuntimeLog(
        previewSessionId,
        trimSnippet(installResult.output || install.successLabel),
      );
    } else {
      await appendRuntimeLog(previewSessionId, `${install.logLabel} completed.`);
    }
    // Stale lockfile was reconciled by the non-frozen install above: read the
    // regenerated lockfile so the caller can persist it back into the version
    // files and clear the stale marker (closing the loop — never "delete the
    // lockfile forever").
    if (install.lockfileStale) {
      const regeneratedLockfile = readRegeneratedLockfile(workspaceDir, install.packageManager);
      if (regeneratedLockfile) {
        await appendRuntimeLog(
          previewSessionId,
          `Regenerated ${regeneratedLockfile.path} after non-frozen install; returning it for persistence and clearing the stale marker.`,
        );
        return { installed: true, packageManager: install.packageManager, regeneratedLockfile, staleCleared: true };
      }
    }
    return { installed: true, packageManager: install.packageManager };
  }

  const failureReason = classifyInstallFailure(installResult.output, installResult.exitCode);
  await appendRuntimeLog(
    previewSessionId,
    `${install.logLabel} failed (${failureReason}).\n${trimSnippet(installResult.output || "")}`,
  );
  // Rotorsaken måste sitta i det KASTADE felet, inte bara i runtime-loggen —
  // det är felmeddelandet som når appens error-log. Se `classifyInstallFailure`.
  throw new Error(
    `${install.logLabel} failed with exit code ${installResult.exitCode ?? "unknown"} (${failureReason})`,
  );
}

function setBootInstallRunnersForTesting(params = {}) {
  bootInstallRunner =
    typeof params.installRunner === "function"
      ? params.installRunner
      : runInstallCommandWithFallback;
  bootPostconditionRunner =
    typeof params.postconditionCommandRunner === "function"
      ? params.postconditionCommandRunner
      : null;
}

module.exports = {
  LOCKFILE_STALE_MARKER_PATH,
  DEPENDENCY_INSTALL_POLICY,
  detectPackageManager,
  readStaleLockfileMarker,
  readRegeneratedLockfile,
  requiredDirectDependencies,
  collectInstalledDirectDepNames,
  verifyInstalledDependencies,
  resolveInstallCommand,
  isNoSpaceInstallFailure,
  classifyInstallFailure,
  runInstallCommandWithFallback,
  dependencyFingerprint,
  tryShareNodeModules,
  runInstallCommand,
  setBootInstallRunnersForTesting,
};
