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
import { effectivePackageTreeInstaller, readLockedNextReact } from "./package-tree-lock-selections";

function isNativeRegistryTag(rawSpec: string): boolean {
  const spec = rawSpec.trim();
  // npm-package-arg routes paths and tar archives before registry tags. Its
  // registry fallback allows URI-unescaped names that are not SemVer ranges;
  // alphabetic-first matching rejects valid tags and admits e.g. react.tgz.
  if (!spec || validRange(spec, true) || spec.startsWith(".") || /\.(?:tgz|tar\.gz|tar)$/i.test(spec)) return false;
  try {
    return encodeURIComponent(spec) === spec;
  } catch {
    return false;
  }
}

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
  reactMajor: number | null;
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

// Published stable npm peer contracts (419 releases through Next 16.3.8).
// Select all contracts an unlocked range admits; never guess a newer major.
// Next 0/1 did not declare a React peer, so do not invent one for those lines.
const NEXT_REACT_PEERS = [
  { next: ">=2.0.0 <3.0.2", react: "^15.4.2" },
  { next: ">=3.0.2 <4.0.0", react: "^15.5.4" },
  { next: ">=4.0.0 <8.0.0", react: "^16.0.0" },
  { next: ">=8.0.0 <10.0.0", react: "^16.6.0" },
  { next: ">=10.0.0 <11.0.0", react: "^16.6.0 || ^17" },
  { next: ">=11.0.0 <12.0.1", react: "^17.0.2" },
  { next: ">=12.0.1 <12.0.5", react: "^17.0.2 || ^18.0.0" },
  { next: ">=12.0.5 <13.0.0", react: "^17.0.2 || ^18.0.0-0" },
  { next: "13.0.0", react: "^18.0.0-0" },
  { next: ">=13.0.1 <15.0.0", react: "^18.2.0" },
  { next: "15.0.0", react: "^18.2.0 || 19.0.0-rc-65a56d0e-20241020" },
  { next: "15.0.1", react: "^18.2.0 || 19.0.0-rc-69d4b800-20241021" },
  { next: "15.0.2", react: "^18.2.0 || 19.0.0-rc-02c0e824-20241028" },
  { next: "15.0.3", react: "^18.2.0 || 19.0.0-rc-66855b96-20241106" },
  { next: ">=15.0.4 <15.1.0", react: "^18.2.0 || 19.0.0-rc-66855b96-20241106 || ^19.0.0" },
  { next: ">=15.1.0 <17.0.0", react: "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0" },
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
  unsupportedInstallerAlias = false,
): { code: PackageTreeConflictCode; nextMajor: number; reactMajor: number | null; reactPeer: string } | null {
  if (!validRange(nextRange) || !minVersion(nextRange)) return null;
  // This is an installer-spec failure, independent of any Next peer table.
  // A known numeric Next declaration supplies diagnostics, not a made-up peer.
  if (unsupportedInstallerAlias) return {
    code: "next_react_peer_resolution_required",
    nextMajor: extractDependencyMajor(nextRange)!, reactMajor: null, reactPeer: "",
  };
  // An unlocked range is safe only if every admitted React choice fits every
  // admitted Next contract. One historical compatible pair is not evidence
  // for the versions npm will select. Distinguish a proven conflict from an
  // ambiguous range requiring an in-range lock or exact matching pair.
  // A broad Next range may resolve to 17+; tags, git specs and newer lines
  // need real install evidence, not a made-up major-version contract.
  const fullyKnown = subset(nextRange, ">=2.0.0 <17.0.0");
  const contracts = NEXT_REACT_PEERS.filter((contract) => rangesShareVersion(nextRange, contract.next));
  if (contracts.length === 0) return null;
  const reactPeer = [...new Set(contracts.map((contract) => contract.react))].join(" || ");
  const nextMajor = extractDependencyMajor(nextRange)!;
  // A tarball/tag/git/fork spec has no proven native React version. Do not
  // guess a major from its URL or treat missing resolution as compatibility.
  if (!validRange(reactRange)) return { code: "next_react_peer_resolution_required", nextMajor, reactMajor: null, reactPeer };
  if (!minVersion(reactRange)) return null;
  const reactChoices = new Range(reactRange);
  const withinPeer = (peer: string) => subset(reactRange, peer) || reactChoices.set.every((choice) =>
    // node-semver subset rejects some admitted exact prereleases; validate
    // singleton OR choices using normal npm prerelease admission instead.
    choice.length === 1 && choice[0].operator === "" && Boolean(valid(choice[0].value)) && satisfies(choice[0].value, peer),
  );
  if (fullyKnown && contracts.every((contract) => withinPeer(contract.react))) return null;
  const code = fullyKnown && contracts.every((contract) => !rangesShareVersion(reactRange, contract.react))
    ? "next_react_peer_eresolve"
    : "next_react_peer_resolution_required";
  const reactMajor = extractDependencyMajor(reactRange);
  if (reactMajor === null) return null;
  return { code, nextMajor, reactMajor, reactPeer };
}

