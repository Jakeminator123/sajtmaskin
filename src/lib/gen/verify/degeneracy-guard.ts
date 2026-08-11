/**
 * Early degenerate / oversized-output guard.
 *
 * Catches the failure class behind the prod `credential-deck.tsx` incident
 * (M#og1): a generated project whose `files_json` ballooned to ~4.4 MB /
 * 90k lines with one component repeated ~1024x. A read-only prod-DB pass
 * confirmed that case was a SINGLE version (no repair accumulation) whose model
 * completion was only ~21k tokens (~84 KB) — i.e. the bloat was amplified
 * downstream in finalize assembly, NOT emitted whole by the model. So the
 * guard runs on the ASSEMBLED file set (where the bloat actually exists), where
 * it can fail the version fast with an explicit, named reason instead of
 * letting a multi-MB artifact be persisted/served and churned through the
 * SERVER verify/repair loop (the incident logged 3 follow-up repair passes,
 * all failed).
 *
 * Deterministic + pure so it can be unit-tested without any pipeline plumbing.
 * Conservative thresholds: real generated source files top out ~100–150 KB and
 * never repeat a substantial line dozens of times, so a legitimate project is
 * never flagged. Two file classes are judged by provenance rather than shape,
 * because holding them to the source heuristics failed whole versions over
 * content no model wrote: binary assets get their own ceiling
 * (`maxBinaryAssetBytes`), and lockfiles plus base-identical inherited files
 * are exempt from the self-repetition heuristic (see `isGeneratedLockfile` and
 * `DegeneracyDetectionOptions.preservePaths`).
 */

import { isNonTextContentFile } from "@/lib/gen/context/file-context-builder";

export interface DegeneracyResult {
  degenerate: boolean;
  reason: string | null;
  file: string | null;
  sizeBytes: number | null;
  repeatedLine: string | null;
  repeatCount: number | null;
}

export interface DegeneracyThresholds {
  /** A single source file above this byte size is treated as degenerate. */
  maxSingleFileBytes: number;
  /**
   * Total bytes across ALL source files above this is degenerate — catches bloat
   * split across several sub-`maxSingleFileBytes` files (Codex #322 P2).
   */
  maxTotalProjectBytes: number;
  /** Only "substantial" lines (>= this length, trimmed) count for repetition. */
  minRepeatLineLength: number;
  /** A substantial line repeated >= this many times in one file is degenerate. */
  maxLineRepeats: number;
  /** A single binary asset (base64 image/font/video) above this is degenerate. */
  maxBinaryAssetBytes: number;
  /** Total bytes across ALL files — source and assets share one payload budget. */
  maxTotalPayloadBytes: number;
}

export const DEFAULT_DEGENERACY_THRESHOLDS: DegeneracyThresholds = {
  // Real generated source files top out ~100–150 KB; this ceiling only trips on
  // true bloat (the incident assembled a single ~4.4 MB file).
  maxSingleFileBytes: 768_000,
  // A whole legitimate generated project is well under this; ~3 MB only trips on
  // bloat spread across multiple files.
  maxTotalProjectBytes: 3_000_000,
  // Only count long, code-shaped lines so ordinary repeated DATA rows (a
  // repeated image URL, category string, etc.) never trip the heuristic
  // (Codex #322 P2). The incident repeated a 40+ char function signature.
  minRepeatLineLength: 40,
  // 120 is far above anything legitimate code/data emits for a 40+ char line;
  // the incident repeated its signature 1024x.
  maxLineRepeats: 120,
  // Binary assets are not model output — an imported template legitimately ships
  // a multi-hundred-KB icon or hero image. Both ceilings mirror the preview-host
  // payload contract (`preview-host/src/validate.js`): anything the preview would
  // accept must not be called degenerate here, and anything it would refuse must
  // not be persisted as a bootable version.
  maxBinaryAssetBytes: 2 * 1024 * 1024,
  maxTotalPayloadBytes: 12 * 1024 * 1024,
};

