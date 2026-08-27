import JSZip from "jszip";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import type { CodeFile } from "@/lib/gen/parser";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { isBlockedEnvImportFilename } from "@/lib/templates/env-import-guard";
import { normalizeImportedRepoFiles } from "@/lib/templates/normalize-imported-package-json";
import blobManifestData from "./template-blob-manifest.json";

const DOWNLOADED_LOG_PATH = resolve(process.cwd(), "templates_v0/out/downloaded.jsonl");
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_IMPORTED_FILES = 600;
const MAX_IMPORTED_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_IMPORTED_BINARY_BYTES = 32 * 1024 * 1024;
const MAX_REFERENCE_FILES = 600;
const MAX_REFERENCE_FILE_BYTES = 1024 * 1024;
const MAX_REFERENCE_TEXT_BYTES = 8 * 1024 * 1024;
/**
 * Prefix prepended to base64-encoded binary file content so that the preview-host
 * can distinguish text from binary when writing to the workspace filesystem.
 */
const BINARY_BASE64_PREFIX = "base64:";
const KNOWN_TEMPLATE_ASSET_MAGICS = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG
  Buffer.from([0xff, 0xd8, 0xff]), // JPEG
  Buffer.from("GIF87a", "ascii"),
  Buffer.from("GIF89a", "ascii"),
  Buffer.from([0x00, 0x00, 0x01, 0x00]), // ICO
  Buffer.from("wOFF", "ascii"),
  Buffer.from("wOF2", "ascii"),
  Buffer.from([0x00, 0x01, 0x00, 0x00]), // TrueType sfnt
  Buffer.from("OTTO", "ascii"), // OpenType CFF
  Buffer.from("%PDF-", "ascii"),
] as const;
const ISO_BMFF_ASSET_BRANDS = new Set([
  "avif",
  "avis",
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4A ",
  "MSNV",
  "dash",
  "qt  ",
]);
const EOT_VERSIONS = new Set([0x00010000, 0x00020001, 0x00020002]);
const BLOCKED_IMPORT_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
] as const;
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".example",
  ".svg",
  ".sql",
  ".sh",
  ".prisma",
  ".graphql",
  ".gql",
]);
const TEXT_BASENAMES = new Set([
  "dockerfile",
  "makefile",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
  ".env",
  ".env.local",
  ".env.example",
  ".env.production",
  ".env.development",
  ".env.test",
  "readme",
  "license",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const REFERENCE_FILE_EXTENSION_PATTERN = /\.(?:tsx|jsx|ts|js|css)$/i;
const PRIMARY_PAGE_PATTERN = /(^|\/)app\/(?:\([^/]+\)\/)*page\.(?:tsx|jsx|ts|js)$/i;

type DownloadedTemplateRow = {
  templateId?: unknown;
  path?: unknown;
  sourceSlugs?: unknown;
  sourceLabelsSv?: unknown;
  kategoriLabel?: unknown;
  ts?: unknown;
};

export type LocalV0TemplateSource = {
  templateId: string;
  sourceKind?: "local" | "blob";
  archivePath?: string;
  archiveUrl?: string;
  archiveSizeBytes?: number | null;
  archiveSha256?: string | null;
  sourceSlugs: string[];
  sourceLabelsSv: string[];
  categoryLabel: string | null;
  timestamp: string | null;
};

type BlobManifestItem = {
  id: string;
  archiveUrl: string;
  archiveSizeBytes?: number | null;
  archiveSha256?: string | null;
  category?: string | null;
  sourceCategory?: string | null;
};

function readBlobManifestItems(): BlobManifestItem[] {
  const raw = blobManifestData as unknown;
  if (!raw || typeof raw !== "object") return [];
  const templates = (raw as { templates?: unknown }).templates;
  if (!Array.isArray(templates)) return [];
  return templates.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const archiveUrl = typeof row.archiveUrl === "string" ? row.archiveUrl.trim() : "";
    if (!id || !archiveUrl) return [];
    return [
      {
        id,
        archiveUrl,
        archiveSizeBytes:
          typeof row.archiveSizeBytes === "number" && Number.isFinite(row.archiveSizeBytes)
            ? row.archiveSizeBytes
            : null,
        archiveSha256: typeof row.archiveSha256 === "string" ? row.archiveSha256 : null,
        category: typeof row.category === "string" ? row.category : null,
        sourceCategory: typeof row.sourceCategory === "string" ? row.sourceCategory : null,
      },
    ];
  });
}

