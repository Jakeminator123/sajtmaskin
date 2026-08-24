#!/usr/bin/env node
/**
 * Control-plane registry validator.
 *
 * Validates config/control-plane/{schema,policy}-registry.json against
 * docs/schemas/strict/control-plane-registry.schema.json (JSON Schema 2020-12)
 * and enforces the cross-cutting invariants documented in
 * config/control-plane/README.md:
 *
 *   - every `sourceOfTruth` resolves: base path exists on disk (globs match
 *     >=1 file); a `#fragment` on a JSON base resolves to a defined key (so a
 *     renamed/removed/typo'd fragment can't pass just because the file exists);
 *   - non-null `validator` names an existing package.json script;
 *   - no duplicate `id` within a registry;
 *   - no duplicate `id` across the two registries;
 *   - every committed strict schema/spec has exactly one explicit registry row;
 *   - `ciStatus: hard` requires a non-null `validator`;
 *   - `runtimeEnforced: false` requires non-empty `notes`;
 *   - `runtimeEnforced: true` requires a non-null `validator` OR an explicit
 *     non-empty `validatorWaiver` (so a runtime-wired, editable policy can never
 *     ship with no structural guarantee and no documented reason why);
 *   - `runtimeEnforced` and `runtimeStatus: wired` agree in both directions;
 *   - a known-authority allowlist is present (the map can't silently forget a
 *     key file).
 *
 * Exits 1 on any failure, 0 otherwise. Run via `npm run control-plane:check`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCHEMA_PATH = "docs/schemas/strict/control-plane-registry.schema.json";
const REGISTRIES = [
  {
    name: "schema-registry",
    file: "config/control-plane/schema-registry.json",
    requiredIds: [
      "backoffice-domain-map-schema",
      "ai-models-manifest",
      "env-server-schema",
      "db-schema",
      "dossier-manifest-schema",
      "scaffold-manifests",
      "embeddings-blob-manifest-schema",
      "variant-template-addenda-schema",
      "control-plane-registry-schema",
      "agent-workflow-schema",
    ],
  },
  {
    name: "policy-registry",
    file: "config/control-plane/policy-registry.json",
    requiredIds: [
      "backoffice-domain-map",
      "env-policy",
      "manifest-repair-policies",
      "manifest-pre-generation-contracts",
      "manifest-per-tier-briefing",
      "embeddings-blob-manifest-runtime",
      "variant-template-addenda-runtime",
      "prompt-heuristic-tokens",
      "tier3-sdk-deny",
      "naming-dictionary",
      "agent-context-policy",
      "agent-workflow-policy",
    ],
  },
];

/** Failures accumulate here; non-empty => exit 1. */
const failures = [];
/** One-line check results for the summary. */
const checks = [];
const allIds = new Map();
const allEntries = [];

function fail(registry, msg) {
  failures.push(`[${registry}] ${msg}`);
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8"));
}

function validateRepoRelativePath(raw, { allowFragment = false, allowGlob = false } = {}) {
  if (typeof raw !== "string" || raw.length === 0) return "must be a non-empty string";
  const hashIndex = raw.indexOf("#");
  if (!allowFragment && hashIndex !== -1) return "must not contain a fragment";
  if (hashIndex !== -1 && raw.indexOf("#", hashIndex + 1) !== -1) return "has multiple fragments";
  const base = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : raw.slice(hashIndex + 1);
  if (fragment && !/^[A-Za-z0-9_.-]+$/.test(fragment)) return "has an invalid fragment";
  if (path.isAbsolute(base) || /^[A-Za-z]:/.test(base)) return "must be repo-relative";
  if (base.includes("\\")) return "must use forward slashes";
  const segments = base.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "contains an empty, dot or parent segment";
  }
  if (!allowGlob && base.includes("*")) return "must not contain a glob";
  const resolved = path.resolve(REPO_ROOT, ...segments);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "resolves outside the repo";
  return null;
}

/** Escape regex metacharacters except `*`, which becomes `[^/]*`. */
function segmentToRegExp(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

/** Minimal single-segment glob (`*`, no `**`) relative to REPO_ROOT. */
function globHasMatch(pattern) {
  const segments = pattern.split("/").filter(Boolean);
  let current = [REPO_ROOT];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const next = [];
    if (seg.includes("*")) {
      const re = segmentToRegExp(seg);
      for (const dir of current) {
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!re.test(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (isLast) next.push(full);
          else if (entry.isDirectory()) next.push(full);
        }
      }
    } else {
      for (const dir of current) {
        const full = path.join(dir, seg);
        if (!fs.existsSync(full)) continue;
        if (isLast) next.push(full);
        else if (fs.statSync(full).isDirectory()) next.push(full);
      }
    }
    current = next;
    if (current.length === 0) return false;
  }
  return current.length > 0;
}

