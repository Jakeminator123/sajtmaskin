/**
 * Validates that every font name referenced in scaffold variant `fontPairings`
 * is registered in `src/lib/gen/data/google-font-registry.ts`.
 *
 * Catches drift between scaffold variant JSON files (which use human-readable
 * displayName, e.g. "Plus Jakarta Sans") and the canonical Google font registry
 * (which exports both import keys and displayNames).
 *
 * CLI:
 *   npx tsx scripts/typography/validate-font-pairings.ts
 *   npm run typography:validate-pairings
 *
 * Exit code 0 when all variants resolve cleanly, 1 when any violation is
 * detected. Pure validation logic is exported for unit testing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GOOGLE_FONT_IMPORT_NAMES,
  GOOGLE_FONT_REGISTRY,
} from "../../src/lib/gen/data/google-font-registry";

export type FontPairingViolation = {
  variantFile: string;
  pairingIndex: number;
  fontField: string;
  fontName: string;
};

export type VariantInput = {
  filePath: string;
  pairings: unknown;
};

/**
 * Build the set of accepted font names from the registry.
 *
 * Accepts both the import key (e.g. "Plus_Jakarta_Sans") and the displayName
 * (e.g. "Plus Jakarta Sans"); scaffold variants conventionally use displayName,
 * but we tolerate either to avoid false positives if a variant references the
 * import key form. Matching is case-insensitive.
 */
export function buildKnownFontNameSet(
  registry: Record<string, { displayName: string }> = GOOGLE_FONT_REGISTRY,
  importNames: ReadonlySet<string> = GOOGLE_FONT_IMPORT_NAMES,
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const importName of importNames) {
    set.add(importName.toLowerCase());
  }
  for (const entry of Object.values(registry)) {
    set.add(entry.displayName.toLowerCase());
  }
  return set;
}

const PAIRING_FIELDS = ["heading", "body"] as const;

/**
 * Pure validator. Given a list of variant inputs and a set of known font
 * names, return any violations. Caller is responsible for IO + reporting.
 */
export function validateVariantFonts(
  variants: ReadonlyArray<VariantInput>,
  knownFontNames: ReadonlySet<string>,
): FontPairingViolation[] {
  const violations: FontPairingViolation[] = [];

  for (const variant of variants) {
    const pairings = variant.pairings;
    if (!Array.isArray(pairings)) continue;

    for (let pairingIndex = 0; pairingIndex < pairings.length; pairingIndex++) {
      const pairing = pairings[pairingIndex];
      if (!pairing || typeof pairing !== "object") continue;

      for (const field of PAIRING_FIELDS) {
        const fontName = (pairing as Record<string, unknown>)[field];
        if (typeof fontName !== "string" || fontName.trim() === "") continue;

        if (!knownFontNames.has(fontName.toLowerCase())) {
          violations.push({
            variantFile: variant.filePath,
            pairingIndex,
            fontField: field,
            fontName,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Recursively collect *.json files under a root directory. Mirrors the
 * shape of the original glob `config/scaffold-variants/** /*.json` without
 * pulling in a glob dependency.
 */
function collectJsonFiles(rootDir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(rootDir)) return out;

  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function relPath(p: string): string {
  return path.relative(process.cwd(), p).replace(/\\/g, "/");
}

/**
 * Discover all variant files under `config/scaffold-variants/` and return them
 * as `VariantInput` records (parsed lazily; malformed JSON is reported as a
 * load error, not a font violation).
 */
export function loadVariantInputs(rootDir: string): {
  variants: VariantInput[];
  loadErrors: { filePath: string; error: string }[];
} {
  const variants: VariantInput[] = [];
  const loadErrors: { filePath: string; error: string }[] = [];

  for (const file of collectJsonFiles(rootDir)) {
    if (file.includes(`${path.sep}_index${path.sep}`)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      loadErrors.push({
        filePath: file,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const pairings = (parsed as Record<string, unknown>).fontPairings;
    if (pairings === undefined) continue;
    if (!Array.isArray(pairings)) {
      loadErrors.push({
        filePath: file,
        error: "fontPairings must be an array",
      });
      continue;
    }
    variants.push({ filePath: file, pairings });
  }

  return { variants, loadErrors };
}

async function main(): Promise<void> {
  const rootDir = path.resolve(process.cwd(), "config/scaffold-variants");

  if (!fs.existsSync(rootDir)) {
    console.error(
      `[typography:validate-pairings] root directory not found: ${relPath(rootDir)}`,
    );
    process.exit(1);
  }

  const { variants, loadErrors } = loadVariantInputs(rootDir);
  const known = buildKnownFontNameSet();
  const violations = validateVariantFonts(variants, known);

  console.info(
    `[typography:validate-pairings] scanned ${variants.length} variant file(s) under ${relPath(rootDir)}`,
  );

  if (loadErrors.length > 0) {
    console.error(
      `[typography:validate-pairings] ${loadErrors.length} variant file(s) could not be parsed:`,
    );
    for (const err of loadErrors) {
      console.error(`  - ${relPath(err.filePath)}: ${err.error}`);
    }
    process.exit(1);
  }

  if (variants.length === 0) {
    console.error(
      `[typography:validate-pairings] no variant files with fontPairings found under ${relPath(rootDir)}`,
    );
    process.exit(1);
  }

  if (violations.length === 0) {
    console.info("[typography:validate-pairings] OK — no missing fonts.");
    process.exit(0);
  }

  console.error(
    `[typography:validate-pairings] ${violations.length} font reference(s) are NOT in google-font-registry.ts:`,
  );

  const grouped = new Map<string, FontPairingViolation[]>();
  for (const v of violations) {
    const key = relPath(v.variantFile);
    const list = grouped.get(key) ?? [];
    list.push(v);
    grouped.set(key, list);
  }

  for (const [file, list] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`  ${file}`);
    for (const v of list) {
      console.error(
        `    - fontPairings[${v.pairingIndex}].${v.fontField} = ${JSON.stringify(v.fontName)}`,
      );
    }
  }

  console.error(
    "\nFix by either (a) updating the variant to use a registered font name, " +
      "or (b) adding the font to src/lib/gen/data/google-font-registry.ts.",
  );
  process.exit(1);
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return import.meta.url === `file://${entry}`;
  }
})();

if (invokedDirectly) {
  void main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Re-exported for tests that want to know the module's own filesystem location.
export const __MODULE_FILENAME__ = fileURLToPath(import.meta.url);