function getBlobManifestItemById(templateId: string): BlobManifestItem | null {
  return readBlobManifestItems().find((item) => item.id === templateId) ?? null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function toAbsoluteArchivePath(rawPath: string): string {
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

async function readDownloadedTemplateRows(): Promise<DownloadedTemplateRow[]> {
  if (!(await fileExists(DOWNLOADED_LOG_PATH))) {
    return [];
  }

  const raw = await readFile(DOWNLOADED_LOG_PATH, "utf8");
  const rows: DownloadedTemplateRow[] = [];
  const lines = raw.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as DownloadedTemplateRow;
      rows.push(parsed);
    } catch (error) {
      console.warn(
        `[local-v0-template-source] Skipping invalid JSONL row ${index + 1} in ${DOWNLOADED_LOG_PATH}:`,
        error,
      );
    }
  }

  return rows;
}

export async function getLocalV0TemplateSourceById(
  templateId: string,
): Promise<LocalV0TemplateSource | null> {
  const trimmedId = templateId.trim();
  if (!trimmedId) return null;

  const rows = await readDownloadedTemplateRows();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const rowTemplateId = typeof row?.templateId === "string" ? row.templateId.trim() : "";
    const rowPath = typeof row?.path === "string" ? row.path.trim() : "";
    if (rowTemplateId !== trimmedId || !rowPath) continue;

    const archivePath = toAbsoluteArchivePath(rowPath);
    if (!(await fileExists(archivePath))) continue;

    // Carry the manifest binding along even for a local cache hit, so the
    // archive can still be checked against the current Blob SHA and re-fetched
    // when the cached file is stale.
    const manifestItem = getBlobManifestItemById(trimmedId);

    return {
      templateId: trimmedId,
      sourceKind: "local",
      archivePath,
      archiveUrl: manifestItem?.archiveUrl,
      archiveSizeBytes: manifestItem?.archiveSizeBytes ?? null,
      archiveSha256: manifestItem?.archiveSha256 ?? null,
      sourceSlugs: normalizeStringArray(row.sourceSlugs),
      sourceLabelsSv: normalizeStringArray(row.sourceLabelsSv),
      categoryLabel:
        typeof row.kategoriLabel === "string" && row.kategoriLabel.trim()
          ? row.kategoriLabel.trim()
          : null,
      timestamp: typeof row.ts === "string" && row.ts.trim() ? row.ts.trim() : null,
    };
  }

  const blobItem = getBlobManifestItemById(trimmedId);
  if (!blobItem) return null;

  return {
    templateId: trimmedId,
    sourceKind: "blob",
    archiveUrl: blobItem.archiveUrl,
    archiveSizeBytes: blobItem.archiveSizeBytes ?? null,
    archiveSha256: blobItem.archiveSha256 ?? null,
    sourceSlugs: blobItem.category ? [blobItem.category] : [],
    sourceLabelsSv: blobItem.sourceCategory ? [blobItem.sourceCategory] : [],
    categoryLabel: blobItem.sourceCategory ?? blobItem.category ?? null,
    timestamp: typeof (blobManifestData as { _lastUpdated?: unknown })._lastUpdated === "string"
      ? String((blobManifestData as { _lastUpdated?: unknown })._lastUpdated)
      : null,
  };
}

function normalizeImportedPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  if (BLOCKED_IMPORT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  // Secret hygiene: never import a real .env from a template archive (#38).
  const basename = normalized.split("/").pop()?.toLowerCase() ?? "";
  if (isBlockedEnvImportFilename(basename)) return null;
  return normalized;
}

function shouldTreatAsText(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const basename = lowerPath.split("/").pop() ?? "";
  if (TEXT_BASENAMES.has(basename)) return true;
  for (const extension of TEXT_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) return true;
  }
  return false;
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  let suspicious = 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return true;
    if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9 && byte !== 10 && byte !== 13) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length > 0.1;
}

