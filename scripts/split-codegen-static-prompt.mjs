/**
 * One-off / maintenance: split config/systemprompt.md on top-level ## headings
 * into config/prompt-static/*.md and write config/codegen-static-prompt.json
 *
 * Run: node scripts/split-codegen-static-prompt.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcPath = path.join(root, "config", "systemprompt.md");
const outDir = path.join(root, "config", "prompt-static");
const manifestPath = path.join(root, "config", "codegen-static-prompt.json");

if (!fs.existsSync(srcPath)) {
  console.error("Missing", srcPath);
  process.exit(1);
}

const text = fs.readFileSync(srcPath, "utf8").replace(/^\uFEFF/, "");
const lines = text.split(/\n/);

const sections = [];
let bucket = { headingLine: null, lines: [] };

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

for (const line of lines) {
  if (/^## /.test(line)) {
    sections.push(bucket);
    bucket = { headingLine: line, lines: [line] };
  } else {
    bucket.lines.push(line);
  }
}
sections.push(bucket);

const slugCounts = new Map();
const manifestFragments = [];

fs.mkdirSync(outDir, { recursive: true });

let index = 0;
for (const sec of sections) {
  const title = sec.headingLine ? sec.headingLine.slice(3).trim() : "intro";
  let base = sec.headingLine ? slugify(title) : "intro";
  const seen = (slugCounts.get(base) ?? 0) + 1;
  slugCounts.set(base, seen);
  if (seen > 1) base = `${base}-${seen}`;

  const fileName = `${String(index).padStart(2, "0")}-${base}.md`;
  index++;

  const body = sec.lines.join("\n").trimEnd() + "\n";
  const rel = `prompt-static/${fileName}`;
  fs.writeFileSync(path.join(outDir, fileName), body, "utf8");
  manifestFragments.push(rel);
}

const manifest = {
  fragmentSeparator: "\n\n",
  fragments: manifestFragments,
  editorNotes: {
    purpose:
      "Lists Markdown fragments concatenated (in order) into the STATIC half of the own-engine system prompt. The DYNAMIC half is built in code (buildDynamicContext) and is never edited here.",
    doNotPutInTheseFiles: [
      "Per-request custom instructions from the builder UI",
      "Build-intent bullet lists (template / website / app)",
      "Full scaffold JSON or serialized scaffold body",
      "Route plan, pre-generation contracts, template-library matches",
      "Structured brief fields from deep brief (unless you intentionally duplicate — avoid)",
    ],
    implementation: "src/lib/gen/static-core-loader.ts",
  },
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("Wrote", manifestFragments.length, "fragments under config/prompt-static/");
console.log("Wrote", manifestPath);