const CLEAN: DegeneracyResult = {
  degenerate: false,
  reason: null,
  file: null,
  sizeBytes: null,
  repeatedLine: null,
  repeatCount: null,
};

/**
 * Machine-generated dependency lockfiles. A lockfile legitimately repeats the
 * SAME long line once per resolved package — a metapackage like `radix-ui`
 * pulls in ~30 subpackages that each declare the identical 52-char peer range
 * `react: ^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc`. Prod chat f98fd5c0
 * (2026-08-11) crossed the 120 cap at 126 repeats after the dep-completer
 * pinned `radix-ui` and the preview host regenerated the lockfile, which then
 * blocked every later follow-up on a site that had already rendered fine.
 *
 * The size ceilings still apply — only the self-repetition heuristic, which
 * assumes prose/code shape, is meaningless here.
 */
const LOCKFILE_BASENAMES = new Set([
  "pnpm-lock.yaml",
  // The `.yml` spelling is accepted as a pnpm lockfile by the template blob
  // tooling (`scripts/v0-templates/verify-mallar-blob.mjs`), so an imported
  // template can legitimately carry it.
  "pnpm-lock.yml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "deno.lock",
  "composer.lock",
  "poetry.lock",
  "cargo.lock",
  "gemfile.lock",
  "pipfile.lock",
]);

export function isGeneratedLockfile(path: string): boolean {
  const basename = path.replace(/\\/g, "/").split("/").pop() ?? "";
  return LOCKFILE_BASENAMES.has(basename.toLowerCase());
}

function languageOf(file: { language?: unknown }): string {
  return typeof file.language === "string" ? file.language : "";
}

function byteLength(value: string): number {
  try {
    return Buffer.byteLength(value, "utf8");
  } catch {
    return value.length;
  }
}

export interface DegeneracyDetectionOptions {
  /**
   * Paths whose content is byte-identical with the base version. Inherited
   * content is not this round's output, so the self-repetition heuristic must
   * not fail the round over it — otherwise one bad version bricks every later
   * follow-up and the user can never edit their way out (prod chat f98fd5c0).
   * The SIZE ceilings deliberately ignore provenance: they mirror what the
   * preview host will accept, and it refuses an oversized payload either way.
   */
  preservePaths?: ReadonlySet<string>;
}

/**
 * Inspect a parsed file list for oversized files or self-repetition. Returns at
 * the FIRST offending file so the caller gets a concrete, named reason.
 */