/**
 * Resolve a source-of-truth reference (`path`, `path#fragment`, or glob).
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }`. For a `file.json#fragment`
 * reference the base file must exist AND the dot-separated fragment must resolve
 * to a defined node. Previously the `#fragment` was stripped and only the base
 * file was checked, so a renamed/removed/typo'd key (e.g.
 * `manifest.json#repairPolices`) passed as long as the file existed — a
 * false-green in the self-validating map (#202). Fragments are only valid for
 * concrete JSON/JSONC files; a fragment on code or a glob has no executable
 * resolution contract and is rejected.
 */
function resolveSource(sourceOfTruth) {
  const pathError = validateRepoRelativePath(sourceOfTruth, {
    allowFragment: true,
    allowGlob: true,
  });
  if (pathError) return { ok: false, reason: pathError };
  const hashIdx = sourceOfTruth.indexOf("#");
  const base = hashIdx === -1 ? sourceOfTruth : sourceOfTruth.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? "" : sourceOfTruth.slice(hashIdx + 1);

  if (base.includes("*")) {
    if (fragment) {
      return { ok: false, reason: `fragment references cannot use a glob: ${sourceOfTruth}` };
    }
    return globHasMatch(base)
      ? { ok: true }
      : { ok: false, reason: `glob matched no files: ${base}` };
  }

  const abs = path.join(REPO_ROOT, base);
  if (!fs.existsSync(abs)) return { ok: false, reason: `not found on disk: ${base}` };

  if (!fragment) return { ok: true };
  if (!/\.jsonc?$/i.test(base)) {
    return { ok: false, reason: `fragment references require a JSON/JSONC file: ${base}` };
  }

  let json;
  try {
    json = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    return { ok: false, reason: `could not parse ${base} for "#${fragment}": ${err.message}` };
  }

  let node = json;
  for (const key of fragment.split(".")) {
    if (
      node == null ||
      typeof node !== "object" ||
      !Object.prototype.hasOwnProperty.call(node, key)
    ) {
      return { ok: false, reason: `fragment "#${fragment}" missing in ${base} (no "${key}")` };
    }
    node = node[key];
  }
  return { ok: true };
}

function normalizeScriptName(validator) {
  return validator
    .replace(/^npm run /, "")
    .replace(/^npm:/, "")
    .trim();
}

// --- Load shared inputs ------------------------------------------------------

let pkgScripts = {};
try {
  pkgScripts = readJson("package.json").scripts ?? {};
} catch (err) {
  failures.push(`[package.json] could not read scripts: ${err.message}`);
}

let validateRegistry = null;
try {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  validateRegistry = ajv.compile(readJson(SCHEMA_PATH));
  checks.push("OK   schema compiled (control-plane-registry.schema.json)");
} catch (err) {
  failures.push(`[schema] could not compile ${SCHEMA_PATH}: ${err.message}`);
}

// --- Per-registry checks -----------------------------------------------------

let totalEntries = 0;

