import JSZip from "jszip";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import type { CodeFile } from "@/lib/gen/parser";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import blobManifestData from "./template-blob-manifest.json";

const DOWNLOADED_LOG_PATH = resolve(process.cwd(), "templates_v0/out/downloaded.jsonl");
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_IMPORTED_FILES = 600;
const MAX_IMPORTED_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_IMPORTED_BINARY_BYTES = 32 * 1024 * 1024;
/**
 * Prefix prepended to base64-encoded binary file content so that the preview-host
 * can distinguish text from binary when writing to the workspace filesystem.
 */
const BINARY_BASE64_PREFIX = "base64:";
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

    return {
      templateId: trimmedId,
      sourceKind: "local",
      archivePath,
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

/**
 * Env files (`.env`, `.env.local`, `.env.production`, …) may carry secrets and
 * must never be copied from a template archive into a generated project.
 */
function isBlockedEnvBasename(basename: string): boolean {
  return basename === ".env" || basename.startsWith(".env.");
}

export function normalizeImportedPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  if (BLOCKED_IMPORT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  const basename = normalized.split("/").pop()?.toLowerCase() ?? "";
  if (isBlockedEnvBasename(basename)) return null;
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

async function readRemoteArchiveBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
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

async function readArchiveBuffer(source: LocalV0TemplateSource): Promise<Buffer> {
  if (source.sourceKind === "blob") {
    if (!source.archiveUrl) {
      throw new Error("Template Blob archive URL is missing");
    }
    return readRemoteArchiveBuffer(source.archiveUrl);
  }

  if (!source.archivePath) {
    throw new Error("Local template archive path is missing");
  }
  return readLocalArchiveBuffer(source.archivePath);
}

async function extractImportedFilesFromZip(buffer: Buffer): Promise<CodeFile[]> {
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
      totalBinaryBytes += contentBuffer.byteLength;
      if (totalBinaryBytes > MAX_IMPORTED_BINARY_BYTES) continue;
      files.push({
        path: safePath,
        content: BINARY_BASE64_PREFIX + contentBuffer.toString("base64"),
        language: "binary",
      });
    }
  }

  return files;
}

export async function loadLocalV0TemplateFiles(
  templateId: string,
): Promise<{ source: LocalV0TemplateSource; files: CodeFile[] } | null> {
  const source = await getLocalV0TemplateSourceById(templateId);
  if (!source) return null;

  const buffer = await readArchiveBuffer(source);
  const files = await extractImportedFilesFromZip(buffer);
  if (files.length === 0) {
    throw new Error("No supported text files found in local template archive");
  }

  return { source, files };
}
