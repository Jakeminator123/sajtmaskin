/**
 * Static npm-ERESOLVE detector for imported / exported package.json trees.
 *
 * Verbatim import keeps the template's own versions. Preview-host may still
 * start after `--legacy-peer-deps` (display bypass). Vercel `npm install`
 * does not. This module detects the tree that npm would refuse, without
 * rewriting it.
 *
 * Resolution policy (incident B, 2026-09-18): detect + block publish.
 * Do not pin React, bump Next, or apply `--force` here. Repair options are
 * listed so a human can choose a coherent tree.
 */

import { intersects, minVersion, satisfies, subset, valid, validRange } from "semver";

export const INSTALL_PEER_FALLBACK_CHECK = "install-peer-fallback" as const;

/**
 * Incident fixture: imported v0 template `my-v0-project` / `ONoAgsMmNOt`,
 * same tree in v1 and v2. Lock tests against this exact `package.json`.
 */
export const INCIDENT_V0_PACKAGE_JSON = {
  name: "my-v0-project",
  dependencies: {
    next: "14.2.25",
    react: "^19",
    "react-dom": "^19",
  },
  devDependencies: {
    "@types/react": "^18",
    "@types/react-dom": "^18",
  },
} as const;

export type PackageTreePeerMap = {
  next?: string;
  react?: string;
  reactDom?: string;
  typesReact?: string;
  typesReactDom?: string;
};

export type PackageTreeConflictCode = "next_react_peer_eresolve";

export type PackageTreeConflict = {
  code: PackageTreeConflictCode;
  nextRange: string;
  reactRange: string;
  nextMajor: number;
  reactMajor: number;
  peers: PackageTreePeerMap;
  message: string;
  /** Coherent options a human can apply. Never auto-applied. */
  repairOptions: string[];
};

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePackageJsonRecord(raw: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Representative minimum for diagnostics only; never treat it as a resolved version. */
export function extractDependencyMajor(range: string): number | null {
  const parsed = validRange(range);
  return parsed ? (minVersion(parsed)?.major ?? null) : null;
}

export function collectDeclaredDependencyRanges(
  pkg: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of DEP_FIELDS) {
    const bucket = asRecord(pkg[field]);
    if (!bucket) continue;
    for (const [name, range] of Object.entries(bucket)) {
      if (typeof range === "string" && range.trim() && out[name] === undefined) {
        out[name] = range.trim();
      }
    }
  }
  return out;
}

function peerMapFromRanges(deps: Record<string, string>): PackageTreePeerMap {
  return {
    ...(deps.next ? { next: deps.next } : {}),
    ...(deps.react ? { react: deps.react } : {}),
    ...(deps["react-dom"] ? { reactDom: deps["react-dom"] } : {}),
    ...(deps["@types/react"] ? { typesReact: deps["@types/react"] } : {}),
    ...(deps["@types/react-dom"] ? { typesReactDom: deps["@types/react-dom"] } : {}),
  };
}

function nextReactEresolve(
  nextRange: string,
  reactRange: string,
): { nextMajor: number; reactMajor: number; reactPeer: string } | null {
  if (!validRange(nextRange) || !validRange(reactRange)) return null;
  // Only claim a conflict when EVERY admitted Next version belongs to the
  // known 13/14 peer contracts and NO admitted React version meets their union.
  // A broad Next range may resolve to 15+; tags, git specs and newer lines
  // need real install evidence, not a made-up major-version contract.
  if (!minVersion(nextRange) || !minVersion(reactRange)) return null;
  if (!subset(nextRange, ">=13.0.0 <15.0.0")) return null;
  // The published 13.0.0 manifest admits ^18.0.0-0; 13.0.1+ requires
  // ^18.2.0. An unlocked range admitting 13.0.0 is not proof of ERESOLVE.
  const reactPeer = intersects(nextRange, "13.0.0") ? "^18.0.0-0" : "^18.2.0";
  if (intersects(reactRange, reactPeer)) return null;
  const nextMajor = extractDependencyMajor(nextRange);
  const reactMajor = extractDependencyMajor(reactRange);
  if (nextMajor === null || reactMajor === null) return null;
  return { nextMajor, reactMajor, reactPeer };
}

function repairOptionsForNextReact(params: {
  nextMajor: number;
  reactMajor: number;
  peers: PackageTreePeerMap;
}): string[] {
  const reactDomNote = params.peers.reactDom ? ` and react-dom ${params.peers.reactDom}` : "";
  const typesNote = params.peers.typesReact
    ? ` Keep @types/react (${params.peers.typesReact}) on the same React major.`
    : "";
  return [
    `Bump Next to a line that peers React ${params.reactMajor}${reactDomNote}.${typesNote}`,
    `Pin React 18 (and react-dom 18) to match Next ${params.nextMajor}.${typesNote}`,
    "Leave the imported tree verbatim and do not publish until the tree is coherent.",
  ];
}

