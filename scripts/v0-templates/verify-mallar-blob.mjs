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
const KNOWN_TEMPLATE_ASSET_MAGICS = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from("GIF87a", "ascii"),
  Buffer.from("GIF89a", "ascii"),
  Buffer.from([0x00, 0x00, 0x01, 0x00]),
  Buffer.from("wOFF", "ascii"),
  Buffer.from("wOF2", "ascii"),
  Buffer.from([0x00, 0x01, 0x00, 0x00]),
  Buffer.from("OTTO", "ascii"),
  Buffer.from("%PDF-", "ascii"),
];
const ISO_BMFF_ASSET_BRANDS = new Set([
  "avif", "avis", "isom", "iso2", "iso3", "iso4", "iso5", "iso6",
  "mp41", "mp42", "avc1", "M4V ", "M4A ", "MSNV", "dash", "qt  ",
]);
const EOT_VERSIONS = new Set([0x00010000, 0x00020001, 0x00020002]);

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

function startsWithBytes(buffer, prefix) {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

function readEbmlVint(buffer, offset) {
  if (offset >= buffer.length) return null;
  const first = buffer[offset];
  let length = 1;
  let marker = 0x80;
  while (length <= 4 && (first & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  if (length > 4 || offset + length > buffer.length) return null;
  let value = first & (marker - 1);
  for (let index = 1; index < length; index += 1) value = value * 256 + buffer[offset + index];
  if (value === 2 ** (7 * length) - 1) return null;
  return { length, value };
}

function readEbmlIdLength(buffer, offset) {
  if (offset >= buffer.length) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 4 && (buffer[offset] & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  return length <= 4 && offset + length <= buffer.length ? length : null;
}

function hasWebmMagic(buffer) {
  if (!startsWithBytes(buffer, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return false;
  const headerSize = readEbmlVint(buffer, 4);
  if (!headerSize) return false;
  let offset = 4 + headerSize.length;
  const headerEnd = offset + headerSize.value;
  if (headerEnd > buffer.length) return false;
  while (offset < headerEnd) {
    const idLength = readEbmlIdLength(buffer, offset);
    if (!idLength) return false;
    const size = readEbmlVint(buffer, offset + idLength);
    if (!size) return false;
    const valueStart = offset + idLength + size.length;
    const valueEnd = valueStart + size.value;
    if (valueEnd > headerEnd) return false;
    if (idLength === 2 && buffer[offset] === 0x42 && buffer[offset + 1] === 0x82) {
      return size.value === 4 && buffer.subarray(valueStart, valueEnd).toString("ascii") === "webm";
    }
    offset = valueEnd;
  }
  return false;
}

function hasRiffAssetMagic(buffer) {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("ascii") !== "RIFF") return false;
  const declaredEnd = buffer.readUInt32LE(4) + 8;
  const formType = buffer.subarray(8, 12).toString("ascii");
  return (
    declaredEnd >= 12 &&
    declaredEnd <= buffer.length &&
    (formType === "WEBP" || formType === "WAVE" || formType === "AVI ")
  );
}

function hasIsoBmffAssetMagic(buffer) {
  if (buffer.length < 16 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > buffer.length || (boxSize - 16) % 4 !== 0) return false;
  if (ISO_BMFF_ASSET_BRANDS.has(buffer.subarray(8, 12).toString("ascii"))) return true;
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (ISO_BMFF_ASSET_BRANDS.has(buffer.subarray(offset, offset + 4).toString("ascii"))) return true;
  }
  return false;
}

function hasBmpMagic(buffer) {
  if (buffer.length < 14 || buffer.subarray(0, 2).toString("ascii") !== "BM") return false;
  const declaredSize = buffer.readUInt32LE(2);
  const pixelOffset = buffer.readUInt32LE(10);
  return declaredSize === buffer.length && buffer.readUInt32LE(6) === 0 && pixelOffset >= 14 && pixelOffset <= declaredSize;
}

function hasEotMagic(buffer) {
  if (buffer.length < 36) return false;
  const declaredSize = buffer.readUInt32LE(0);
  const fontDataSize = buffer.readUInt32LE(4);
  return declaredSize === buffer.length && fontDataSize > 0 && fontDataSize <= declaredSize && EOT_VERSIONS.has(buffer.readUInt32LE(8)) && buffer.readUInt16LE(34) === 0x504c;
}

function hasId3v2Magic(buffer) {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString("ascii") !== "ID3") return false;
  if (buffer[3] < 2 || buffer[3] > 4 || buffer[4] === 0xff) return false;
  for (let offset = 6; offset <= 9; offset += 1) {
    if ((buffer[offset] & 0x80) !== 0) return false;
  }
  const tagSize = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
  return 10 + tagSize <= buffer.length;
}

function hasKnownTemplateAssetMagic(buffer) {
  if (KNOWN_TEMPLATE_ASSET_MAGICS.some((magic) => startsWithBytes(buffer, magic))) return true;
  return (
    hasRiffAssetMagic(buffer) ||
    hasIsoBmffAssetMagic(buffer) ||
    hasBmpMagic(buffer) ||
    hasEotMagic(buffer) ||
    hasId3v2Magic(buffer) ||
    hasWebmMagic(buffer)
  );
}

function isBase64AlphabetCode(code) {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2b ||
    code === 0x2f
  );
}

function decodeCanonicalBase64(value) {
  if (!value || value.length % 4 !== 0) return null;
  let dataEnd = value.length;
  while (dataEnd > 0 && value.charCodeAt(dataEnd - 1) === 0x3d) dataEnd -= 1;
  if (value.length - dataEnd > 2) return null;
  for (let index = 0; index < dataEnd; index += 1) {
    if (!isBase64AlphabetCode(value.charCodeAt(index))) return null;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : null;
}

function normalizeArchiveBinaryBytes(buffer) {
  const serialized = buffer.toString("utf8");
  if (!serialized.startsWith(BINARY_BASE64_PREFIX)) return buffer;
  const decoded = decodeCanonicalBase64(serialized.slice(BINARY_BASE64_PREFIX.length));
  return decoded && hasKnownTemplateAssetMagic(decoded) ? decoded : buffer;
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
        const binaryContent = isText ? null : normalizeArchiveBinaryBytes(content);
        const payloadBytes = isText
          ? Buffer.byteLength(content.toString("utf8"), "utf8")
          : Buffer.byteLength(BINARY_BASE64_PREFIX + binaryContent.toString("base64"), "utf8");
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
