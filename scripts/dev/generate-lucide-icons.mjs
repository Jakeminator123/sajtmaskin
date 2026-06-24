/**
 * Regenerate the LUCIDE_ICONS allowlist in
 * `src/lib/gen/data/lucide-icons.ts` from the installed lucide-react package.
 *
 * Policy (must stay in sync with the file header + check-lucide-icons.mjs):
 *   - Source of truth = the lucide-react version that GENERATED PROJECTS ship
 *     (the `lucide-react` pin in `src/lib/gen/export/project-scaffold.ts`).
 *     Keep that pin equal to this repo's `lucide-react` devDependency so the
 *     allowlist, the validator, and the shipped runtime all agree.
 *   - Include the two identifier forms shadcn/ui and the LLM actually emit:
 *       • base name      (e.g. `Camera`, `ChevronDown`)
 *       • `*Icon` alias  (e.g. `CameraIcon`, `ChevronDownIcon`)
 *   - Exclude the legacy `Lucide*` prefix aliases (e.g. `LucideCamera`) and the
 *     generic `Icon` export — neither is emitted in practice and they only bloat
 *     the set.
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
  .filter((key) => !key.startsWith("Lucide")) // drop legacy `Lucide*` aliases + `LucideIcon`
  .filter((key) => key !== "Icon") // drop the generic factory-less `Icon` export
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
