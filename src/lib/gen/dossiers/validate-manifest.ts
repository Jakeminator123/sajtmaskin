/**
 * Dossier manifest validator — the ONE source of truth for manifest shape.
 *
 * Consolidates three drift-prone contract surfaces:
 *   - docs/schemas/strict/dossier.schema.json (now compiled by AJV here)
 *   - backoffice/pages/dossiers.py _validate_manifest (handwritten Python)
 *   - scripts/dossiers/curate-from-reference.ts assertManifestShape (mini-version)
 *
 * All three now go through this module (backoffice via a small node helper,
 * curate via direct import). Registry uses `validateDossierManifest` to REJECT
 * invalid manifests (returns null → excluded from the pool) so a malformed
 * dossier can't silently participate in prompt injection.
 *
 * See OMTAG/fas2/D-dossier-contract.md for the full contract and rationale.
 */
import Ajv, { type ValidateFunction } from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import dossierSchema from "../../../../docs/schemas/strict/dossier.schema.json";
import { isRuntimeProvidedImport } from "../autofix/runtime-imports";

import { mapDossierPathToOutput } from "./output-path";
import type {
  DossierClass,
  DossierEntry,
  DossierExposes,
  DossierFile,
  DossierMockMode,
} from "./types";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
// Silence repeated `unknown format "uri" ignored in schema` warnings without
// adding the full `ajv-formats` dependency. We don't actually need uri format
// validation here — sourceRepoUrl is curator-supplied and string-typed is
// enough. Registering as no-op just stops the warning at compile time.
ajv.addFormat("uri", true);
const _validate: ValidateFunction = ajv.compile(dossierSchema);

export interface DossierValidationContext {
  /** Directory name; must match manifest.id. */
  expectedId: string;
  /** Folder class (`hard` | `soft`). */
  class: DossierClass;
}

export type DossierValidationOk = {
  valid: true;
  /** Raw manifest cast to the runtime shape once AJV says it's well-formed. */
  data: Omit<DossierEntry, "class" | "instructions">;
  warnings: string[];
};

export type DossierValidationErr = {
  valid: false;
  errors: string[];
};

export type DossierValidationResult = DossierValidationOk | DossierValidationErr;

export type DossierManifest = Pick<DossierEntry, "files">;

export interface ImportClosureIssue {
  dossierFile: string;
  missingImport: string;
  reason: "not_in_files" | "not_in_scaffold";
}

/**
 * Validate a parsed manifest against the strict JSON schema + expected id.
 *
 * Returns `{ valid: true, data, warnings }` when the manifest is usable, or
 * `{ valid: false, errors }` when it must be rejected. `warnings` is a
 * currently-unused channel for non-blocking advisories so callers don't need
 * to reshape their logic when we add soft checks later.
 */
export function validateDossierManifest(
  raw: unknown,
  context: DossierValidationContext,
): DossierValidationResult {
  const errors: string[] = [];

  const ok = _validate(raw);
  if (!ok && _validate.errors) {
    for (const e of _validate.errors) {
      const loc = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "/";
      errors.push(`${loc} ${e.message ?? "invalid"}`);
    }
  }

  if (typeof raw === "object" && raw !== null) {
    const id = (raw as { id?: unknown }).id;
    if (id !== context.expectedId) {
      errors.push(
        `manifest.id (${JSON.stringify(id)}) does not match directory name (${JSON.stringify(
          context.expectedId,
        )})`,
      );
    }
  } else {
    errors.push("manifest must be a JSON object");
  }

  if (errors.length > 0) return { valid: false, errors };

  // Cross-check: every `exposes[].import` of shape `@/<path>` must resolve to
  // a `files[]` entry once `mapDossierPathToOutput` has been applied. Catches
  // the rotorsaks-bug where dossiers shipped with a path/import drift that
  // made verbatim emit at one location while the user-project import looked
  // at another (Jakob 2026-05-01).
  const dataMaybe = raw as { files?: unknown; exposes?: unknown };
  const exposesMismatches = findExposesImportMismatches(
    Array.isArray(dataMaybe.files) ? (dataMaybe.files as DossierFile[]) : [],
    Array.isArray(dataMaybe.exposes) ? (dataMaybe.exposes as DossierExposes[]) : [],
  );
  if (exposesMismatches.length > 0) {
    return {
      valid: false,
      errors: exposesMismatches.map(
        (m) =>
          `exposes[].import "${m.importPath}" does not resolve to any files[].path (after mapDossierPathToOutput) — candidates: ${m.candidates.join(", ") || "(none)"}`,
      ),
    };
  }

  return {
    valid: true,
    data: raw as DossierValidationOk["data"],
    warnings: [],
  };
}

