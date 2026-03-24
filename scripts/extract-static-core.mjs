/**
 * Maintenance: extract STATIC_CORE template literal from system-prompt.ts into config/systemprompt.md (repo root).
 * Run: node scripts/extract-static-core.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcPath = path.join(root, "src", "lib", "gen", "system-prompt.ts");
const outPath = path.join(root, "config", "systemprompt.md");

const s = fs.readFileSync(srcPath, "utf8");
const marker = "export const STATIC_CORE = `";
const start = s.indexOf(marker);
if (start === -1) {
  console.info(
    "No STATIC_CORE template in system-prompt.ts — static prompt already lives in config/systemprompt.md.",
  );
  process.exit(0);
}

let i = start + marker.length;
let out = "";
while (i < s.length) {
  const c = s[i];
  if (c === "\\") {
    if (i + 1 >= s.length) {
      out += c;
      i++;
      continue;
    }
    const n = s[i + 1];
    if (n === "`") {
      out += "`";
      i += 2;
      continue;
    }
    if (n === "\\") {
      out += "\\";
      i += 2;
      continue;
    }
    if (n === "$" && i + 2 < s.length && s[i + 2] === "{") {
      console.error("STATIC_CORE contains interpolation");
      process.exit(1);
    }
    out += c;
    i++;
    continue;
  }
  if (c === "`") break;
  out += c;
  i++;
}

if (i >= s.length || s[i] !== "`") {
  console.error("Unterminated template");
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote", outPath, "(" + out.length + " chars)");





