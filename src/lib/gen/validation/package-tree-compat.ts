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

import { Range, minVersion, satisfies, subset, valid, validRange } from "semver";
import { readLockedNextReact } from "./package-tree-lock-selections";

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

export type PackageTreeConflictCode = "next_react_peer_eresolve" | "next_react_peer_resolution_required";

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

// Published npm peer contracts; select all contracts an unlocked range admits.
// Do not extend these boundaries by guessing a contract for newer Next lines.
const NEXT_REACT_PEERS = [
  { next: "12.0.0", react: "^17.0.2" },
  { next: ">=12.0.1 <12.0.5", react: "^17.0.2 || ^18.0.0" },
  { next: ">=12.0.5 <13.0.0", react: "^17.0.2 || ^18.0.0-0" },
  { next: "13.0.0", react: "^18.0.0-0" },
  { next: ">=13.0.1 <15.0.0", react: "^18.2.0" },
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

function rangesShareVersion(left: string, right: string): boolean {
  // intersects() rejects some compatible exact prereleases. Prove admission
  // using a witness for each AND-pair, with npm's normal prerelease rules for
  // BOTH original ranges (never globally enable includePrerelease).
  return new Range(left).set.some((leftSet) => new Range(right).set.some((rightSet) => {
    const minimum = minVersion([...leftSet, ...rightSet].map((comparator) => comparator.value).filter(Boolean).join(" "));
    if (!minimum) return false;
    const candidates = [minimum.version, `${minimum.major}.${minimum.minor}.${minimum.patch}`];
    return candidates.some((version) => satisfies(version, left) && satisfies(version, right));
  }));
}

function nextReactEresolve(
  nextRange: string,
  reactRange: string,
): { code: PackageTreeConflictCode; nextMajor: number; reactMajor: number; reactPeer: string } | null {
  if (!validRange(nextRange) || !validRange(reactRange)) return null;
  // An unlocked range is safe only if every admitted React choice fits every
  // admitted Next contract. One historical compatible pair is not evidence
  // for the versions npm will select. Distinguish a proven conflict from an
  // ambiguous range requiring an in-range lock or exact matching pair.
  // A broad Next range may resolve to 15+; tags, git specs and newer lines
  // need real install evidence, not a made-up major-version contract.
  if (!minVersion(nextRange) || !minVersion(reactRange)) return null;
  if (!subset(nextRange, ">=12.0.0 <15.0.0")) return null;
  const contracts = NEXT_REACT_PEERS.filter((contract) => rangesShareVersion(nextRange, contract.next));
  if (contracts.length === 0) return null;
  const reactChoices = new Range(reactRange);
  const withinPeer = (peer: string) => subset(reactRange, peer) || reactChoices.set.every((choice) =>
    // node-semver subset rejects some admitted exact prereleases; validate
    // singleton OR choices using normal npm prerelease admission instead.
    choice.length === 1 && choice[0].operator === "" && Boolean(valid(choice[0].value)) && satisfies(choice[0].value, peer),
  );
  if (contracts.every((contract) => withinPeer(contract.react))) return null;
  const code = contracts.every((contract) => !rangesShareVersion(reactRange, contract.react))
    ? "next_react_peer_eresolve"
    : "next_react_peer_resolution_required";
  const reactPeer = [...new Set(contracts.map((contract) => contract.react))].join(" || ");
  const nextMajor = extractDependencyMajor(nextRange);
  const reactMajor = extractDependencyMajor(reactRange);
  if (nextMajor === null || reactMajor === null) return null;
  return { code, nextMajor, reactMajor, reactPeer };
}

function repairOptionsForNextReact(params: {
  reactMajor: number;
  peers: PackageTreePeerMap;
}): string[] {
  const reactDomNote = params.peers.reactDom ? ` and react-dom ${params.peers.reactDom}` : "";
  const typesNote = params.peers.typesReact
    ? ` Keep @types/react (${params.peers.typesReact}) on the same React major.`
    : "";
  return [
    `Bump Next to a line that peers React ${params.reactMajor}${reactDomNote}.${typesNote}`,
    `Pin Next to one published exact release, then pin React and react-dom to that release's own peer range; do not leave a cross-contract Next range unlocked.${typesNote}`,
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
        code: mismatch.code,
        nextRange: deps.next,
        reactRange: deps.react,
        nextMajor: mismatch.nextMajor,
        reactMajor: mismatch.reactMajor,
        peers,
        message: mismatch.code === "next_react_peer_resolution_required"
          ? `next ${deps.next} and react ${deps.react} admit peer-incompatible resolution choices. A historical compatible pair does not prove the installer's selected tree. Supply an in-range lockfile for the effective package manager with coherent Next/React selections or pin an exact matching pair before publishing.`
          : `next ${deps.next} and react ${deps.react} is an npm ERESOLVE tree` +
          ` (Next ${mismatch.nextMajor} peers React ${mismatch.reactPeer}, not this React selection/range).` +
          ` Preview may start after --legacy-peer-deps; Vercel npm install will not.`,
        repairOptions: repairOptionsForNextReact({
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
  const locked = readLockedNextReact(files, pkgFile.path, parsed, collectDeclaredDependencyRanges(parsed));
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