function startsWithBytes(buffer: Buffer, prefix: Buffer): boolean {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

function readEbmlVint(buffer: Buffer, offset: number): { length: number; value: number } | null {
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

function readEbmlIdLength(buffer: Buffer, offset: number): number | null {
  if (offset >= buffer.length) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 4 && (buffer[offset] & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  return length <= 4 && offset + length <= buffer.length ? length : null;
}

function hasWebmMagic(buffer: Buffer): boolean {
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

function hasRiffAssetMagic(buffer: Buffer): boolean {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("ascii") !== "RIFF") return false;
  const declaredEnd = buffer.readUInt32LE(4) + 8;
  const formType = buffer.subarray(8, 12).toString("ascii");
  return (
    declaredEnd >= 12 &&
    declaredEnd <= buffer.length &&
    (formType === "WEBP" || formType === "WAVE" || formType === "AVI ")
  );
}

function hasIsoBmffAssetMagic(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > buffer.length || (boxSize - 16) % 4 !== 0) return false;
  if (ISO_BMFF_ASSET_BRANDS.has(buffer.subarray(8, 12).toString("ascii"))) return true;
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (ISO_BMFF_ASSET_BRANDS.has(buffer.subarray(offset, offset + 4).toString("ascii"))) {
      return true;
    }
  }
  return false;
}

function hasBmpMagic(buffer: Buffer): boolean {
  if (buffer.length < 14 || buffer.subarray(0, 2).toString("ascii") !== "BM") return false;
  const declaredSize = buffer.readUInt32LE(2);
  const pixelOffset = buffer.readUInt32LE(10);
  return (
    declaredSize === buffer.length &&
    buffer.readUInt32LE(6) === 0 &&
    pixelOffset >= 14 &&
    pixelOffset <= declaredSize
  );
}

function hasEotMagic(buffer: Buffer): boolean {
  if (buffer.length < 36) return false;
  const declaredSize = buffer.readUInt32LE(0);
  const fontDataSize = buffer.readUInt32LE(4);
  return (
    declaredSize === buffer.length &&
    fontDataSize > 0 &&
    fontDataSize <= declaredSize &&
    EOT_VERSIONS.has(buffer.readUInt32LE(8)) &&
    buffer.readUInt16LE(34) === 0x504c
  );
}

function hasId3v2Magic(buffer: Buffer): boolean {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString("ascii") !== "ID3") return false;
  if (buffer[3] < 2 || buffer[3] > 4 || buffer[4] === 0xff) return false;
  for (let offset = 6; offset <= 9; offset += 1) {
    if ((buffer[offset] & 0x80) !== 0) return false;
  }
  const tagSize =
    (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
  return 10 + tagSize <= buffer.length;
}

function hasKnownTemplateAssetMagic(buffer: Buffer): boolean {
  if (KNOWN_TEMPLATE_ASSET_MAGICS.some((magic) => startsWithBytes(buffer, magic))) {
    return true;
  }
  return (
    hasRiffAssetMagic(buffer) ||
    hasIsoBmffAssetMagic(buffer) ||
    hasBmpMagic(buffer) ||
    hasEotMagic(buffer) ||
    hasId3v2Magic(buffer) ||
    hasWebmMagic(buffer)
  );
}

function isBase64AlphabetCode(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2b ||
    code === 0x2f
  );
}

function decodeCanonicalBase64(value: string): Buffer | null {
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

/**
 * Some downloaded ZIPs contain the persisted CodeFile representation for an
 * asset (`base64:<bytes>`) instead of the raw bytes. Normalize exactly that
 * one layer when both the Base64 spelling and decoded file signature prove it
 * is an asset. Text and recursively wrapped envelopes remain ordinary bytes.
 */
function normalizeArchiveBinaryBytes(buffer: Buffer): Buffer {
  const serialized = buffer.toString("utf8");
  if (!serialized.startsWith(BINARY_BASE64_PREFIX)) return buffer;
  const decoded = decodeCanonicalBase64(serialized.slice(BINARY_BASE64_PREFIX.length));
  return decoded && hasKnownTemplateAssetMagic(decoded) ? decoded : buffer;
}

function declaredUncompressedSize(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const data = (entry as { _data?: unknown })._data;
  if (!data || typeof data !== "object") return null;
  const size = (data as { uncompressedSize?: unknown }).uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : null;
}

function referencePathPriority(filePath: string): number {
  const path = filePath.toLowerCase();
  if (
    [
      "app/page.tsx",
      "src/app/page.tsx",
      "app/page.jsx",
      "src/app/page.jsx",
      "pages/index.tsx",
      "src/pages/index.tsx",
      "pages/index.jsx",
      "src/pages/index.jsx",
    ].includes(path)
  ) {
    return 0;
  }
  if (PRIMARY_PAGE_PATTERN.test(path)) return 1;
  if (/(^|\/)(?:globals?|global)\.css$/.test(path)) return 2;
  if (/(^|\/)app\/layout\.(?:tsx|jsx)$/.test(path)) return 3;
  if (/(^|\/)components?\//.test(path)) return 4;
  return path.endsWith(".css") ? 5 : 6;
}

function stripCommonArchiveRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const segments = paths.map((filePath) => filePath.split("/").filter(Boolean));
  const first = segments[0]?.[0];
  if (!first) return paths;
  const shouldStrip = segments.every((parts) => parts.length > 1 && parts[0] === first);
  if (!shouldStrip) return paths;
  return segments.map((parts) => parts.slice(1).join("/"));
}

async function readLocalArchiveBuffer(path: string): Promise<Buffer> {
  const buffer = await readFile(path);
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Template archive is too large for import");
  }
  return buffer;
}

