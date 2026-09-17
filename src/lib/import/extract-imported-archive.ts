import JSZip from "jszip";
import type { CodeFile } from "@/lib/gen/parser";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { isBlockedEnvImportFilename } from "@/lib/templates/env-import-guard";
import { ImportInitError } from "./github-import-errors";
import { MAX_LOCAL_ZIP_BASE64_CHARS, MAX_LOCAL_ZIP_UPLOAD_BYTES } from "./import-init-contract";

export const MAX_IMPORTED_FILES = 600;
export const MAX_IMPORTED_TEXT_BYTES = 16 * 1024 * 1024;
/** Decoded-byte cap for one imported image/font. */
export const MAX_IMPORTED_BINARY_FILE_BYTES = 2 * 1024 * 1024;
/** Decoded-byte cap for all imported images/fonts in one archive. */
export const MAX_IMPORTED_BINARY_BYTES = 16 * 1024 * 1024;
const BINARY_BASE64_PREFIX = "base64:";

const IMPORT_BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
]);

const BLOCKED_IMPORT_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
] as const;
const SKIPPED_IMPORT_FILENAMES = new Set([".ds_store"]);
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
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

export function normalizeImportedPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  if (BLOCKED_IMPORT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  const basename = normalized.split("/").pop()?.toLowerCase() ?? "";
  if (SKIPPED_IMPORT_FILENAMES.has(basename)) return null;
  if (isBlockedEnvImportFilename(basename)) return null;
  return normalized;
}

export function shouldTreatAsText(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const basename = lowerPath.split("/").pop() ?? "";
  if (TEXT_BASENAMES.has(basename)) return true;
  for (const extension of TEXT_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) return true;
  }
  return false;
}

export function shouldTreatAsImportBinary(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  for (const extension of IMPORT_BINARY_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) return true;
  }
  return false;
}

export type ExtractImportedFilesOptions = {
  maxBinaryFileBytes?: number;
  maxBinaryTotalBytes?: number;
  maxFiles?: number;
};

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

/** Unwrap at most one persisted `base64:` envelope so re-imported ZIPs stay single-wrapped. */
export function normalizeImportedBinaryBytes(buffer: Buffer): Buffer {
  const serialized = buffer.toString("utf8");
  if (!serialized.startsWith(BINARY_BASE64_PREFIX)) return buffer;
  const decoded = decodeCanonicalBase64(serialized.slice(BINARY_BASE64_PREFIX.length));
  return decoded ?? buffer;
}

export function encodeImportedBinaryContent(bytes: Buffer): string {
  return `${BINARY_BASE64_PREFIX}${bytes.toString("base64")}`;
}

export function decodeImportedBinaryContent(content: string): Buffer | null {
  if (!content.startsWith(BINARY_BASE64_PREFIX)) return null;
  return decodeCanonicalBase64(content.slice(BINARY_BASE64_PREFIX.length));
}

function declaredUncompressedSize(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const data = (entry as { _data?: unknown })._data;
  if (!data || typeof data !== "object") return null;
  const size = (data as { uncompressedSize?: unknown }).uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : null;
}

/** Skip before decompress only when the ZIP entry cannot be a legal decoded file or one persisted envelope. */
export function maxDeclaredImportBinaryBytes(maxDecodedBytes: number): number {
  return BINARY_BASE64_PREFIX.length + 4 * Math.ceil(maxDecodedBytes / 3);
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

function stripCommonArchiveRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const segments = paths.map((filePath) => filePath.split("/").filter(Boolean));
  const first = segments[0]?.[0];
  if (!first) return paths;
  const shouldStrip = segments.every((parts) => parts.length > 1 && parts[0] === first);
  if (!shouldStrip) return paths;
  return segments.map((parts) => parts.slice(1).join("/"));
}

