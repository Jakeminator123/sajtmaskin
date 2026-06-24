/**
 * Regenerate the LUCIDE_ICONS allowlist in
 * `src/lib/gen/data/lucide-icons.ts` from the installed lucide-react package.
 *
 * Policy (must stay in sync with the file header + check-lucide-icons.mjs):
 *   - Source of truth = the lucide-react version that GENERATED PROJECTS ship
 *     (the `lucide-react` pin in `src/lib/gen/export/project-scaffold.ts`).
 *     Keep that pin equal to this repo's `lucide-react` devDependency so the
 *     allowlist, the validator, and the shipped runtime all agree.
  *   - Canonical BASE names only (e.g. `Camera`, `ChevronDown`).
 *   - The `*Icon` aliases (`CameraIcon`) and legacy `Lucide*` aliases
 *     (`LucideCamera`) are intentionally excluded: the `findNearestIcon`
 *     resolver folds them onto the base name (suffix-strip / substring), so
 *     admitting them here would shadow that normalization and break the
 *     resolver contract + its tests.
 *
 * The `LUCIDE_BRAND_ICON_REPLACEMENTS` map and the file header (everything
 * before `export const LUCIDE_ICONS`) are preserved verbatim; only the Set body
 * is rewritten.
 *
 * Usage:  node scripts/dev/generate-lucide-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const iconsFile = join(root, "src", "lib", "gen", "data", "lucide-icons.ts");
const MARKER = "export const LUCIDE_ICONS: Set<string> = new Set([";

const lucide = await import("lucide-react");

const names = Object.keys(lucide)
  .filter((key) => /^[A-Z]/.test(key)) // runtime icon exports are PascalCase
  // Canonical BASE names only. The `findNearestIcon` resolver
  // (src/lib/gen/suspense/rules/lucide-icon-fix.ts) normalizes the alias forms
  // at lookup time — it strips a trailing `Icon` suffix (`MailIcon` -> `Mail`)
  // and resolves a `Lucide*` prefix via substring — so admitting `*Icon` or
  // `Lucide*` entries here would shadow that contract (e.g. exact-matching
  // `MailIcon` instead of folding it to `Mail`). Keep only base names.
  .filter((key) => !key.endsWith("Icon")) // drops `*Icon` aliases AND the generic `Icon`
  .filter((key) => !key.startsWith("Lucide")) // drops legacy `Lucide*` aliases + `LucideProps`
  .sort(); // default code-unit sort matches the committed layout

if (names.length < 1000) {
  throw new Error(
    `Refusing to write: only ${names.length} lucide icons resolved — is lucide-react installed?`,
  );
}

let body = "";
let lastLetter = "";
for (const name of names) {
  const letter = name[0].toUpperCase();
  if (letter !== lastLetter) {
    body += `  // ${letter}\n`;
    lastLetter = letter;
  }
  body += `  ${JSON.stringify(name)},\n`;
}

const src = readFileSync(iconsFile, "utf8");
const markerIndex = src.indexOf(MARKER);
if (markerIndex === -1) {
  throw new Error(`Could not find marker "${MARKER}" in ${iconsFile}`);
}
const prefix = src.slice(0, markerIndex + MARKER.length);
const next = `${prefix}\n${body}]);\n`;
writeFileSync(iconsFile, next, "utf8");

const version = lucide?.default?.version;
console.log(
  `Wrote ${names.length} lucide icon names to lucide-icons.ts` +
    (version ? ` (lucide-react ${version})` : ""),
);
