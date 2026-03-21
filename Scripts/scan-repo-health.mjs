/**
 * Repo health scan: leaked machine paths, legacy path segments, merge markers.
 *
 * Default: scans src/, config/, Scripts/.
 * --all scans the whole workspace (still skips node_modules, .git, build output).
 *
 *   node Scripts/scan-repo-health.mjs
 *   node Scripts/scan-repo-health.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "..");

const DEFAULT_REL_ROOTS = ["src", "config", "Scripts"];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  "dist",
  "build",
  ".turbo",
  "coverage",
  "playwright-report",
  "test-results",
  "__pycache__",
  ".venv",
  "venv",
  "discovery",
  "repo-cache",
]);

const SKIP_FILE_NAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

const SKIP_PATH_PREFIXES = [
  "docs/old/",
  "research/",
  "internt_jakob/",
  ".cursor/",
  "node_modules/",
];

const SELF_AND_VERIFIER = new Set([
  "Scripts/scan-repo-health.mjs",
  "src/lib/gen/template-library/verify-generated-paths.mjs",
  "src/lib/gen/template-library/normalize-generated-paths.mjs",
]);

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp4", ".webm", ".pdf", ".zip", ".gz", ".parquet", ".wasm",
  ".so", ".dll", ".exe",
]);

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".mdc", ".yml", ".yaml", ".toml",
  ".css", ".scss", ".html", ".txt", ".env", ".py", ".rs", ".go",
  ".sql", ".sh", ".ps1", ".ini", ".svg",
]);

const MAX_FILE_BYTES = 4 * 1024 * 1024;

const FORBIDDEN_SUBSTRINGS = [
  { id: "win-user-path", pattern: "C:\\\\Users\\\\", hint: "Windows user path (leaked machine path)" },
  { id: "win-user-path-alt", pattern: "C:/Users/", hint: "Windows user path (forward slashes)" },
  { id: "mac-home", pattern: "/Users/jakem/", hint: "Hardcoded home path segment" },
  {
    id: "legacy-research",
    pattern: "research/external-templates",
    hint: "Legacy path segment in code/data (remove or replace with current layout)",
  },
];

function shouldSkipPath(rel) {
  const n = rel.replace(/\\/g, "/");
  for (const p of SKIP_PATH_PREFIXES) {
    if (n.startsWith(p) || n.includes("/" + p)) return true;
  }
  if (SELF_AND_VERIFIER.has(n)) return true;
  return false;
}

function shouldSkipDirName(name, rel) {
  if (SKIP_DIR_NAMES.has(name)) return true;
  return false;
}

function isProbablyBinary(rel, buf) {
  const ext = path.extname(rel).toLowerCase();
  if (BINARY_EXT.has(ext)) return true;
  const limit = Math.min(buf.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  if (ext && !TEXT_EXT.has(ext)) return true;
  return false;
}

function hasMergeConflict(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("<<<<<<< ") || line.startsWith(">>>>>>> ")) return true;
  }
  return false;
}

function scanFileContent(relPath, text) {
  const findings = [];
  for (const { id, pattern, hint } of FORBIDDEN_SUBSTRINGS) {
    if (text.includes(pattern)) {
      findings.push({ rule: id, hint, sample: pattern });
    }
  }
  if (hasMergeConflict(text)) {
    findings.push({
      rule: "merge-conflict",
      hint: "Unresolved git merge conflict markers (<<<<<<< / >>>>>>>)",
      sample: "<<<<<<< ",
    });
  }
  const lines = text.split(/\r?\n/);
  if (relPath.endsWith(".py") || /^#!.*python/i.test(text.slice(0, 200))) {
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      if (line.startsWith("#!") && (line.includes("C:\\\\Users") || line.includes("C:/Users"))) {
        findings.push({
          rule: "python-shebang-absolute",
          hint: "Shebang points at a user-specific path",
          sample: line.trim(),
        });
        break;
      }
    }
  }
  return findings;
}

function walk(dir, relBase, outFiles) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    const rel = path.join(relBase, ent.name).replace(/\\/g, "/");
    if (shouldSkipPath(rel)) continue;
    if (ent.isDirectory()) {
      if (shouldSkipDirName(ent.name, rel)) continue;
      walk(abs, rel, outFiles);
    } else if (ent.isFile()) {
      if (SKIP_FILE_NAMES.has(ent.name)) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (ext && !TEXT_EXT.has(ext) && !BINARY_EXT.has(ext)) continue;
      outFiles.push(abs, rel);
    }
  }
}

function collectFiles(scanAll) {
  const files = [];
  if (scanAll) {
    walk(WORKSPACE_ROOT, "", files);
  } else {
    const roots = [...DEFAULT_REL_ROOTS];
    for (const root of roots) {
      const abs = path.join(WORKSPACE_ROOT, root);
      if (!fs.existsSync(abs)) continue;
      walk(abs, root, files);
    }
  }
  return files;
}

function resolveMode(scanAll) {
  if (scanAll) return "all";
  return "default";
}

function main() {
  const jsonOut = process.argv.includes("--json");
  const scanAll = process.argv.includes("--all");
  const raw = collectFiles(scanAll);
  const pairs = [];
  for (let i = 0; i < raw.length; i += 2) {
    pairs.push([raw[i], raw[i + 1]]);
  }

  const allFindings = [];
  for (const [abs, rel] of pairs) {
    if (!rel) continue;
    if (shouldSkipPath(rel)) continue;

    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.size > MAX_FILE_BYTES) continue;

    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    if (isProbablyBinary(rel, buf)) continue;

    let text;
    try {
      text = buf.toString("utf8");
    } catch {
      continue;
    }

    const findings = scanFileContent(rel, text);
    for (const f of findings) {
      allFindings.push({ file: rel, ...f });
    }
  }

  if (jsonOut) {
    console.log(
      JSON.stringify(
        { ok: allFindings.length === 0, mode: resolveMode(scanAll), findings: allFindings },
        null,
        2,
      ),
    );
    process.exit(allFindings.length > 0 ? 1 : 0);
  }

  if (allFindings.length === 0) {
    console.info(
      `[scan-repo-health] ok (${resolveMode(scanAll)})`,
    );
    console.info("  Also: npm run verify:generated-paths");
    process.exit(0);
  }

  console.error(`[scan-repo-health] FAILED (${resolveMode(scanAll)}):\n`);
  for (const f of allFindings) {
    console.error(`  ${f.file}`);
    console.error(`    [${f.rule}] ${f.hint}`);
    if (f.sample) console.error(`    sample: ${f.sample}`);
    console.error("");
  }
  process.exit(1);
}

main();





