/**
 * Fail CI if committed generated artifacts contain machine-specific paths or
 * legacy research/ path segments. Run from repo root:
 *   node src/lib/gen/template-library/verify-generated-paths.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

const BAD_SUBSTRINGS = [
  "C:\\Users",
  "C:/Users/",
  "/Users/jakem/",
  "research/external-templates",
  "research\\external-templates",
];

const FILES_TO_SCAN = [
  "src/lib/gen/template-library/template-library.generated.json",
  "src/lib/gen/scaffolds/scaffold-research.generated.json",
];

function scanText(relPath, text) {
  const problems = [];
  for (const bad of BAD_SUBSTRINGS) {
    if (text.includes(bad)) {
      problems.push(`contains forbidden substring: ${JSON.stringify(bad)}`);
    }
  }
  if (problems.length) {
    return [`${relPath}: ${problems.join("; ")}`];
  }
  return [];
}

function walkDossierManifests() {
  const root = path.join(WORKSPACE_ROOT, "scaffold-pipeline/dossiers");
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const name of fs.readdirSync(root)) {
    const manifestPath = path.join(root, name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const text = fs.readFileSync(manifestPath, "utf-8");
    out.push(...scanText(`scaffold-pipeline/dossiers/${name}/manifest.json`, text));
  }
  return out;
}

function main() {
  const errors = [];
  for (const rel of FILES_TO_SCAN) {
    const abs = path.join(WORKSPACE_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf-8");
    errors.push(...scanText(rel, text));
  }
  errors.push(...walkDossierManifests());

  if (errors.length > 0) {
    console.error("[verify-generated-paths] FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    console.error(
      "\nFix: run `npm run normalize:generated-paths`, or regenerate with `npm run template-library:build` after discovery data exists.",
    );
    process.exit(1);
  }
  console.info("[verify-generated-paths] ok");
}

main();
