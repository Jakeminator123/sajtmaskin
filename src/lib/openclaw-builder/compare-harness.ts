/**
 * Offline set-compare of a shadow plan's predicted files vs a classic
 * diff. No model, no I/O, and no version persist. The observation is a
 * file-list delta only — it does not claim the plan ran or changed anything.
 */

export const HEX64_RE = /^[0-9a-f]{64}$/;
export const MAX_COMPARE_PATH_LENGTH = 200;
export const MAX_COMPARE_FILES = 80;

export type CompareInput = {
  generationInputPackageHash: string;
  planExpectedFiles: string[];
  classicChangedFiles: string[];
};

export type CompareObservation = {
  packageHash: string;
  predicted: string[];
  actual: string[];
  missingFromClassic: string[];
  extraInClassic: string[];
  overlap: string[];
};

export type CompareResult =
  | { ok: true; observation: CompareObservation }
  | { ok: false; code: "invalid_input" };

const INVALID: CompareResult = { ok: false, code: "invalid_input" };

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeRelativePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_COMPARE_PATH_LENGTH) return null;
  if (value.includes("\\") || value.includes("\0")) return null;
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return null;
  const segments = value.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return value;
}

function normalizePathList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_COMPARE_FILES) return null;
  const unique = new Set<string>();
  for (const item of value) {
    const path = normalizeRelativePath(item);
    if (path == null) return null;
    unique.add(path);
  }
  return [...unique].sort(comparePath);
}

export function compareShadowPlanToClassic(input: CompareInput): CompareResult {
  if (input == null || typeof input !== "object") return INVALID;
  if (!isHex64(input.generationInputPackageHash)) return INVALID;

  const predicted = normalizePathList(input.planExpectedFiles);
  if (!predicted) return INVALID;
  const actual = normalizePathList(input.classicChangedFiles);
  if (!actual) return INVALID;

  const actualSet = new Set(actual);
  const predictedSet = new Set(predicted);
  const overlap = predicted.filter((path) => actualSet.has(path));
  const missingFromClassic = predicted.filter((path) => !actualSet.has(path));
  const extraInClassic = actual.filter((path) => !predictedSet.has(path));

  return {
    ok: true,
    observation: {
      packageHash: input.generationInputPackageHash,
      predicted,
      actual,
      missingFromClassic,
      extraInClassic,
      overlap,
    },
  };
}