for (const registry of REGISTRIES) {
  let data;
  try {
    data = readJson(registry.file);
  } catch (err) {
    fail(registry.name, `could not read/parse ${registry.file}: ${err.message}`);
    continue;
  }

  // JSON Schema validation.
  if (validateRegistry) {
    if (validateRegistry(data)) {
      checks.push(`OK   ${registry.name}: schema-valid`);
    } else {
      checks.push(`FAIL ${registry.name}: schema-invalid`);
      for (const e of validateRegistry.errors ?? []) {
        fail(registry.name, `schema: ${e.instancePath || "/"} ${e.message}`);
      }
    }
  }

  const entries = Array.isArray(data.entries) ? data.entries : [];
  allEntries.push(...entries);
  totalEntries += entries.length;

  // Duplicate ids.
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) fail(registry.name, `duplicate id "${entry.id}"`);
    seen.add(entry.id);
    const previousRegistry = allIds.get(entry.id);
    if (previousRegistry) {
      fail(registry.name, `duplicate id "${entry.id}" also exists in ${previousRegistry}`);
    } else {
      allIds.set(entry.id, registry.name);
    }
  }

  // Per-entry invariants.
  for (const entry of entries) {
    const id = entry.id ?? "<no-id>";

    const sourceCheck = resolveSource(entry.sourceOfTruth);
    if (!sourceCheck.ok) {
      fail(registry.name, `${id}: sourceOfTruth ${sourceCheck.reason}`);
    }

    if (entry.backoffice?.writePath != null) {
      const writePathError = validateRepoRelativePath(entry.backoffice.writePath, {
        allowGlob: true,
      });
      if (writePathError) {
        fail(registry.name, `${id}: backoffice.writePath ${writePathError}`);
      }
    }

    if (entry.validator != null) {
      const script = normalizeScriptName(entry.validator);
      if (!Object.prototype.hasOwnProperty.call(pkgScripts, script)) {
        fail(registry.name, `${id}: validator "${entry.validator}" is not a package.json script`);
      }
    }

    if (entry.ciStatus === "hard" && entry.validator == null) {
      fail(registry.name, `${id}: hard gate without validator`);
    }

    if (entry.runtimeEnforced === false && (!entry.notes || !String(entry.notes).trim())) {
      fail(registry.name, `${id}: runtimeEnforced=false requires non-empty notes`);
    }

    const isWired = entry.runtimeStatus === "wired";
    if (entry.runtimeEnforced !== isWired) {
      fail(
        registry.name,
        `${id}: runtimeEnforced must be true exactly when runtimeStatus is "wired"`,
      );
    }

    if (
      entry.runtimeEnforced === true &&
      entry.validator == null &&
      !(entry.validatorWaiver && String(entry.validatorWaiver).trim())
    ) {
      fail(
        registry.name,
        `${id}: runtimeEnforced=true requires a validator or an explicit validatorWaiver`,
      );
    }
  }

  // Known-authority allowlist.
  for (const requiredId of registry.requiredIds) {
    if (!seen.has(requiredId)) {
      fail(registry.name, `missing known-authority id "${requiredId}"`);
    }
  }
  checks.push(
    `OK   ${registry.name}: ${entries.length} entries, ${registry.requiredIds.length} known-authority ids checked`,
  );
}

const schemaRegistry = readJson("config/control-plane/schema-registry.json");
const strictDirectory = path.join(REPO_ROOT, "docs", "schemas", "strict");
const strictSources = fs
  .readdirSync(strictDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".schema.json"))
  .map((entry) => `docs/schemas/strict/${entry.name}`)
  .sort();
const strictRows = new Map();
for (const entry of schemaRegistry.entries) {
  const base = entry.sourceOfTruth.split("#")[0];
  if (!base.startsWith("docs/schemas/strict/") || base.includes("*")) continue;
  const ids = strictRows.get(base) ?? [];
  ids.push(entry.id);
  strictRows.set(base, ids);
}
for (const source of strictSources) {
  const owners = strictRows.get(source) ?? [];
  if (owners.length !== 1) {
    fail(
      "schema-registry",
      `${source}: expected exactly one explicit registry row, found ${owners.length}`,
    );
  }
}
for (const [source] of strictRows) {
  if (!strictSources.includes(source)) {
    fail("schema-registry", `${source}: registry row points outside the strict-schema inventory`);
  }
}
checks.push(`strict-schema inventory: ${strictSources.length} files explicitly owned`);

// PAGE_SPECS is declarative Python source, but importing it would eagerly load
// every Streamlit page. Extract only the first PageSpec string argument so this
// repository metadata check stays side-effect free and environment-independent.
const pageRegistrySource = fs.readFileSync(
  path.join(REPO_ROOT, "backoffice", "pages", "__init__.py"),
  "utf8",
);
const pageNames = new Set(
  [...pageRegistrySource.matchAll(/PageSpec\((?:\s|#[^\r\n]*(?:\r?\n|$))*["']([^"']+)["']/g)].map(
    (match) => match[1],
  ),
);
if (pageNames.size === 0) {
  fail("control-plane", "could not extract any Backoffice PAGE_SPECS names");
}
for (const entry of allEntries) {
  const surface = entry.backoffice?.surface;
  if (surface != null && !pageNames.has(surface)) {
    fail("control-plane", `${entry.id}: unknown Backoffice surface "${surface}"`);
  }
}
checks.push(`Backoffice surfaces: ${pageNames.size} PAGE_SPECS names checked`);

// --- Report ------------------------------------------------------------------

console.log("control-plane:check");
console.log("-------------------");
for (const line of checks) console.log(line);
console.log(`entries scanned: ${totalEntries}`);

if (failures.length > 0) {
  console.error("");
  console.error(`FAILED (${failures.length} problem${failures.length === 1 ? "" : "s"}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("");
console.log("All control-plane checks passed.");
process.exit(0);
