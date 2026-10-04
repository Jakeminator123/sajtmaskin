/**
 * Canonical dossier file-path contract.
 *
 * A manifest path has two identities: its portable path below the dossier
 * directory and the path written into the generated project. Runtime readers
 * and materializers go through {@link resolveDossierFilePath}, so validation, prompt
 * rendering, restoration and acceptance builds cannot drift apart.
 */

import { SCAFFOLD_PROTECTED_PATHS } from "@/lib/gen/scaffolds/protected-paths";

const MIN_PATH_LENGTH = 3;
const MAX_PATH_LENGTH = 240;

const ROOT_LEVEL_FILES = new Set(["middleware.ts", "instrumentation.ts", "drizzle.config.ts"]);
const SENTRY_CONFIG_RE = /^sentry\.(client|server|edge)\.config\.ts$/;

const SCAFFOLD_RESERVED_OUTPUT_PATHS: ReadonlySet<string> = new Set([
  "app/layout.tsx",
  "app/globals.css",
  "app/loading.tsx",
  "app/error.tsx",
  "app/not-found.tsx",
  "app/template.tsx",
  "package.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "tailwind.config.ts",
  "postcss.config.mjs",
  ...SCAFFOLD_PROTECTED_PATHS,
]);

const WINDOWS_DEVICE_BASENAME_RE =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const FORBIDDEN_PORTABLE_CHAR_RE = /[<>:"|?*]/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

export interface ResolvedDossierFilePath {
  sourcePath: string;
  outputPath: string;
  /** NFC-normalized, case-folded identity for portable collision checks. */
  outputIdentity: string;
}

export class DossierFilePathError extends Error {
  readonly dossierPath: string;

  constructor(dossierPath: string, reason: string) {
    super(`invalid dossier file path ${JSON.stringify(dossierPath)}: ${reason}`);
    this.name = "DossierFilePathError";
    this.dossierPath = dossierPath;
  }
}

/** Close case-only and Unicode-composition aliases on Windows and macOS. */
export function dossierOutputPathIdentity(outputPath: string): string {
  return outputPath.normalize("NFC").toLowerCase();
}

/**
 * Normalize spelling from generated-project file lists without making an
 * unsafe path valid. In particular, traversal segments stay visible for the
 * strict manifest/path owners to reject; this helper never resolves them.
 */
export function normalizeDossierProjectPath(projectPath: string): string {
  let normalized = projectPath.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized.replace(/^\/+/, "");
}

/** True when one portable output identity is a strict directory ancestor of the other. */
export function dossierOutputPathsHaveFileDirectoryConflict(
  leftOutputPath: string,
  rightOutputPath: string,
): boolean {
  const left = dossierOutputPathIdentity(leftOutputPath);
  const right = dossierOutputPathIdentity(rightOutputPath);
  return left !== right && (left.startsWith(`${right}/`) || right.startsWith(`${left}/`));
}

function findScaffoldReservedOutputConflict(outputPath: string): string | null {
  const outputIdentity = dossierOutputPathIdentity(outputPath);
  for (const reservedPath of SCAFFOLD_RESERVED_OUTPUT_PATHS) {
    if (
      dossierOutputPathIdentity(reservedPath) === outputIdentity ||
      dossierOutputPathsHaveFileDirectoryConflict(reservedPath, outputPath)
    ) {
      return reservedPath;
    }
  }
  return null;
}

function assertPortableRelativePath(path: string): void {
  if (path.length < MIN_PATH_LENGTH || path.length > MAX_PATH_LENGTH) {
    throw new DossierFilePathError(
      path,
      `must be ${MIN_PATH_LENGTH}..${MAX_PATH_LENGTH} characters`,
    );
  }
  if (path.includes("\\")) {
    throw new DossierFilePathError(path, "must use forward slashes");
  }
  if (CONTROL_CHAR_RE.test(path)) {
    throw new DossierFilePathError(path, "must not contain control characters");
  }
  if (FORBIDDEN_PORTABLE_CHAR_RE.test(path)) {
    throw new DossierFilePathError(path, 'contains a Windows-forbidden character (< > : " | ? *)');
  }
  if (path.startsWith("/") || /^[a-z]:/i.test(path)) {
    throw new DossierFilePathError(path, "must be relative");
  }

  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      throw new DossierFilePathError(path, "must not contain empty path segments");
    }
    if (segment === "." || segment === "..") {
      throw new DossierFilePathError(path, "must not contain traversal segments");
    }
    if (/[. ]$/.test(segment)) {
      throw new DossierFilePathError(path, "segments must not end in a dot or space");
    }
    if (WINDOWS_DEVICE_BASENAME_RE.test(segment)) {
      throw new DossierFilePathError(
        path,
        `uses reserved Windows device name ${JSON.stringify(segment)}`,
      );
    }
  }
}