export interface ExposesImportMismatch {
  importPath: string;
  candidates: string[];
}

/**
 * For each `exposes[].import` of shape `@/<rel>` ensure there is at least one
 * `files[].path` entry whose mapped output path matches `<rel>` (with the
 * usual TS/TSX/JS extensions appended). Returns the entries that don't match
 * — empty array means the manifest's exposes contract is internally
 * consistent.
 *
 * The mapping must use the same `mapDossierPathToOutput` that the runtime
 * uses; otherwise the cross-check would itself drift from the system-prompt
 * + verbatim-policy emit path.
 */
export function findExposesImportMismatches(
  files: DossierFile[],
  exposes: DossierExposes[],
): ExposesImportMismatch[] {
  if (exposes.length === 0) return [];

  const outputPaths = files
    .map((f) => (typeof f?.path === "string" ? mapDossierPathToOutput(f.path) : null))
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  const mismatches: ExposesImportMismatch[] = [];
  for (const exp of exposes) {
    if (typeof exp?.import !== "string") continue;
    if (!exp.import.startsWith("@/")) continue;
    const importTarget = exp.import.slice(2);
    const candidates = [
      importTarget,
      `${importTarget}.ts`,
      `${importTarget}.tsx`,
      `${importTarget}.js`,
      `${importTarget}.jsx`,
      `${importTarget}/index.ts`,
      `${importTarget}/index.tsx`,
    ];
    const matched = candidates.some((c) => outputPaths.includes(c));
    if (!matched) {
      mismatches.push({ importPath: exp.import, candidates: outputPaths });
    }
  }
  return mismatches;
}

const CODE_IMPORT_RE = /import\s+(?:[^"']*from\s+)?["']([^"']+)["']/g;
const CODE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/i;
const RESOLUTION_CANDIDATES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
] as const;

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

/**
 * Local copy of cross-file import normalization used in autofix.
 * We intentionally keep this helper local to avoid coupling validator logic
 * to autofix internals.
 */