type LockedVersions = { next: string; react: string };

export function detectPackageTreeConflicts(
  pkg: unknown,
  locked?: LockedVersions,
): PackageTreeConflict[] {
  const record = asRecord(pkg);
  if (!record) return [];
  const deps = collectDeclaredDependencyRanges(record);
  const conflicts: PackageTreeConflict[] = [];
  if (deps.next && deps.react) {
    const useLocked =
      locked &&
      valid(locked.next) &&
      valid(locked.react) &&
      satisfies(locked.next, deps.next) &&
      satisfies(locked.react, deps.react);
    const mismatch = nextReactEresolve(
      useLocked ? locked.next : deps.next,
      useLocked ? locked.react : deps.react,
    );
    if (mismatch) {
      const peers = peerMapFromRanges(deps);
      conflicts.push({
        code: "next_react_peer_eresolve",
        nextRange: deps.next,
        reactRange: deps.react,
        nextMajor: mismatch.nextMajor,
        reactMajor: mismatch.reactMajor,
        peers,
        message:
          `next ${deps.next} and react ${deps.react} is an npm ERESOLVE tree` +
          ` (Next ${mismatch.nextMajor} peers React ${mismatch.reactPeer}, not this React selection/range).` +
          ` Preview may start after --legacy-peer-deps; Vercel npm install will not.`,
        repairOptions: repairOptionsForNextReact({
          nextMajor: mismatch.nextMajor,
          reactMajor: mismatch.reactMajor,
          peers,
        }),
      });
    }
  }
  return conflicts;
}

export function findPackageJsonFile<T extends { path: string; content: string }>(
  files: readonly T[],
): T | null {
  return (
    files.find((file) => {
      const name = file.path.replace(/^\/+/, "").replace(/\\/g, "/");
      return name === "package.json";
    }) ?? null
  );
}

export function findPackageTreeConflictsInFiles(
  files: ReadonlyArray<{ path: string; content: string }>,
  packageJsonPath?: string,
): { path: string; conflicts: PackageTreeConflict[] } | null {
  const normalizePath = (path: string) => path.replace(/^\/+/, "").replace(/\\/g, "/");
  // Default import/publish contract is root-only. Sanity can explicitly pass
  // its supported src/package.json fallback without changing those callers.
  const pkgFile = packageJsonPath
    ? files.find((file) => normalizePath(file.path) === normalizePath(packageJsonPath))
    : findPackageJsonFile(files);
  if (!pkgFile) return null;
  const parsed = parsePackageJsonRecord(pkgFile.content);
  if (!parsed) return null;
  const packagePath = normalizePath(pkgFile.path);
  const lockPath = `${packagePath.slice(0, packagePath.lastIndexOf("/") + 1)}package-lock.json`;
  const lockFile = files.find((file) => normalizePath(file.path) === lockPath);
  const lock = lockFile ? parsePackageJsonRecord(lockFile.content) : null;
  const packages = asRecord(lock?.packages);
  // npm v2/v3, with a v1 fallback. Ignore stale/out-of-range selections in
  // detectPackageTreeConflicts; a lockfile is not proof for another manifest.
  const legacy = asRecord(lock?.dependencies);
  const next = asRecord(packages?.["node_modules/next"] ?? legacy?.next)?.version;
  const react = asRecord(packages?.["node_modules/react"] ?? legacy?.react)?.version;
  const locked =
    typeof next === "string" && typeof react === "string" ? { next, react } : undefined;
  const conflicts = detectPackageTreeConflicts(parsed, locked);
  if (conflicts.length === 0) return null;
  return { path: pkgFile.path, conflicts };
}

export function formatPackageTreeConflictDetail(conflict: PackageTreeConflict): string {
  const peerBits = [
    conflict.peers.reactDom ? `react-dom ${conflict.peers.reactDom}` : null,
    conflict.peers.typesReact ? `@types/react ${conflict.peers.typesReact}` : null,
    conflict.peers.typesReactDom ? `@types/react-dom ${conflict.peers.typesReactDom}` : null,
  ].filter((bit): bit is string => bit !== null);
  const peerLine =
    peerBits.length > 0 ? ` Other peers in the same package.json: ${peerBits.join(", ")}.` : "";
  return `${conflict.message}${peerLine} Coherent options: ${conflict.repairOptions.join(" / ")}`;
}