function mapValidatedPathToOutput(sourcePath: string): string {
  if (!sourcePath.startsWith("components/")) return sourcePath;
  const rest = sourcePath.slice("components/".length);
  if (rest.startsWith("api/")) return `app/${rest}`;
  if (ROOT_LEVEL_FILES.has(rest) || SENTRY_CONFIG_RE.test(rest)) return rest;
  if (rest.startsWith("lib/")) return rest;
  return sourcePath;
}

/**
 * Validate and resolve one manifest `files[].path`.
 * Literal catch-all segments such as `[...slug]` are valid because only a
 * complete `..` segment denotes traversal.
 */
export function resolveDossierFilePath(dossierPath: string): ResolvedDossierFilePath {
  if (typeof dossierPath !== "string") {
    throw new DossierFilePathError(String(dossierPath), "must be a string");
  }
  assertPortableRelativePath(dossierPath);
  const outputPath = mapValidatedPathToOutput(dossierPath);
  assertPortableRelativePath(outputPath);
  const outputIdentity = dossierOutputPathIdentity(outputPath);
  const reservedConflict = findScaffoldReservedOutputConflict(outputPath);
  if (reservedConflict) {
    throw new DossierFilePathError(
      dossierPath,
      `maps to output path ${JSON.stringify(outputPath)}, which conflicts with scaffold-reserved output path ${JSON.stringify(reservedConflict)}`,
    );
  }
  return { sourcePath: dossierPath, outputPath, outputIdentity };
}

/** Historical projection retained for callers; validation is never bypassed. */
export function mapDossierPathToOutput(dossierPath: string): string {
  return resolveDossierFilePath(dossierPath).outputPath;
}

export interface DossierOutputPathClaim {
  dossierId: string;
  capability: string;
  sourcePath: string;
  content: string | null;
}

export interface DossierOutputPathConflict {
  outputPath: string;
  outputIdentity: string;
  claims: DossierOutputPathClaim[];
}

/**
 * Find claims that cannot safely share one portable output identity.
 * Byte-identical shared helpers are safe only when their actual output path,
 * including casing and Unicode composition, is also identical.
 */
export function findDivergentDossierOutputPathConflicts(
  claims: readonly DossierOutputPathClaim[],
): DossierOutputPathConflict[] {
  const resolvedClaims = claims.map((claim) => ({
    claim,
    resolved: resolveDossierFilePath(claim.sourcePath),
  }));
  const grouped = new Map<
    string,
    { outputPath: string; claims: DossierOutputPathClaim[]; outputPaths: Set<string> }
  >();
  for (const { claim, resolved } of resolvedClaims) {
    const group = grouped.get(resolved.outputIdentity) ?? {
      outputPath: resolved.outputPath,
      claims: [],
      outputPaths: new Set<string>(),
    };
    group.claims.push(claim);
    group.outputPaths.add(resolved.outputPath);
    grouped.set(resolved.outputIdentity, group);
  }

  const conflicts: DossierOutputPathConflict[] = [];
  for (const [outputIdentity, group] of grouped) {
    if (group.claims.length < 2) continue;
    const first = group.claims[0]?.content;
    const byteIdentical =
      typeof first === "string" &&
      group.claims.every((claim) => typeof claim.content === "string" && claim.content === first);
    if (!byteIdentical || group.outputPaths.size !== 1) {
      conflicts.push({ outputPath: group.outputPath, outputIdentity, claims: [...group.claims] });
    }
  }
  for (let leftIndex = 0; leftIndex < resolvedClaims.length; leftIndex += 1) {
    const left = resolvedClaims[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < resolvedClaims.length; rightIndex += 1) {
      const right = resolvedClaims[rightIndex]!;
      if (
        !dossierOutputPathsHaveFileDirectoryConflict(
          left.resolved.outputPath,
          right.resolved.outputPath,
        )
      ) {
        continue;
      }
      const parent =
        left.resolved.outputIdentity.length < right.resolved.outputIdentity.length ? left : right;
      conflicts.push({
        outputPath: parent.resolved.outputPath,
        outputIdentity: parent.resolved.outputIdentity,
        claims: [left.claim, right.claim],
      });
    }
  }
  return conflicts.sort((a, b) => a.outputIdentity.localeCompare(b.outputIdentity));
}