function repairOptionsForNextReact(params: {
  reactMajor: number | null;
  peers: PackageTreePeerMap;
}): string[] {
  const reactDomNote = params.peers.reactDom ? ` and react-dom ${params.peers.reactDom}` : "";
  const typesNote = params.peers.typesReact
    ? ` Keep @types/react (${params.peers.typesReact}) on the same React major.`
    : "";
  return [
    params.reactMajor === null
      ? "Resolve the React declaration to a verified native version before comparing it with the selected Next release's peer contract."
      : `Bump Next to a line that peers React ${params.reactMajor}${reactDomNote}.${typesNote}`,
    `Pin Next to one published exact release, then pin React and react-dom to that release's own peer range; do not leave a cross-contract Next range unlocked.${typesNote}`,
    "Leave the imported tree verbatim and do not publish until the tree is coherent.",
  ];
}

type LockedVersions = { next: string; react: string; reactSpecifier?: string };

function nativeAliasRange(name: "next" | "react", declaration: string): string {
  const protocol = declaration.slice(0, 4).toLowerCase();
  const target = `${name}@`;
  // Other alias targets are not the native package and have no known peer contract here.
  return protocol === "npm:" && declaration.slice(4).startsWith(target)
    ? declaration.slice(4 + target.length) : declaration;
}

export function detectPackageTreeConflicts(
  pkg: unknown,
  locked?: LockedVersions,
  installer?: string,
): PackageTreeConflict[] {
  const record = asRecord(pkg);
  if (!record) return [];
  const deps = collectDeclaredDependencyRanges(record);
  const conflicts: PackageTreeConflict[] = [];
  if (deps.next && deps.react) {
    const nextRange = nativeAliasRange("next", deps.next);
    const reactRange = nativeAliasRange("react", deps.react);
    const effectiveInstaller = installer ?? effectivePackageTreeInstaller([], "package.json", record);
    // npm-package-arg case-folds this protocol; pnpm and Yarn do not. Do not
    // turn npm syntax into fabricated evidence for another/unknown installer.
    const unsupportedInstallerAlias = effectiveInstaller !== "npm" &&
      ((nextRange !== deps.next && !deps.next.startsWith("npm:")) ||
        (reactRange !== deps.react && !deps.react.startsWith("npm:")));
    const useLocked =
      !unsupportedInstallerAlias &&
      locked &&
      valid(locked.next) &&
      valid(locked.react) &&
      satisfies(locked.next, nextRange) &&
      (satisfies(locked.react, reactRange) ||
        // Native registry tags can use a current descriptor-bound selection.
        // URL/git/file/fork specs cannot establish native React identity from
        // a version field alone and must not be admitted by this shortcut.
        (isNativeRegistryTag(reactRange) && locked.reactSpecifier === deps.react));
    const mismatch = nextReactEresolve(
      useLocked ? locked.next : nextRange,
      useLocked ? locked.react : reactRange,
      unsupportedInstallerAlias,
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
          ? unsupportedInstallerAlias
            ? `Case-variant npm: aliases do not prove supported resolution by the effective ${effectiveInstaller} installer. Use canonical lowercase npm: descriptors for pnpm/Yarn or verify npm installation before publishing.`
            : `next ${deps.next} and react ${deps.react} do not prove a coherent resolved peer tree. The declarations are unresolved, admit incompatible choices or include Next contracts outside the verified lines; a historical compatible pair is not selection evidence. ` +
            (!validRange(reactRange) && !isNativeRegistryTag(reactRange)
              ? "URL/git/file/fork declarations need native package identity evidence, not just a lock version field. Pin an exact native matching pair before publishing."
              : "Supply an in-range or current native-tag lockfile for the effective package manager with coherent Next/React selections or pin an exact matching pair before publishing.")
          : `next ${deps.next} and react ${deps.react} is an npm ERESOLVE tree` +
          ` (Next ${mismatch.nextMajor} peers React ${mismatch.reactPeer}, not this React selection/range).` +
          ` Preview may start after --legacy-peer-deps; Vercel npm install will not.`,
        repairOptions: [
          ...(unsupportedInstallerAlias ? ["Use canonical lowercase npm: alias descriptors for this installer; do not fabricate a lock selection."] : []),
          ...repairOptionsForNextReact({
            reactMajor: mismatch.reactMajor,
            peers,
          }),
        ],
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
  const conflicts = detectPackageTreeConflicts(parsed, locked, effectivePackageTreeInstaller(files, pkgFile.path, parsed));
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