export function detectDegenerateFiles(
  files: ReadonlyArray<{ path?: unknown; content?: unknown; language?: unknown }>,
  thresholds: DegeneracyThresholds = DEFAULT_DEGENERACY_THRESHOLDS,
  options: DegeneracyDetectionOptions = {},
): DegeneracyResult {
  if (!Array.isArray(files) || files.length === 0) return CLEAN;
  let totalSourceBytes = 0;
  let totalPayloadBytes = 0;
  for (const file of files) {
    const path = typeof file.path === "string" ? file.path : "";
    const content = typeof file.content === "string" ? file.content : "";
    if (!content) continue;

    const sizeBytes = byteLength(content);

    // Everything counts against the payload ceiling — source and assets share
    // one budget at the preview host, so a version that passes here must be
    // one the host can actually boot.
    totalPayloadBytes += sizeBytes;
    if (totalPayloadBytes > thresholds.maxTotalPayloadBytes) {
      return {
        degenerate: true,
        reason: `Total payload ${Math.round(totalPayloadBytes / 1024)} KB exceeds the ${Math.round(
          thresholds.maxTotalPayloadBytes / 1024,
        )} KB ceiling (the preview host refuses the payload above this).`,
        file: path || null,
        sizeBytes: totalPayloadBytes,
        repeatedLine: null,
        repeatCount: null,
      };
    }

    // Binary assets (base64 blobs from an imported template/ZIP) are carried
    // content, not model output: the source ceilings and the self-repetition
    // heuristic say nothing about them. Judging a 1.8 MB `apple-icon.png` by the
    // 750 KB source ceiling failed whole versions over a file the preview host
    // accepts (prod 2026-08-01, chat cb529c3c).
    if (isNonTextContentFile({ path, content, language: languageOf(file) })) {
      if (sizeBytes > thresholds.maxBinaryAssetBytes) {
        return {
          degenerate: true,
          reason: `Binary asset ${path || "(unknown)"} is ${Math.round(sizeBytes / 1024)} KB, over the ${Math.round(
            thresholds.maxBinaryAssetBytes / 1024,
          )} KB asset ceiling (the preview host refuses the payload above this).`,
          file: path || null,
          sizeBytes,
          repeatedLine: null,
          repeatCount: null,
        };
      }
      continue;
    }

    totalSourceBytes += sizeBytes;
    if (totalSourceBytes > thresholds.maxTotalProjectBytes) {
      return {
        degenerate: true,
        reason: `Total project size ${Math.round(totalSourceBytes / 1024)} KB exceeds the ${Math.round(
          thresholds.maxTotalProjectBytes / 1024,
        )} KB project ceiling (oversized/degenerate output spread across files).`,
        file: path || null,
        sizeBytes: totalSourceBytes,
        repeatedLine: null,
        repeatCount: null,
      };
    }
    if (sizeBytes > thresholds.maxSingleFileBytes) {
      return {
        degenerate: true,
        reason: `File ${path || "(unknown)"} is ${Math.round(sizeBytes / 1024)} KB, over the ${Math.round(
          thresholds.maxSingleFileBytes / 1024,
        )} KB single-file ceiling (oversized/degenerate output).`,
        file: path || null,
        sizeBytes,
        repeatedLine: null,
        repeatCount: null,
      };
    }

    // Self-repetition only means "model loop" for content this round produced,
    // in a format where repeated long lines are abnormal. Lockfiles and
    // inherited (base-identical) files are neither.
    if (isGeneratedLockfile(path) || options.preservePaths?.has(path)) continue;

    const counts = new Map<string, number>();
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (line.length < thresholds.minRepeatLineLength) continue;
      const next = (counts.get(line) ?? 0) + 1;
      counts.set(line, next);
      if (next >= thresholds.maxLineRepeats) {
        return {
          degenerate: true,
          reason: `File ${path || "(unknown)"} repeats a substantial line ${next}+ times (self-repetition loop): "${line.slice(
            0,
            80,
          )}".`,
          file: path || null,
          sizeBytes,
          repeatedLine: line.slice(0, 120),
          repeatCount: next,
        };
      }
    }
  }
  return CLEAN;
}

/**
 * Convenience wrapper for the persisted `files_json` payload (a JSON array of
 * `{ path, content }`). Never throws — an unparseable payload is treated as
 * non-degenerate (other guards handle malformed JSON).
 */
export function detectDegenerateProjectJson(
  filesJson: string,
  thresholds?: DegeneracyThresholds,
  options?: DegeneracyDetectionOptions,
): DegeneracyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(filesJson);
  } catch {
    return CLEAN;
  }
  if (!Array.isArray(parsed)) return CLEAN;
  return detectDegenerateFiles(
    parsed as Array<{ path?: unknown; content?: unknown; language?: unknown }>,
    thresholds,
    options,
  );
}

export function degenerateStubContent(reason: string | null): string {
  return `// [degenerate output removed by finalize guard]\n// ${
    reason ?? "oversized/degenerate output"
  }\n`;
}