export function decodeLocalZipContent(base64: string): Buffer {
  if (base64.length > MAX_LOCAL_ZIP_BASE64_CHARS) {
    throw new ImportInitError({
      message: `Lokal ZIP får vara högst ${Math.floor(MAX_LOCAL_ZIP_UPLOAD_BYTES / (1024 * 1024) * 10) / 10} MB när den skickas via formuläret.`,
      code: "zip_too_large",
      step: "download",
      status: 413,
    });
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength === 0) {
    throw new ImportInitError({
      message: "ZIP-innehållet är ogiltigt.",
      code: "zip_invalid",
      step: "extract",
      status: 400,
    });
  }
  if (buffer.byteLength > MAX_LOCAL_ZIP_UPLOAD_BYTES) {
    throw new ImportInitError({
      message: `Lokal ZIP får vara högst ${Math.floor(MAX_LOCAL_ZIP_UPLOAD_BYTES / (1024 * 1024) * 10) / 10} MB när den skickas via formuläret.`,
      code: "zip_too_large",
      step: "download",
      status: 413,
    });
  }
  return buffer;
}

export async function extractImportedFilesFromZip(
  buffer: Buffer,
  options: ExtractImportedFilesOptions = {},
): Promise<CodeFile[]> {
  const maxBinaryFileBytes = options.maxBinaryFileBytes ?? MAX_IMPORTED_BINARY_FILE_BYTES;
  const maxBinaryTotalBytes = options.maxBinaryTotalBytes ?? MAX_IMPORTED_BINARY_BYTES;
  const maxFiles = options.maxFiles ?? MAX_IMPORTED_FILES;
  const maxDeclaredBinaryBytes = maxDeclaredImportBinaryBytes(maxBinaryFileBytes);
  const zip = await JSZip.loadAsync(buffer);
  const rawEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  const normalizedEntries = stripCommonArchiveRoot(rawEntries);

  const files: CodeFile[] = [];
  let totalTextBytes = 0;
  let totalBinaryBytes = 0;

  for (let index = 0; index < rawEntries.length; index += 1) {
    const originalName = rawEntries[index];
    const strippedName = normalizedEntries[index];
    const safePath = normalizeImportedPath(strippedName);
    if (!safePath) continue;

    const asText = shouldTreatAsText(safePath);
    const asBinary = !asText && shouldTreatAsImportBinary(safePath);
    if (!asText && !asBinary) continue;

    const entry = zip.files[originalName];
    if (asBinary) {
      const declared = declaredUncompressedSize(entry);
      if (declared != null && declared > maxDeclaredBinaryBytes) continue;
    }

    const contentBuffer = Buffer.from(await entry.async("uint8array"));

    if (asText) {
      if (looksBinary(contentBuffer)) continue;
      totalTextBytes += contentBuffer.byteLength;
      if (totalTextBytes > MAX_IMPORTED_TEXT_BYTES) {
        throw new ImportInitError({
          message: "Importerat projekt innehåller för mycket text.",
          code: "zip_too_large",
          step: "extract",
          status: 413,
        });
      }
      if (files.length >= maxFiles) {
        throw new ImportInitError({
          message: `För många filer i importen (${files.length} >= ${maxFiles}).`,
          code: "zip_invalid",
          step: "extract",
          status: 400,
        });
      }
      files.push({
        path: safePath,
        content: contentBuffer.toString("utf8"),
        language: inferFileLanguage(safePath),
      });
      continue;
    }

    const binaryBytes = normalizeImportedBinaryBytes(contentBuffer);
    if (binaryBytes.byteLength > maxBinaryFileBytes) continue;
    if (totalBinaryBytes + binaryBytes.byteLength > maxBinaryTotalBytes) continue;
    if (files.length >= maxFiles) continue;
    totalBinaryBytes += binaryBytes.byteLength;
    files.push({
      path: safePath,
      content: encodeImportedBinaryContent(binaryBytes),
      language: "binary",
    });
  }

  return files;
}

export function findPrimaryImportedFile(files: Array<{ path: string; content: string }>): string {
  if (files.length === 0) return "";
  const mainFile =
    files.find(
      (file) =>
        file.path.includes("app/page.tsx") ||
        file.path.includes("src/app/page.tsx") ||
        file.path.endsWith("page.tsx") ||
        file.path.endsWith("Page.tsx"),
    ) ??
    files.find((file) => file.path.endsWith(".tsx")) ??
    files[0];
  return mainFile?.content ?? "";
}
