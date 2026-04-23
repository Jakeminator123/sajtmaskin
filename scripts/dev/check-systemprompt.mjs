/**
 * Validates own-engine static prompt: manifest + fragments, or monolithic fallback.
 * Run from repo root: node scripts/dev/check-systemprompt.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const MIN_CHARS = 500;

const coreManifestPath = path.join(root, "config", "codegen-core-manifest.json");
const legacyManifestPath = path.join(root, "config", "codegen-static-prompt.json");

function checkManifestFile(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    console.error("[check-systemprompt] Invalid JSON:", manifestPath);
    process.exit(1);
  }
  const fr = parsed.fragments;
  if (!Array.isArray(fr) || fr.length === 0) return null;

  const parts = [];
  for (const rel of fr) {
    if (typeof rel !== "string" || rel.includes("..")) {
      console.error("[check-systemprompt] Bad fragment entry:", rel);
      process.exit(1);
    }
    const fp = path.join(root, "config", ...rel.split("/"));
    if (!fs.existsSync(fp)) {
      console.error("[check-systemprompt] Missing fragment:", rel);
      process.exit(1);
    }
    parts.push(fs.readFileSync(fp, "utf8"));
  }
  const sep = typeof parsed.fragmentSeparator === "string" ? parsed.fragmentSeparator : "\n\n";
  const text = parts.map((p) => p.replace(/^\uFEFF/, "").trimEnd()).join(sep);
  if (text.trim().length < MIN_CHARS) {
    console.error("[check-systemprompt] Concatenated static prompt too short.");
    process.exit(1);
  }
  return path.relative(root, manifestPath);
}

function checkManifest() {
  return checkManifestFile(coreManifestPath) ?? checkManifestFile(legacyManifestPath);
}

const monolithCandidates = [
  path.join(root, "config", "systemprompt.md"),
  path.join(root, "src", "config", "systemprompt"),
  path.join(root, "scripts", "systemprompt"),
];

function checkMonolith() {
  for (const fp of monolithCandidates) {
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) continue;
    const text = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
    if (text.trim().length < MIN_CHARS) continue;
    return path.relative(root, fp);
  }
  return null;
}

const ok = checkManifest() ?? checkMonolith();
if (!ok) {
  console.error(
    "[check-systemprompt] Need config/codegen-core-manifest.json + config/prompt-core/*.md (canonical since 2026-04-18), or config/systemprompt.md fallback (not extensionless config/systemprompt). Legacy codegen-static-prompt.json + prompt-static/ are removed.",
  );
  process.exit(1);
}

console.log("[check-systemprompt] OK:", ok);