async function readRemoteArchiveBuffer(url: string, signal?: AbortSignal): Promise<Buffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Template archive fetch failed (${response.status})`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_ARCHIVE_BYTES) {
      throw new Error("Template archive is too large for import");
    }
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Template archive is too large for import");
  }
  return buffer;
}

/**
 * An absent manifest SHA means there is nothing to verify against, so the
 * pre-existing unverified behaviour stands. A SHA that is *present but
 * malformed* is a manifest defect, not an opt-out: silently treating it as
 * absent would turn one corrupt field into an unverified archive read.
 */
function normalizeExpectedSha(expected: string | null | undefined): string | null {
  const normalized = expected?.trim().toLowerCase();
  if (!normalized) return null;
  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new Error("Template archive SHA-256 in the Blob manifest is malformed");
  }
  return normalized;
}

function archiveMatchesSha(buffer: Buffer, expectedSha: string | null): boolean {
  if (!expectedSha) return true;
  return createHash("sha256").update(buffer).digest("hex") === expectedSha;
}

/**
 * Read the template archive and bind it to the Blob manifest SHA-256.
 *
 * A local cache hit is never trusted on filename alone: when it does not match
 * the manifest SHA it is discarded and the Blob archive is fetched and verified
 * instead, so a stale ZIP from an earlier download cannot reach the prompt.
 */
export async function readArchiveBuffer(
  source: LocalV0TemplateSource,
  signal?: AbortSignal,
): Promise<Buffer> {
  const expectedSha = normalizeExpectedSha(source.archiveSha256);

  if (source.sourceKind === "blob") {
    if (!source.archiveUrl) {
      throw new Error("Template Blob archive URL is missing");
    }
    const remoteBuffer = await readRemoteArchiveBuffer(source.archiveUrl, signal);
    if (!archiveMatchesSha(remoteBuffer, expectedSha)) {
      throw new Error("Template archive SHA-256 does not match the Blob manifest");
    }
    return remoteBuffer;
  }

  if (!source.archivePath) {
    throw new Error("Local template archive path is missing");
  }
  const localBuffer = await readLocalArchiveBuffer(source.archivePath);
  if (archiveMatchesSha(localBuffer, expectedSha)) {
    return localBuffer;
  }

  if (!source.archiveUrl) {
    throw new Error("Template archive SHA-256 does not match the Blob manifest");
  }
  console.warn(
    `[local-v0-template-source] Local archive for template ${source.templateId} does not match the Blob manifest SHA-256; re-fetching ${source.archiveUrl}`,
  );
  const refetched = await readRemoteArchiveBuffer(source.archiveUrl, signal);
  if (!archiveMatchesSha(refetched, expectedSha)) {
    throw new Error("Template archive SHA-256 does not match the Blob manifest");
  }
  return refetched;
}

export async function extractV0TemplateArchiveFiles(buffer: Buffer): Promise<CodeFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const rawEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  if (rawEntries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(
      `Too many entries in template archive (${rawEntries.length} > ${MAX_ARCHIVE_ENTRIES})`,
    );
  }
  const normalizedEntries = stripCommonArchiveRoot(rawEntries);

  const files: CodeFile[] = [];
  let totalTextBytes = 0;
  let totalBinaryBytes = 0;

  for (let index = 0; index < rawEntries.length; index += 1) {
    const originalName = rawEntries[index];
    const strippedName = normalizedEntries[index];
    const safePath = normalizeImportedPath(strippedName);
    if (!safePath) continue;

    if (files.length >= MAX_IMPORTED_FILES) {
      throw new Error(`Too many files in template import (${files.length} >= ${MAX_IMPORTED_FILES})`);
    }

    const isText = shouldTreatAsText(safePath);
    const entry = zip.files[originalName];
    const contentBuffer = Buffer.from(await entry.async("uint8array"));

    if (isText && !looksBinary(contentBuffer)) {
      totalTextBytes += contentBuffer.byteLength;
      if (totalTextBytes > MAX_IMPORTED_TEXT_BYTES) {
        throw new Error(
          `Template archive contains too much text content (${totalTextBytes} bytes > ${MAX_IMPORTED_TEXT_BYTES})`,
        );
      }
      files.push({
        path: safePath,
        content: contentBuffer.toString("utf8"),
        language: inferFileLanguage(safePath),
      });
    } else {
      const binaryBytes = normalizeArchiveBinaryBytes(contentBuffer);
      // Budget the semantic bytes written by preview-host, not the larger
      // Base64 transport spelling that may have been stored inside the ZIP.
      totalBinaryBytes += binaryBytes.byteLength;
      if (totalBinaryBytes > MAX_IMPORTED_BINARY_BYTES) continue;
      files.push({
        path: safePath,
        content: BINARY_BASE64_PREFIX + binaryBytes.toString("base64"),
        language: "binary",
      });
    }
  }

  return files;
}

/**
 * Extract only bounded frontend source candidates for variant inspiration.
 *
 * Unlike a complete template import, this path deliberately ignores package
 * manifests, lockfiles, assets and binary files. Declared ZIP sizes are checked
 * before decompression where JSZip exposes them, and every file plus the total
 * output has a hard bound. The caller still applies the stricter 3-file/9k
 * prompt budget.
 */
export async function extractV0TemplateReferenceFiles(buffer: Buffer): Promise<CodeFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const rawEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  if (rawEntries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(
      `Too many entries in template archive (${rawEntries.length} > ${MAX_ARCHIVE_ENTRIES})`,
    );
  }
  const normalizedEntries = stripCommonArchiveRoot(rawEntries);
  const candidates = rawEntries
    .flatMap((originalName, index) => {
      const safePath = normalizeImportedPath(normalizedEntries[index] ?? "");
      if (
        !safePath ||
        !REFERENCE_FILE_EXTENSION_PATTERN.test(safePath) ||
        /(^|\/)api\//i.test(safePath)
      ) {
        return [];
      }
      return [{ originalName, safePath, entry: zip.files[originalName] }];
    })
    .sort(
      (a, b) =>
        referencePathPriority(a.safePath) - referencePathPriority(b.safePath) ||
        a.safePath.localeCompare(b.safePath),
    );

  const files: CodeFile[] = [];
  let totalTextBytes = 0;
  for (const candidate of candidates) {
    if (files.length >= MAX_REFERENCE_FILES) break;
    const declaredSize = declaredUncompressedSize(candidate.entry);
    if (
      (declaredSize !== null && declaredSize > MAX_REFERENCE_FILE_BYTES) ||
      (declaredSize !== null && totalTextBytes + declaredSize > MAX_REFERENCE_TEXT_BYTES)
    ) {
      continue;
    }

    const contentBuffer = Buffer.from(await candidate.entry.async("uint8array"));
    if (
      contentBuffer.byteLength > MAX_REFERENCE_FILE_BYTES ||
      totalTextBytes + contentBuffer.byteLength > MAX_REFERENCE_TEXT_BYTES ||
      looksBinary(contentBuffer)
    ) {
      continue;
    }
    totalTextBytes += contentBuffer.byteLength;
    files.push({
      path: candidate.safePath,
      content: contentBuffer.toString("utf8"),
      language: inferFileLanguage(candidate.safePath),
    });
  }

  return files;
}

export async function loadLocalV0TemplateFiles(
  templateId: string,
): Promise<{ source: LocalV0TemplateSource; files: CodeFile[] } | null> {
  const source = await getLocalV0TemplateSourceById(templateId);
  if (!source) return null;

  const buffer = await readArchiveBuffer(source);
  const extracted = await extractV0TemplateArchiveFiles(buffer);
  if (extracted.length === 0) {
    throw new Error("No supported text files found in local template archive");
  }

  // Normalize: safe deterministic package.json repairs (e.g. the
  // framer-motion / motion-dom lockstep skew) before the files reach the
  // draft version + preview host. Everything else stays verbatim.
  const normalized = normalizeImportedRepoFiles(extracted);
  if (normalized.applied.length > 0) {
    console.info(
      `[local-v0-template-source] Normalize applied for template ${templateId}:`,
      normalized.applied.join("; "),
    );
  }

  return { source, files: normalized.files };
}

export async function loadLocalV0TemplateReferenceFiles(
  templateId: string,
  options: { timeoutMs?: number } = {},
): Promise<{ source: LocalV0TemplateSource; files: CodeFile[] } | null> {
  const source = await getLocalV0TemplateSourceById(templateId);
  if (!source) return null;

  const signal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
  const buffer = await readArchiveBuffer(source, signal);
  const files = await extractV0TemplateReferenceFiles(buffer);
  return { source, files };
}
