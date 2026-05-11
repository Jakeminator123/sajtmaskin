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
const localEnvPath = path.join(root, ".env.local");
const scaffoldSeoSiteUrlEnv = "SAJTMASKIN_SCAFFOLD_SEO_SITE_URL";

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

function localEnvHasKey(key) {
  if (process.env[key]?.trim()) return true;
  if (!fs.existsSync(localEnvPath)) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=\\s*.+`, "m");
  return pattern.test(fs.readFileSync(localEnvPath, "utf8"));
}

const ok = checkManifest() ?? checkMonolith();
if (!ok) {
  console.error(
    "[check-systemprompt] Need config/codegen-static-prompt.json + prompt-static/*.md, or config/systemprompt.md (not extensionless config/systemprompt)",
  );
  process.exit(1);
}

console.log("[check-systemprompt] OK:", ok);

if (!localEnvHasKey(scaffoldSeoSiteUrlEnv)) {
  console.info(
    `[scaffold] seo_defaults_disabled { reason: '${scaffoldSeoSiteUrlEnv} unset — scaffold SEO files (robots/sitemap/opengraph) and layout metadata enrichment are disabled. Set the env var when promoting to fidelity3.' }`,
  );
}
