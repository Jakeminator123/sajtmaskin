#!/usr/bin/env node
/**
 * Verify the blob-backed template manifest end-to-end (input side of the VM flow):
 *   - fetch each archiveUrl from Vercel Blob
 *   - unzip and apply the same common-root stripping the importer uses
 *   - confirm package.json exists and detect which install command the preview
 *     host (preview-host/src/runtime.js resolveInstallCommand) will run
 *
 * This mirrors src/lib/templates/local-v0-template-source.ts extraction so the
 * report reflects exactly what gets pushed to the Fly preview VM.
 *
 * Usage: node scripts/v0-templates/verify-mallar-blob.mjs
 */

import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "src/lib/templates/template-blob-manifest.json");

// Preview-host limits (preview-host/src/validate.js)
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_FILES = 500;
const BINARY_BASE64_PREFIX = "base64:";

// Importer text detection (src/lib/templates/local-v0-template-source.ts)
const BLOCKED_IMPORT_PREFIXES = ["node_modules/", ".git/", ".next/", "dist/", "build/", "coverage/", "out/"];
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".sass", ".less",
  ".html", ".md", ".mdx", ".txt", ".yml", ".yaml", ".toml", ".env", ".example", ".svg", ".sql",
  ".sh", ".prisma", ".graphql", ".gql",
]);
const TEXT_BASENAMES = new Set([
  "dockerfile", "makefile", ".gitignore", ".npmrc", ".nvmrc", ".env", ".env.local", ".env.example",
  ".env.production", ".env.development", ".env.test", "readme", "license", "package-lock.json",
  "pnpm-lock.yaml", "pnpm-lock.yml", "yarn.lock",
]);

function normalizeImportedPath(rawPath) {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((s) => s === "..")) return null;
  if (BLOCKED_IMPORT_PREFIXES.some((p) => normalized.startsWith(p))) return null;
  return normalized;
}

function shouldTreatAsText(filePath) {
  const lower = filePath.toLowerCase();
  const basename = lower.split("/").pop() ?? "";
  if (TEXT_BASENAMES.has(basename)) return true;
  for (const ext of TEXT_EXTENSIONS) if (lower.endsWith(ext)) return true;
  return false;
}

function looksBinary(buffer) {
  if (buffer.length === 0) return false;
  let suspicious = 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return true;
    if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9 && byte !== 10 && byte !== 13) suspicious += 1;
  }
  return suspicious / sample.length > 0.1;
}

function stripCommonArchiveRoot(paths) {
  if (paths.length === 0) return paths;
  const segments = paths.map((filePath) => filePath.split("/").filter(Boolean));
  const first = segments[0]?.[0];
  if (!first) return paths;
  const shouldStrip = segments.every((parts) => parts.length > 1 && parts[0] === first);
  if (!shouldStrip) return paths;
  return segments.map((parts) => parts.slice(1).join("/"));
}

function resolveInstallCommand(fileSet) {
  if (fileSet.has("pnpm-lock.yaml") || fileSet.has("pnpm-lock.yml")) return "pnpm install --frozen-lockfile";
  if (fileSet.has("yarn.lock")) return "yarn install";
  if (fileSet.has("package-lock.json")) return "npm ci";
  return "npm install (no lockfile)";
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const templates = Array.isArray(manifest.templates) ? manifest.templates : [];
  console.log(`[verify] Manifest templates: ${templates.length}`);
  console.log(`[verify] Source: ${manifest._source} | updated: ${manifest._lastUpdated}`);
  console.log("");

  let ok = 0;
  let failed = 0;
  let failedPreview = 0;
  for (const t of templates) {
    const label = `${t.id} (${t.title})`;
    try {
      const res = await fetch(t.archiveUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const zip = await JSZip.loadAsync(buffer);
      const rawEntries = Object.values(zip.files)
        .filter((e) => !e.dir)
        .map((e) => e.name);
      const normalized = stripCommonArchiveRoot(rawEntries);
      const fileSet = new Set(normalized.map((p) => p.toLowerCase()));
      const hasPkg = fileSet.has("package.json");
      const hasNextConfig = [...fileSet].some((p) => p.startsWith("next.config."));
      const hasApp = [...fileSet].some((p) => p.startsWith("app/") || p.startsWith("src/app/") || p.startsWith("pages/"));
      const install = resolveInstallCommand(fileSet);
      const sizeMatch = buffer.byteLength === t.archiveSizeBytes ? "size-ok" : `size-DRIFT(${buffer.byteLength}!=${t.archiveSizeBytes})`;

      if (!hasPkg) throw new Error("no package.json after root-strip");

      // Replicate the imported preview payload (text vs base64) and check preview-host limits.
      let importedCount = 0;
      let totalPayload = 0;
      let maxFile = 0;
      let maxFilePath = "";
      const oversized = [];
      for (let i = 0; i < rawEntries.length; i += 1) {
        const safePath = normalizeImportedPath(normalized[i]);
        if (!safePath) continue;
        const content = Buffer.from(await zip.files[rawEntries[i]].async("uint8array"));
        const isText = shouldTreatAsText(safePath) && !looksBinary(content);
        const payloadBytes = isText
          ? Buffer.byteLength(content.toString("utf8"), "utf8")
          : Buffer.byteLength(BINARY_BASE64_PREFIX + content.toString("base64"), "utf8");
        importedCount += 1;
        totalPayload += payloadBytes;
        if (payloadBytes > maxFile) {
          maxFile = payloadBytes;
          maxFilePath = safePath;
        }
        if (payloadBytes > MAX_FILE_BYTES) oversized.push(`${safePath}=${(payloadBytes / 1024 / 1024).toFixed(1)}MB`);
      }
      const totalMB = (totalPayload / 1024 / 1024).toFixed(1);
      const maxMB = (maxFile / 1024 / 1024).toFixed(2);
      const fits =
        importedCount <= MAX_FILES && maxFile <= MAX_FILE_BYTES && totalPayload <= MAX_TOTAL_BYTES;

      ok += 1;
      const previewTag = fits ? "PREVIEW-FITS" : "PREVIEW-BLOCKED";
      console.log(
        `  OK  ${label}\n      files=${normalized.length} install="${install}" ` +
          `pkg=${hasPkg} next=${hasNextConfig} appdir=${hasApp} ${sizeMatch}\n` +
          `      ${previewTag} payload=${totalMB}MB/12MB maxFile=${maxMB}MB (${maxFilePath})` +
          (oversized.length ? `\n      oversized: ${oversized.join(", ")}` : ""),
      );
      if (!fits) failedPreview += 1;
    } catch (error) {
      failed += 1;
      console.log(`  FAIL ${label}\n      ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("");
  console.log(`[verify] fetch/extract OK: ${ok} | FAIL: ${failed} | preview-blocked (payload): ${failedPreview}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[verify] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
