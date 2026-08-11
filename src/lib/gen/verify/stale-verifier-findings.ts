/**
 * SM-023 — mechanical stale-check of verifier blocking findings against the
 * FINAL merged project files.
 *
 * WHY: the verifier pass (finalize fast-path phase 3) judges the PRE-merge
 * model output, while phase 4 (merge with previous files, `package.json`
 * deep-merge, post-merge import-validator, dep-completion) deterministically
 * resolves whole classes of findings in the files that actually get
 * persisted. The verdict was never re-checked, so a stale finding could
 * terminally fail a version whose persisted content was already fixed —
 * prod chat `3a6c5472` v3 `e0d6cc0e` (2026-08-05) lost a paid F3 pass to
 * four findings that were all resolved in `files_json`.
 *
 * CONTRACT (fail-closed): a finding is dropped ONLY when a class-specific
 * re-check mechanically confirms it no longer applies to the final files.
 * Unknown finding classes, unparseable details and any internal error keep
 * the finding blocking. This module never mutates content and never adds
 * findings — it can only narrow the blocking set.
 *
 * Covered classes:
 *  1. Missing-import findings (`undefined-jsx-symbol`,
 *     `build-breaking-missing-imports`, LLM ids like `missing-resend-import`)
 *     — resolved when every referenced symbol is import-bound (via the
 *     canonical `collectImportBoundNames`) or locally declared in the final
 *     file, or when the referenced file no longer exists in the project.
 *     `import-name-collision` is deliberately NOT in this class: a collision
 *     cannot be confirmed resolved by boundedness alone.
 *  2. `package.json` setup findings — "lacks build scripts", "lacks
 *     dependency X", and version-combination criticism (`ai@^7` vs
 *     `@ai-sdk/react@^2`) — re-checked against the final merged
 *     `package.json`.
 */

import { collectImportBoundNames } from "@/lib/gen/autofix/import-validator";
import { parseUndefinedJsxSymbolFinding } from "@/lib/gen/verify/verifier-pass";

export interface VerifierBlockingFinding {
  id: string;
  detail: string;
}

export interface FinalProjectFile {
  path: string;
  content: string;
}

export interface DroppedStaleFinding {
  id: string;
  detail: string;
  reason: string;
}

export interface StaleFindingCheckResult {
  kept: VerifierBlockingFinding[];
  dropped: DroppedStaleFinding[];
}

interface ClassCheckVerdict {
  resolved: boolean;
  reason: string;
}

/** LLM finding ids for the missing-import class (`missing-resend-import`, …). */
const MISSING_IMPORT_ID_RE = /^missing-[a-z0-9-]*imports?(?:-[a-z0-9-]+)?$/i;
/** Deterministic/build-lane ids for the same class (`build-breaking-missing-imports`, …). */
const BUILD_IMPORT_ID_RE = /^build-[a-z-]*imports?$/i;

function isMissingImportClassId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  if (normalized === "undefined-jsx-symbol") return true;
  // A name COLLISION is not an absence claim — boundedness cannot confirm it
  // resolved, so it stays outside this class (and therefore always kept).
  if (normalized === "import-name-collision") return false;
  return MISSING_IMPORT_ID_RE.test(normalized) || BUILD_IMPORT_ID_RE.test(normalized);
}

