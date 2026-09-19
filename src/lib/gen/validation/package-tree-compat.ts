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

/** First integer in a semver range (`^19`, `14.2.25`, `>=18.2.0` → 19 / 14 / 18). */
export function extractDependencyMajor(range: string): number | null {
  const match = range.trim().match(/\d+/);
  if (!match) return null;
  const major = Number.parseInt(match[0], 10);
  return Number.isFinite(major) ? major : null;
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
): { nextMajor: number; reactMajor: number } | null {
  const nextMajor = extractDependencyMajor(nextRange);
  const reactMajor = extractDependencyMajor(reactRange);
  if (nextMajor === null || reactMajor === null) return null;
  // Next 13/14 declare `react@^18.2.0`. React 19 → npm ERESOLVE (incident).
  if (nextMajor <= 14 && reactMajor >= 19) return { nextMajor, reactMajor };
  // Next 16+ declares `react@^19`. React 18 → npm ERESOLVE.
  if (nextMajor >= 16 && reactMajor < 19) return { nextMajor, reactMajor };
  return null;
}

function repairOptionsForNextReact(params: {
  nextMajor: number;
  reactMajor: number;
  peers: PackageTreePeerMap;
}): string[] {
  const reactDomNote = params.peers.reactDom
    ? ` and react-dom ${params.peers.reactDom}`
    : "";
  const typesNote = params.peers.typesReact
    ? ` Keep @types/react (${params.peers.typesReact}) on the same React major.`
    : "";
  if (params.nextMajor <= 14 && params.reactMajor >= 19) {
    return [
      `Bump Next to a 15+ line that peers React ${params.reactMajor}${reactDomNote}.${typesNote}`,
      `Pin React 18 (and react-dom 18) to match Next ${params.nextMajor}.${typesNote}`,
      "Leave the imported tree verbatim and do not publish until the tree is coherent.",
    ];
  }
  return [
    `Bump React to 19+ (and react-dom) to match Next ${params.nextMajor}.${typesNote}`,
    `Pin Next to a 15 line that still peers React ${params.reactMajor}.${typesNote}`,
    "Leave the imported tree verbatim and do not publish until the tree is coherent.",
  ];
}

export function detectPackageTreeConflicts(pkg: unknown): PackageTreeConflict[] {
  const record = asRecord(pkg);
  if (!record) return [];
  const deps = collectDeclaredDependencyRanges(record);
  const conflicts: PackageTreeConflict[] = [];
  if (deps.next && deps.react) {
    const mismatch = nextReactEresolve(deps.next, deps.react);
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
          ` (Next ${mismatch.nextMajor} does not peer React ${mismatch.reactMajor}).` +
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
): { path: string; conflicts: PackageTreeConflict[] } | null {
  const pkgFile = findPackageJsonFile(files);
  if (!pkgFile) return null;
  const parsed = parsePackageJsonRecord(pkgFile.content);
  if (!parsed) return null;
  const conflicts = detectPackageTreeConflicts(parsed);
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