/**
 * De-bloat an already-known-degenerate project for persistence. Two steps so a
 * file in the per-file..total gap is not left behind (Bugbot #322):
 *   1. stub EVERY individually oversized file, judged against its own ceiling:
 *      text/source files over `maxSingleFileBytes`, binary/non-text assets
 *      (per `isNonTextContentFile`: base64 blobs, binary extensions) over
 *      `maxBinaryAssetBytes` — imported templates legitimately carry
 *      multi-hundred-KB base64 images, and stubbing one destroys real user
 *      content (prod chat 4d6b5546: a 1.3 MB texture_earth.jpg was replaced
 *      with a text stub), then
 *   2. stub the LARGEST remaining files until each pool's TOTAL is under its
 *      cap: `maxTotalBytes` for text, `maxBinaryTotalBytes` for binary assets.
 *      The pools have SEPARATE budgets so source bloat can never evict a
 *      legitimate binary asset. Binary ceilings mirror the preview-host
 *      payload contract (`preview-host/src/validate.js`: 2 MB per asset,
 *      12 MB total payload).
 * Paths in `preservePaths` (content byte-identical with the base version, i.e.
 * inherited rather than produced by this round) are NEVER stubbed — inherited
 * content is by definition not this round's degenerate output.
 * Only call this once the project is known degenerate; the version is failing,
 * so replacing bloated TEXT content with a marker stub is safe and keeps the
 * text portion of `files_json` under ~1 MB. Binary assets and inherited
 * (`preservePaths`) content are deliberately NOT held to that guarantee:
 * a payload can persist up to the preview-host binary budget (12 MB) rather
 * than risk destroying legitimate template assets — data loss is worse than
 * DB bloat, and the blocking degeneracy issue still gates preview either way.
 * (A small but self-repetitive file that tripped only the repetition heuristic
 * is left intact — it is blocked, not a persist-size problem.)
 */
export function capDegeneratePayload<
  T extends { path: string; content: string; language?: string },
>(
  files: ReadonlyArray<T>,
  reason: string | null,
  options: {
    maxSingleFileBytes?: number;
    maxTotalBytes?: number;
    maxBinaryAssetBytes?: number;
    maxBinaryTotalBytes?: number;
    /** Paths inherited byte-identically from the base version; never stubbed. */
    preservePaths?: ReadonlySet<string>;
  } = {},
): { files: T[]; stubbedPaths: string[] } {
  const maxSingleFileBytes = options.maxSingleFileBytes ?? 512_000;
  const maxTotalBytes = options.maxTotalBytes ?? 1_000_000;
  const maxBinaryAssetBytes = options.maxBinaryAssetBytes ?? 2 * 1024 * 1024;
  const maxBinaryTotalBytes = options.maxBinaryTotalBytes ?? 12 * 1024 * 1024;
  const preservePaths = options.preservePaths;
  const sized = files.map((file) => ({
    file,
    size: byteLength(file.content ?? ""),
    binary: isNonTextContentFile({
      path: file.path,
      content: file.content ?? "",
      language: file.language ?? "",
    }),
    preserved: preservePaths?.has(file.path) ?? false,
  }));
  const toStub = new Set<string>();
  // 1. Every individually oversized file, against its pool's own ceiling.
  for (const { file, size, binary, preserved } of sized) {
    if (preserved) continue;
    if (size > (binary ? maxBinaryAssetBytes : maxSingleFileBytes)) {
      toStub.add(file.path);
    }
  }
  // 2. Largest remaining files until each pool's total is under its cap.
  //    Preserved files count toward the total but are never candidates, so a
  //    pool can legitimately stay above its cap when everything left in it is
  //    inherited content.
  const capPoolTotal = (
    pool: ReadonlyArray<(typeof sized)[number]>,
    maxTotal: number,
  ): void => {
    let total = pool.reduce(
      (sum, entry) => sum + (toStub.has(entry.file.path) ? 0 : entry.size),
      0,
    );
    for (const { file, size } of [...pool]
      .filter((entry) => !toStub.has(entry.file.path) && !entry.preserved)
      .sort((a, b) => b.size - a.size)) {
      if (total <= maxTotal) break;
      toStub.add(file.path);
      total -= size; // the stub content is negligible
    }
  };
  capPoolTotal(sized.filter((entry) => !entry.binary), maxTotalBytes);
  capPoolTotal(sized.filter((entry) => entry.binary), maxBinaryTotalBytes);
  if (toStub.size === 0) return { files: [...files], stubbedPaths: [] };
  const stub = degenerateStubContent(reason);
  return {
    files: files.map((file) =>
      toStub.has(file.path) ? { ...file, content: stub } : file,
    ),
    stubbedPaths: [...toStub],
  };
}