const FILE_PATH_RE =
  /(?:^|[\s`"'(\[-])((?:[A-Za-z0-9_.@\[\]-]+\/)*[A-Za-z0-9_.\[\]-]+\.(?:tsx|ts|jsx|js|mjs|cjs))(?=$|[\s`"'):\],])/;

/**
 * Words the targeted symbol patterns can capture that are prose, not
 * identifiers ("never imports it", "do NOT import a library").
 */
const SYMBOL_STOP_WORDS = new Set([
  "it",
  "its",
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "them",
  "from",
  "for",
  "and",
  "nor",
  "or",
  "of",
  "in",
  "is",
  "are",
  "was",
  "any",
  "anything",
  "something",
  "one",
]);

/**
 * Targeted extraction only — free-form detail text is full of words that look
 * like identifiers, so symbols are read exclusively out of "uses X" /
 * "does not import Y" / "`X` is used|missing|undefined" shapes.
 */
const SYMBOL_PATTERN_RES: readonly RegExp[] = [
  /\buses\s+[`<]{0,2}([A-Za-z_$][\w$]*)/gi,
  /\b(?:import|imports|imported|importing)\s+[`<]{0,2}([A-Za-z_$][\w$]*)/gi,
  /`<?([A-Za-z_$][\w$]*)\s*\/?>?`\s+is\s+(?:used|referenced|missing|undefined|neither|not|never)/gi,
];

function extractSymbolsFromSegment(segment: string): string[] {
  const symbols = new Set<string>();
  for (const pattern of SYMBOL_PATTERN_RES) {
    pattern.lastIndex = 0;
    for (const match of segment.matchAll(pattern)) {
      const symbol = match[1];
      if (!symbol) continue;
      if (SYMBOL_STOP_WORDS.has(symbol.toLowerCase())) continue;
      symbols.add(symbol);
    }
  }
  return [...symbols];
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/^\//, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Symbol is declared locally as a VALUE in the file (not via import). */
function isLocallyValueDeclared(symbol: string, fileContent: string): boolean {
  const declRe = new RegExp(
    `(?:^|[\\s;{}])(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|class|const|let|var|enum)\\s+${escapeRegExp(symbol)}\\b`,
  );
  return declRe.test(fileContent);
}

/** Symbol is declared locally as a TYPE in the file. */
function isLocallyTypeDeclared(symbol: string, fileContent: string): boolean {
  const declRe = new RegExp(
    `(?:^|[\\s;{}])(?:export\\s+)?(?:interface|type)\\s+${escapeRegExp(symbol)}\\b`,
  );
  return declRe.test(fileContent);
}

/**
 * Strip import statements so usage scans don't match the import's own binding
 * list. Conservative: a statement the regexes fail to strip surfaces as a
 * (false) value usage, which KEEPS the finding — never drops it.
 */
function stripImportStatements(code: string): string {
  return code
    .replace(/^[ \t]*import\b[^;'"]*?from\s*["'][^"']+["'][ \t]*;?/gm, "")
    .replace(/^[ \t]*import\s*["'][^"']+["'][ \t]*;?/gm, "");
}

/**
 * True when the file clearly uses the symbol as a runtime VALUE
 * (`new X(...)`, `<X …>`, `X(...)`, `X.member`, bare expression reference).
 * Bugbot on this diff: a `typeOnly` import binding must NOT resolve a
 * missing-import finding when the symbol is still used as a value — tsc would
 * fail exactly as the verifier claimed. Generic type args (`Array<X>`) can
 * false-match the JSX pattern; that only keeps the finding (fail-closed).
 */
function hasClearValueUsage(symbol: string, fileContent: string): boolean {
  const code = stripImportStatements(fileContent);
  const sym = escapeRegExp(symbol);
  const patterns = [
    new RegExp(`\\bnew\\s+${sym}\\b`),
    new RegExp(`<${sym}[\\s/>]`),
    new RegExp(`\\b${sym}\\s*\\(`),
    new RegExp(`\\b${sym}\\.[A-Za-z_$]`),
    new RegExp(`[={,(\\[]\\s*${sym}\\s*[},)\\]]`),
  ];
  return patterns.some((re) => re.test(code));
}

/**
 * Whether `symbol` is resolved in `file`: a VALUE binding/declaration always
 * resolves; a TYPE-ONLY binding/declaration resolves only when the file shows
 * no clear value usage of the symbol.
 */
function isSymbolResolvedInFile(symbol: string, file: FinalProjectFile): boolean {
  const bound = collectImportBoundNames(file.content);
  if (bound.value.has(symbol) || isLocallyValueDeclared(symbol, file.content)) return true;
  const typeOnly = bound.typeOnly.has(symbol) || isLocallyTypeDeclared(symbol, file.content);
  return typeOnly && !hasClearValueUsage(symbol, file.content);
}

interface FileSymbolRef {
  file: string;
  symbols: string[];
}

/**
 * Parse `(file, symbols)` references out of a missing-import finding detail.
 * Multi-file findings use "- <file>: …" bullets (one segment per bullet);
 * single-file findings are one segment. Returns `null` when ANY segment
 * cannot be parsed — the caller then keeps the finding (fail-closed).
 */
function extractFileSymbolRefs(finding: VerifierBlockingFinding): FileSymbolRef[] | null {
  // Canonical parser first — owns the `undefined-jsx-symbol` base wording.
  const parsed = parseUndefinedJsxSymbolFinding(finding);
  if (parsed) return [{ file: parsed.file, symbols: [parsed.symbol] }];

  const bulletLines = finding.detail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  const segments = bulletLines.length > 0 ? bulletLines : [finding.detail];

  const refs: FileSymbolRef[] = [];
  for (const segment of segments) {
    const fileMatch = segment.match(FILE_PATH_RE);
    if (!fileMatch) return null;
    const symbols = extractSymbolsFromSegment(segment);
    if (symbols.length === 0) return null;
    refs.push({ file: fileMatch[1], symbols });
  }
  return refs.length > 0 ? refs : null;
}

/**
 * Files to check for a claimed path: the exact path when present, otherwise
 * every final file sharing its basename. The basename fallback covers merges
 * that relocate a file (`app/…` → `src/app/…`) — a relocated file that STILL
 * misses the import must keep the finding blocking (bugbot on this diff).
 */
function candidateFilesForClaimedPath(
  claimedPath: string,
  filesByPath: ReadonlyMap<string, FinalProjectFile>,
): FinalProjectFile[] {
  const normalized = normalizePath(claimedPath);
  const exact = filesByPath.get(normalized);
  if (exact) return [exact];
  const basename = normalized.split("/").pop() ?? normalized;
  const candidates: FinalProjectFile[] = [];
  for (const [path, file] of filesByPath) {
    if ((path.split("/").pop() ?? path) === basename) candidates.push(file);
  }
  return candidates;
}

function checkMissingImportFinding(
  finding: VerifierBlockingFinding,
  filesByPath: ReadonlyMap<string, FinalProjectFile>,
): ClassCheckVerdict | null {
  const refs = extractFileSymbolRefs(finding);
  if (!refs) return null;

  let sawExistingFile = false;
  for (const ref of refs) {
    const candidates = candidateFilesForClaimedPath(ref.file, filesByPath);
    if (candidates.length === 0) {
      // Neither the claimed path nor any same-named file exists in the
      // persisted project — the claim has no subject in the final content.
      continue;
    }
    sawExistingFile = true;
    for (const file of candidates) {
      for (const symbol of ref.symbols) {
        if (!isSymbolResolvedInFile(symbol, file)) {
          return {
            resolved: false,
            reason: `symbol ${symbol} still unbound in ${file.path}`,
          };
        }
      }
    }
  }
  return {
    resolved: true,
    reason: sawExistingFile
      ? "all referenced symbols are import-bound or declared in the final files"
      : "referenced file(s) absent from the final project",
  };
}

/**
 * Guard for the package.json class (bugbot on this diff): a finding is only
 * eligible when it is ABOUT the manifest — the id must look package-related
 * AND the detail must not reference any code file. Without this, any finding
 * that merely mentions `package.json` in passing (e.g. a product-quality
 * finding) could be dropped on the strength of manifest claims that have
 * nothing to do with its real blocker.
 */
const PACKAGE_CLASS_ID_RE = /(?:package|dependenc|version|script|build|manifest)/i;

/**
 * Subordinate justification/consequence clause after a manifest claim —
 * ", although app/layout.tsx imports Next.js" / ", so app/layout.tsx cannot
 * build or run". The code file there MOTIVATES the manifest claim; it is not
 * an independent claim about the code file. Prod chat `72cbc979` v4+v5
 * (2026-08-11): the merged package.json satisfied every claim, but the
 * justification clause kept the finding outside the package class, so the
 * already-resolved finding kept suppressing promotion on every F3 run.
 *
 * Deliberately narrow: only justification conjunctions (although/though/
 * because/since/so). Coordinating "and" (a genuinely mixed claim) and
 * contrastive while/whereas stay excluded — those clauses can carry an
 * independent code-file blocker the manifest re-check cannot confirm.
 * The inner `\.(?!\s|$)` keeps dots inside filenames (`app/layout.tsx`,
 * `Next.js`) from ending the clause early, so no `absent.tsx`-style artifact
 * survives the strip. Only used for the CLASS-membership test; the claim
 * re-check still reads the full detail.
 */
const MANIFEST_JUSTIFICATION_CLAUSE_RE =
  /[,;—–]\s+(?:although|though|even though|because|since|so(?:\s+that)?)\b(?:[^.;]|\.(?!\s|$))*[.;]?/gi;

function isPackageJsonClassFinding(finding: VerifierBlockingFinding): boolean {
  if (!/package\.json/i.test(finding.detail)) return false;
  if (!PACKAGE_CLASS_ID_RE.test(finding.id)) return false;
  // FILE_PATH_RE only matches code extensions, never `package.json` itself —
  // a hit means the claim is (also) about a code file, not purely the
  // manifest, so it stays outside this class. Justification clauses are
  // stripped first (see MANIFEST_JUSTIFICATION_CLAUSE_RE): a file mentioned
  // only as motivation must not veto the manifest re-check.
  const detailWithoutJustification = finding.detail.replace(
    MANIFEST_JUSTIFICATION_CLAUSE_RE,
    "",
  );
  return !FILE_PATH_RE.test(detailWithoutJustification);
}

/** `name@spec` tokens (`ai@^7`, `@ai-sdk/react@^2.0.3`). */
const VERSION_TOKEN_RE =
  /((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@([~^]?[0-9][0-9A-Za-z.^~<>=*+-]*)/g;

/** Backticked bare npm package names (lowercase by npm rules → never clashes with symbol names like `Resend`). */
const BARE_PACKAGE_RE = /`((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)`/g;

/** Backticked words that look like npm names but are package.json vocabulary. */
const PACKAGE_STOP_WORDS = new Set([
  "package.json",
  "build",
  "dev",
  "start",
  "lint",
  "test",
  "tests",
  "scripts",
  "script",
  "dependencies",
  "devdependencies",
  "peerdependencies",
  "optionaldependencies",
  "main",
  "name",
  "version",
  "versions",
  "type",
  "module",
  "private",
  "npm",
  "json",
]);

/** "lacks X" / "missing X" wording → the claim is about ABSENCE (presence resolves it). */
const LACKS_WORDING_RE =
  /\b(?:lacks?|missing|does\s+not\s+(?:list|declare|include|contain)|not\s+(?:listed|declared|included|present))\b/i;

function majorOf(spec: string | undefined): number | null {
  if (typeof spec !== "string") return null;
  const match = spec.match(/(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function checkPackageJsonFinding(
  finding: VerifierBlockingFinding,
  filesByPath: ReadonlyMap<string, FinalProjectFile>,
): ClassCheckVerdict | null {
  const detail = finding.detail;
  const pkgFile = filesByPath.get("package.json");
  if (!pkgFile) return null;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgFile.content) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (pkg === null || typeof pkg !== "object") return null;

  const scripts =
    pkg.scripts && typeof pkg.scripts === "object"
      ? (pkg.scripts as Record<string, unknown>)
      : {};
  const deps: Record<string, string> = {};
  for (const key of ["dependencies", "devDependencies"] as const) {
    const section = pkg[key];
    if (section && typeof section === "object") {
      for (const [depName, depSpec] of Object.entries(section as Record<string, unknown>)) {
        if (typeof depSpec === "string") deps[depName] = depSpec;
      }
    }
  }

  const claims: Array<{ ok: boolean; label: string }> = [];

  // Claim: missing/broken build scripts.
  if (/\bscripts?\b/i.test(detail)) {
    const hasBuildScript = typeof scripts.build === "string" && scripts.build.trim().length > 0;
    claims.push({ ok: hasBuildScript, label: "build script present" });
  }

  // Claims carrying explicit `name@spec` versions.
  VERSION_TOKEN_RE.lastIndex = 0;
  const versionTokens = [...detail.matchAll(VERSION_TOKEN_RE)].map((match) => ({
    name: match[1],
    spec: match[2],
  }));
  const lacksWording = LACKS_WORDING_RE.test(detail);
  if (versionTokens.length > 0) {
    if (lacksWording) {
      // "lacks foo@^2" → resolved when foo is present (major must not
      // contradict the ask when both sides are parseable).
      const ok = versionTokens.every((token) => {
        const finalSpec = deps[token.name];
        if (finalSpec === undefined) return false;
        const wantedMajor = majorOf(token.spec);
        const finalMajor = majorOf(finalSpec);
        return wantedMajor === null || finalMajor === null || wantedMajor === finalMajor;
      });
      claims.push({ ok, label: "required versioned dependencies present" });
    } else {
      // "pins ai@^7 with @ai-sdk/react@^2 (incompatible)" → the criticized
      // combination must be GONE: at least one member absent or on another
      // major. If every criticized spec still holds, the claim still applies.
      const premiseHolds = versionTokens.every((token) => {
        const finalSpec = deps[token.name];
        if (finalSpec === undefined) return false;
        const criticizedMajor = majorOf(token.spec);
        const finalMajor = majorOf(finalSpec);
        if (criticizedMajor === null || finalMajor === null) return true;
        return criticizedMajor === finalMajor;
      });
      claims.push({ ok: !premiseHolds, label: "criticized version combination gone" });
    }
  }

  // Claims naming bare packages ("direct dependencies for `next`, `react`, …").
  BARE_PACKAGE_RE.lastIndex = 0;
  const versionTokenNames = new Set(versionTokens.map((token) => token.name));
  const bareNames = [...detail.matchAll(BARE_PACKAGE_RE)]
    .map((match) => match[1])
    .filter((name) => !PACKAGE_STOP_WORDS.has(name.toLowerCase()))
    .filter((name) => !versionTokenNames.has(name));
  for (const name of [...new Set(bareNames)]) {
    claims.push({ ok: name in deps, label: `dependency ${name} present` });
  }

  if (claims.length === 0) return null;
  const failed = claims.filter((claim) => !claim.ok);
  if (failed.length > 0) {
    return {
      resolved: false,
      reason: `package.json claim still applies: ${failed[0].label}`,
    };
  }
  return {
    resolved: true,
    reason: "package.json claims satisfied by the merged manifest",
  };
}

/**
 * Re-check verifier blocking findings against the final (merged, persisted)
 * project files. Returns the findings that still apply (`kept`) and the ones
 * mechanically confirmed resolved (`dropped`). Fail-closed: anything that
 * cannot be confirmed resolved is kept.
 */
export function dropResolvedVerifierFindings(
  findings: readonly VerifierBlockingFinding[],
  finalFiles: readonly FinalProjectFile[],
): StaleFindingCheckResult {
  const filesByPath = new Map<string, FinalProjectFile>();
  for (const file of finalFiles) {
    if (typeof file?.path !== "string" || typeof file?.content !== "string") continue;
    filesByPath.set(normalizePath(file.path), file);
  }

  const kept: VerifierBlockingFinding[] = [];
  const dropped: DroppedStaleFinding[] = [];
  for (const finding of findings) {
    let verdict: ClassCheckVerdict | null = null;
    try {
      if (isMissingImportClassId(finding.id)) {
        verdict = checkMissingImportFinding(finding, filesByPath);
      } else if (isPackageJsonClassFinding(finding)) {
        verdict = checkPackageJsonFinding(finding, filesByPath);
      }
    } catch {
      verdict = null;
    }
    if (verdict?.resolved) {
      dropped.push({ id: finding.id, detail: finding.detail, reason: verdict.reason });
    } else {
      kept.push(finding);
    }
  }
  return { kept, dropped };
}