function normalizeImportToProjectPath(source: string, importerPath: string): string {
  if (source.startsWith("@/")) return source.slice(2);

  const importerDir = importerPath.includes("/")
    ? importerPath.slice(0, importerPath.lastIndexOf("/"))
    : ".";
  const parts = [...importerDir.split("/"), ...source.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

function hasResolvedPath(fileSet: Set<string>, basePath: string): boolean {
  for (const suffix of RESOLUTION_CANDIDATES) {
    const candidate = normalizeFilePath(`${basePath}${suffix}`);
    if (fileSet.has(candidate)) return true;
    if (fileSet.has(normalizeFilePath(`src/${candidate}`))) return true;
  }
  return false;
}

/**
 * Validates transitive import closure for dossier component files.
 *
 * All `@/` and relative imports must resolve to either:
 *  - files inside this dossier manifest (`manifest.files`)
 *  - files provided by the scaffold seed (`scaffoldFileSet`)
 *  - known runtime-provided imports (`isRuntimeProvidedImport`)
 */
export function validateDossierImportClosure(
  manifest: DossierManifest,
  dossierRoot: string,
  scaffoldFileSet: Set<string>,
): ImportClosureIssue[] {
  const issues: ImportClosureIssue[] = [];
  const manifestFiles = manifest.files ?? [];
  // Match both the staged dossier path (components/lib/x.ts) AND the emitted
  // user-project path (lib/x.ts via mapDossierPathToOutput). Imports in
  // dossier code target the EMITTED location (`@/lib/...`), same contract the
  // exposes cross-check above already validates against — without the mapped
  // set, any dossier that imports its own components/lib/ helper would
  // false-fail closure (surfaced by ably-realtime / fal-image-generation).
  const dossierFileSet = new Set(
    manifestFiles.flatMap((f) => [
      normalizeFilePath(f.path),
      normalizeFilePath(mapDossierPathToOutput(f.path)),
    ]),
  );
  const normalizedScaffoldSet = new Set(Array.from(scaffoldFileSet, normalizeFilePath));

  for (const fileEntry of manifestFiles) {
    if (!CODE_FILE_RE.test(fileEntry.path)) continue;

    const fullPath = join(dossierRoot, fileEntry.path);
    if (!existsSync(fullPath)) continue;

    const source = readFileSync(fullPath, "utf8");
    CODE_IMPORT_RE.lastIndex = 0;

    let match: RegExpExecArray | null = null;
    while ((match = CODE_IMPORT_RE.exec(source)) !== null) {
      const importPath = match[1];
      const isProjectImport =
        importPath.startsWith("@/") ||
        importPath.startsWith("./") ||
        importPath.startsWith("../");

      if (!isProjectImport) {
        if (!isRuntimeProvidedImport(importPath)) {
          // External package imports are validated separately via `dependencies`.
          // We intentionally keep this check non-blocking in import-closure.
        }
        continue;
      }

      const normalizedImportPath = normalizeImportToProjectPath(
        importPath,
        normalizeFilePath(fileEntry.path),
      );

      if (hasResolvedPath(dossierFileSet, normalizedImportPath)) continue;
      if (hasResolvedPath(normalizedScaffoldSet, normalizedImportPath)) continue;
      if (
        isRuntimeProvidedImport(importPath) ||
        isRuntimeProvidedImport(`@/${normalizedImportPath}`)
      ) {
        continue;
      }

      issues.push({
        dossierFile: fileEntry.path,
        missingImport: importPath,
        reason: normalizedImportPath.startsWith("app/") ? "not_in_scaffold" : "not_in_files",
      });
    }
  }

  return issues;
}

export interface ModuleLevelSdkIssue {
  dossierFile: string;
  line: number;
  identifier: string;
  packageName: string;
}

const MODULE_LEVEL_DECL_RE = /^(?:export\s+)?(?:const|let|var)\s/;
const IMPORT_STATEMENT_RE = /import\s+(type\s+)?([^'"]+?)\s+from\s+["']([^"']+)["']/g;

/** "@scope/name/sub@1.2" → "@scope/name" · "stripe@^18" → "stripe". */
function dependencyPackageName(dep: string): string {
  const versionAt = dep.startsWith("@") ? dep.indexOf("@", 1) : dep.indexOf("@");
  const withoutVersion = versionAt === -1 ? dep : dep.slice(0, versionAt);
  const parts = withoutVersion.split("/");
  return withoutVersion.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Local binding names introduced by an import clause ("A, { B as C }"). */
function importBindingNames(clause: string): string[] {
  const names: string[] = [];
  const braceMatch = clause.match(/\{([^}]*)\}/);
  if (braceMatch) {
    for (const part of braceMatch[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned || cleaned.startsWith("type ")) continue;
      const asMatch = cleaned.match(/\bas\s+([\w$]+)$/);
      names.push(asMatch ? asMatch[1] : cleaned.split(/\s+/)[0]);
    }
  }
  const outsideBraces = clause.replace(/\{[^}]*\}/, "");
  const nsMatch = outsideBraces.match(/\*\s+as\s+([\w$]+)/);
  if (nsMatch) names.push(nsMatch[1]);
  const defaultMatch = outsideBraces.match(/(?:^|,)\s*([\w$]+)\s*(?:,|$)/);
  if (defaultMatch) names.push(defaultMatch[1]);
  return names;
}

/**
 * Dossier-standard (stabilisering 2026-07, B5 — ägarkrav efter Codex P1 på
 * PR #374): SDK-klienter från dossierns `dependencies` får inte konstrueras
 * ENV-BEROENDE på MODULNIVÅ i dossier-kod. En modulnivå-
 * `new Stripe(process.env.KEY ?? "")` kastar vid import när nyckeln saknas
 * och gör handlerns env-guard (503 `*-not-configured`) onåbar — hela
 * degradation-kontraktet blir dött. Konstruera klienten inne i handlern
 * EFTER env-guarden (lazy init).
 *
 * Heuristik (dokumenterat medvetet enkel): modulnivå = deklaration som börjar
 * på kolumn 0. Flaggar `new <Ident>(…)` samt `create*(-fabriker)` när
 * identifieraren importerats från ett paket i `dependencies` OCH satsen
 * (deklarationsraden + följande rader till satsslut, max 15) refererar
 * `process.env` — env-fria konstruktioner (t.ex. Clerks `createRouteMatcher`
 * med route-mönster) är inte kraschklassen och flaggas inte. Residual:
 * env-nyckel som lästs till en egen modulvariabel före konstruktionen fångas
 * inte — täcks av review/instructions-kontraktet.
 */
export function findModuleLevelSdkConstructions(
  manifest: Pick<DossierEntry, "files" | "dependencies">,
  dossierRoot: string,
): ModuleLevelSdkIssue[] {
  const issues: ModuleLevelSdkIssue[] = [];
  const dependencyPackages = new Set(
    (manifest.dependencies ?? []).map(dependencyPackageName),
  );
  if (dependencyPackages.size === 0) return issues;

  for (const fileEntry of manifest.files ?? []) {
    if (!CODE_FILE_RE.test(fileEntry.path)) continue;
    const fullPath = join(dossierRoot, fileEntry.path);
    if (!existsSync(fullPath)) continue;
    const source = readFileSync(fullPath, "utf8");

    const sdkLocalNames = new Map<string, string>();
    IMPORT_STATEMENT_RE.lastIndex = 0;
    let importMatch: RegExpExecArray | null = null;
    while ((importMatch = IMPORT_STATEMENT_RE.exec(source)) !== null) {
      const [, typeOnly, clause, spec] = importMatch;
      if (typeOnly) continue;
      const pkg = dependencyPackageName(spec);
      if (!dependencyPackages.has(pkg)) continue;
      for (const name of importBindingNames(clause)) {
        sdkLocalNames.set(name, pkg);
      }
    }
    if (sdkLocalNames.size === 0) continue;

    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!MODULE_LEVEL_DECL_RE.test(line)) continue;
      const ctorMatch = line.match(/\bnew\s+([\w$]+)\s*(?:<[^>]*>)?\s*\(/);
      const factoryMatch = line.match(/=\s*(create[\w$]*)\s*\(/);
      const candidate = ctorMatch?.[1] ?? factoryMatch?.[1];
      if (!candidate) continue;
      const pkg = sdkLocalNames.get(candidate);
      if (!pkg) continue;
      // Env-beroende? Läs satsen till dess slut (nästa kolumn-0-rad), max 15
      // rader, och kräv en process.env-referens — annars är konstruktionen
      // env-fri och kan inte krascha på saknad nyckel.
      let statement = line;
      for (let j = i + 1; j < Math.min(lines.length, i + 15); j++) {
        if (/^\S/.test(lines[j])) break;
        statement += `\n${lines[j]}`;
      }
      if (!statement.includes("process.env")) continue;
      issues.push({
        dossierFile: fileEntry.path,
        line: i + 1,
        identifier: candidate,
        packageName: pkg,
      });
    }
  }
  return issues;
}

/**
 * Aggregated cross-dossier check: `defaultForCapability: true` must be unique
 * per capability. Returns a list of error strings (empty if all good).
 *
 * Called by `scripts/dossiers/validate-all.ts`. Not used by registry runtime
 * (which would need the full pool; this is a batch-time invariant).
 */
export function findDuplicateDefaults(
  entries: Array<{ id: string; capability: string; defaultForCapability: boolean }>,
): string[] {
  const byCap = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.defaultForCapability) continue;
    const list = byCap.get(e.capability) ?? [];
    list.push(e.id);
    byCap.set(e.capability, list);
  }
  const errors: string[] = [];
  for (const [cap, ids] of byCap) {
    if (ids.length > 1) {
      errors.push(
        `capability "${cap}" has ${ids.length} dossiers with defaultForCapability=true: ${ids
          .sort()
          .join(", ")} (must be exactly one per capability)`,
      );
    }
  }
  return errors;
}

/**
 * Hard capabilities that are allowed to ship `mock: "none"` — the documented
 * exception list for the fallback-invariant ({@link findMissingMockFallbacks}).
 * Each of these surfaces cannot be faked into a believable keyless F2 demo, so
 * `none` (a discreet `IntegrationConfigNotice` / self-disable) is the correct
 * degradation rather than a bug. Every OTHER hard capability must declare a real
 * demo `mock` mode (`canned` / `seed` / `success`).
 *
 * Owner decision 2026-07-12 (plan: dossier-grupper-och-fallback-kontrakt, akt 4.1).
 * Adding a capability here is a contract choice, not a shortcut: a demo-able
 * capability (DB, CMS, e-post, AI, …) must gain a `mock` mode instead of an entry.
 * The value is the per-capability rationale (kept next to the key so the "why"
 * cannot drift from the list).
 */
export const MOCKLESS_CAPABILITY_EXCEPTIONS: Readonly<Record<string, string>> = {
  payments:
    "Money movement has no honest keyless demo — a fake charge would mislead; renders IntegrationConfigNotice until real keys are set.",
  subscriptions:
    "Recurring billing has the same problem as payments and also needs a signed-in user; no meaningful mock surface.",
  auth: "A mocked login would hand out fake sessions; security-sensitive, so it shows a configuration banner instead of pretend-authenticating.",
  "supabase-auth":
    "Provider-specific auth — same rationale as `auth`; a real session/JWT cannot be faked safely.",
  realtime:
    "Live pub/sub needs a real transport; a mocked socket has nothing to echo, so it degrades to IntegrationConfigNotice.",
  analytics:
    "Fire-and-forget beacons have no visual surface to mock; keys are `warn-only` and the component self-disables when unset.",
  "error-tracking":
    "Same as analytics — an error reporter has no user-facing demo; self-disables without a DSN.",
} as const;

export interface DossierMockFallbackEntry {
  id: string;
  capability: string;
  class: DossierClass;
  defaultForCapability: boolean;
  mock?: DossierMockMode;
}

/**
 * Fallback-invariant (plan: dossier-grupper-och-fallback-kontrakt, etapp 4).
 *
 * Every HARD capability (a capability with ≥1 dossier under `data/dossiers/hard/`)
 * must have exactly one resolvable default dossier whose `mock` mode is ≠ `none`,
 * so the capability has a working F2/preview demo without real keys — UNLESS the
 * capability is on {@link MOCKLESS_CAPABILITY_EXCEPTIONS}. `mock` omitted counts
 * as `none` (per {@link DossierMockMode}).
 *
 * Default resolution is DELIBERATELY STRICTER than runtime selection: CI
 * accepts the single dossier flagged `defaultForCapability: true`, or — when
 * none is flagged — the sole dossier for that capability. "Several dossiers,
 * none flagged" is reported as an error here (no resolvable demo fallback),
 * whereas `select.ts` silently falls back to the first dossier by id-sort in
 * that case. Several flagged defaults are left to
 * {@link findDuplicateDefaults} (already a build failure) and skipped here to
 * avoid double-reporting. Scope is the capability DEFAULT only: non-default
 * provider dossiers may omit `mock` (they degrade to the config-notice path),
 * and exceptions are capability-wide by design — see the invariant section in
 * docs/contracts/dossier-system.md.
 *
 * Pure over the entry list (like {@link findDuplicateDefaults}) — no disk access.
 * Called by `scripts/dossiers/validate-all.ts`.
 */
export function findMissingMockFallbacks(entries: DossierMockFallbackEntry[]): string[] {
  const hardByCap = new Map<string, DossierMockFallbackEntry[]>();
  for (const e of entries) {
    if (e.class !== "hard") continue;
    const list = hardByCap.get(e.capability) ?? [];
    list.push(e);
    hardByCap.set(e.capability, list);
  }

  const errors: string[] = [];
  for (const [cap, dossiers] of hardByCap) {
    // Default resolution runs for EVERY hard capability — including exempt
    // ones. The exception only waives the mock requirement below; an exempt
    // capability with several dossiers and no flagged default is still a
    // missing-default error (Codex P2 on #499: checking the exception first
    // let e.g. `analytics` lose its default silently while select.ts fell
    // back to id-sort — exactly the false-green this invariant exists for).
    const flaggedDefaults = dossiers.filter((d) => d.defaultForCapability);
    let theDefault: DossierMockFallbackEntry | undefined;
    if (flaggedDefaults.length === 1) {
      theDefault = flaggedDefaults[0];
    } else if (flaggedDefaults.length === 0 && dossiers.length === 1) {
      theDefault = dossiers[0];
    } else if (flaggedDefaults.length === 0) {
      errors.push(
        `hard capability "${cap}" has ${dossiers.length} dossiers but none with defaultForCapability=true — no resolvable default demo (candidates: ${dossiers
          .map((d) => d.id)
          .sort()
          .join(", ")})`,
      );
      continue;
    } else {
      // Several flagged defaults → owned by findDuplicateDefaults; skip here.
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(MOCKLESS_CAPABILITY_EXCEPTIONS, cap)) continue;

    if ((theDefault.mock ?? "none") === "none") {
      errors.push(
        `hard capability "${cap}" default dossier "${theDefault.id}" has mock="none" — needs a demo fallback (canned/seed/success) or must be added to MOCKLESS_CAPABILITY_EXCEPTIONS with a rationale`,
      );
    }
  }
  return errors;
}

/**
 * Canonical rubriker for dossier instructions.md. Split into two tiers so
 * existing hand-crafted dossiers (that use domain-specific heading names
 * like "Composition rules" or "Verification checklist") don't get rejected
 * for prose style, only for structural absence.
 *
 * Required (block pool load if missing): high-signal blocks every dossier
 * actually needs to be selectable + integrable.
 *
 * Recommended (warning only): rubriker som guiderar LLM:en men finns ofta
 * insprängt i andra sektioner i handkuraterade dossiers.
 */
export const REQUIRED_INSTRUCTIONS_HEADINGS: readonly string[] = [
  "When to use",
  "How to integrate",
] as const;

export const RECOMMENDED_INSTRUCTIONS_HEADINGS: readonly string[] = [
  "UX rules",
  "Avoid",
  "Verification",
] as const;

/**
 * Partitioned rubrik-check for instructions.md.
 *
 * `missingRequired` → these block validation (registry would reject).
 * `missingRecommended` → surfaced as warnings; dossier still loads.
 *
 * Case-insensitive substring match so "Verification checklist (…)" counts
 * as satisfying "Verification".
 */
export function findMissingInstructionsHeadingsPartitioned(markdown: string): {
  missingRequired: string[];
  missingRecommended: string[];
} {
  const headingsSeen: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    headingsSeen.push(m[1].trim().toLowerCase());
  }
  const hasHeading = (required: string): boolean => {
    const needle = required.toLowerCase();
    return headingsSeen.some((h) => h.includes(needle));
  };
  const missingRequired: string[] = [];
  for (const required of REQUIRED_INSTRUCTIONS_HEADINGS) {
    if (!hasHeading(required)) missingRequired.push(required);
  }
  const missingRecommended: string[] = [];
  for (const recommended of RECOMMENDED_INSTRUCTIONS_HEADINGS) {
    if (!hasHeading(recommended)) missingRecommended.push(recommended);
  }
  return { missingRequired, missingRecommended };
}

/**
 * Back-compat convenience: returns only the blocking list (required).
 * Prefer `findMissingInstructionsHeadingsPartitioned` when you also want
 * the warning channel.
 */
export function findMissingInstructionsHeadings(markdown: string): string[] {
  return findMissingInstructionsHeadingsPartitioned(markdown).missingRequired;
}
