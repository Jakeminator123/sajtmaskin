/**
 * Validates that LUCIDE_ICONS does not contain icons missing from the
 * installed lucide-react package. Generated projects intentionally pin
 * lucide-react to the export baseline used by src/lib/gen/data/lucide-icons.ts.
 *
 * Run from repo root: node scripts/dev/check-lucide-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const iconsFile = path.join(root, "src", "lib", "gen", "data", "lucide-icons.ts");

const source = fs.readFileSync(iconsFile, "utf8");
const staticNames = [...source.matchAll(/"([A-Z][A-Za-z0-9]+)"/g)].map((m) => m[1]);

const lucideReactPath = path.join(root, "node_modules", "lucide-react");
if (!fs.existsSync(lucideReactPath)) {
  console.log("[check-lucide-icons] SKIP: lucide-react not installed");
  process.exit(0);
}

const lr = await import("lucide-react");
const packageExports = new Set(Object.keys(lr).filter((k) => /^[A-Z]/.test(k)));

const missing = staticNames.filter((name) => !packageExports.has(name));

if (missing.length > 0) {
  console.error(
    `[check-lucide-icons] FAIL: ${missing.length} icon(s) in LUCIDE_ICONS are not exported by installed lucide-react:`,
  );
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nFix: remove these from LUCIDE_ICONS in src/lib/gen/data/lucide-icons.ts",
    "and add them to LUCIDE_BRAND_ICON_REPLACEMENTS if they need a mapping.",
  );
  process.exit(1);
}

console.log(`[check-lucide-icons] OK: all ${staticNames.length} icons verified against installed package`);
