#!/usr/bin/env node
/**
 * Sync v0 templates and category mapping from local manifests.
 *
 * Data source: the local manifest created by templates_v0 intake scripts:
 * - templates_v0/out/collected-template-ids.json  (required)
 * - templates_v0/out/downloaded.jsonl             (optional enrichment)
 * - templates_v0/out/template-metadata/*.json     (title + preview image)
 *
 * Regenerates:
 * - src/lib/templates/templates.json
 * - src/lib/templates/template-categories.json
 *
 * Canonical entrypoint:
 *   node scripts/v0-templates/sync-v0-templates.mjs
 *   node scripts/v0-templates/sync-v0-templates.mjs --dry-run
 *   node scripts/v0-templates/sync-v0-templates.mjs --force
 *   node scripts/v0-templates/sync-v0-templates.mjs --source=local-manifest
 */

import JSZip from "jszip";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";

const LOCAL_IMAGE_API_PREFIX = "/api/template-image";
const LOCAL_TEMPLATE_DOWNLOADS_PREFIX = "templates_v0/downloads/";
const TEMPLATE_IMAGES_ROOT = resolve(process.cwd(), "templates_v0/downloads/template-images");
const MAX_IMPORT_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_IMPORTABLE_FILES = 600;
const MAX_IMPORTABLE_TEXT_BYTES = 16 * 1024 * 1024;
const BLOCKED_IMPORT_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
];
const IMPORTABLE_TEXT_EXTENSIONS = new Set([
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
const IMPORTABLE_TEXT_BASENAMES = new Set([
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

const APP_CATEGORY_IDS = [
  "ai",
  "animations",
  "components",
  "login-and-sign-up",
  "blog-and-portfolio",
  "design-systems",
  "layouts",
  "website-templates",
  "apps-and-games",
];

// Priority decides the primary category when a template appears in multiple sources.
const APP_CATEGORY_PRIORITY = [
  "ai",
  "apps-and-games",
  "components",
  "login-and-sign-up",
  "blog-and-portfolio",
  "design-systems",
  "layouts",
  "animations",
  "website-templates",
];

const SOURCE_TO_APP_CATEGORY = {
  ai: "ai",
  agents: "ai",
  animations: "animations",
  components: "components",
  "login-and-sign-up": "login-and-sign-up",
  "blog-and-portfolio": "blog-and-portfolio",
  "design-systems": "design-systems",
  layouts: "layouts",
  "website-templates": "website-templates",
  "landing-pages": "website-templates",
  ecommerce: "website-templates",
  dashboards: "apps-and-games",
  "apps-and-games": "apps-and-games",
};

const PATHS = {
  templates: resolve(process.cwd(), "src/lib/templates/templates.json"),
  categoryMap: resolve(process.cwd(), "src/lib/templates/template-categories.json"),
};

const LOCAL_MANIFEST_PATHS = {
  collected: resolve(process.cwd(), "templates_v0/out/collected-template-ids.json"),
  downloaded: resolve(process.cwd(), "templates_v0/out/downloaded.jsonl"),
};

const SOURCE_MODE_OPTIONS = new Set(["auto", "local-manifest"]);

const argv = process.argv.slice(2);
const args = new Set(argv.filter((arg) => !arg.startsWith("--source=")));
const sourceArg = argv.find((arg) => arg.startsWith("--source="));
const sourceMode = sourceArg ? sourceArg.slice("--source=".length).trim() : "auto";
const isDryRun = args.has("--dry-run");
const forceWrite = args.has("--force");

function unique(values) {
  return [...new Set(values)];
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeSlashes(path) {
  return String(path || "").replace(/\\/g, "/");
}

function normalizeDownloadedArchivePath(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return null;
  const normalized = normalizeSlashes(trimmed).replace(/^\.\/+/, "");
  const marker = LOCAL_TEMPLATE_DOWNLOADS_PREFIX.toLowerCase();
  const markerIndex = normalized.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex);
  }
  if (!isAbsolute(trimmed)) {
    return normalized;
  }
  return null;
}

function resolveArchivePath(rawPath) {
  const normalized = normalizeDownloadedArchivePath(rawPath);
  if (normalized) {
    return resolve(process.cwd(), normalized);
  }
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

function normalizeDownloadedRows(rows) {
  let rewrittenPathCount = 0;
  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const rawPath = typeof row.path === "string" ? row.path.trim() : "";
    if (!rawPath) return row;
    const normalizedPath = normalizeDownloadedArchivePath(rawPath);
    if (!normalizedPath || normalizedPath === rawPath) return row;
    rewrittenPathCount += 1;
    return {
      ...row,
      path: normalizedPath,
    };
  });
  return { normalizedRows, rewrittenPathCount };
}

function toJsonl(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function normalizeImportedPath(rawPath) {
  const normalized = String(rawPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  if (BLOCKED_IMPORT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  return normalized;
}

function shouldTreatAsImportableText(filePath) {
  const lowerPath = String(filePath || "").toLowerCase();
  const basename = lowerPath.split("/").pop() ?? "";
  if (IMPORTABLE_TEXT_BASENAMES.has(basename)) return true;
  for (const extension of IMPORTABLE_TEXT_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) return true;
  }
  return false;
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

function looksBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;
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

async function isArchiveImportable(archivePath) {
  try {
    const archiveBuffer = await readFile(archivePath);
    if (archiveBuffer.byteLength > MAX_IMPORT_ARCHIVE_BYTES) {
      return {
        importable: false,
        reason: `archive bytes exceed ${MAX_IMPORT_ARCHIVE_BYTES}`,
      };
    }

    const zip = await JSZip.loadAsync(archiveBuffer);
    const rawEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name);
    const normalizedEntries = stripCommonArchiveRoot(rawEntries);

    let importedFileCount = 0;
    let totalTextBytes = 0;

    for (let index = 0; index < rawEntries.length; index += 1) {
      const originalName = rawEntries[index];
      const strippedName = normalizedEntries[index];
      const safePath = normalizeImportedPath(strippedName);
      if (!safePath) continue;
      if (!shouldTreatAsImportableText(safePath)) continue;

      const entry = zip.files[originalName];
      const contentBuffer = Buffer.from(await entry.async("uint8array"));
      if (looksBinary(contentBuffer)) continue;

      importedFileCount += 1;
      totalTextBytes += contentBuffer.byteLength;

      if (importedFileCount > MAX_IMPORTABLE_FILES) {
        return {
          importable: false,
          reason: `importable files exceed ${MAX_IMPORTABLE_FILES}`,
        };
      }
      if (totalTextBytes > MAX_IMPORTABLE_TEXT_BYTES) {
        return {
          importable: false,
          reason: `text bytes exceed ${MAX_IMPORTABLE_TEXT_BYTES}`,
        };
      }
    }

    return {
      importable: importedFileCount > 0,
      reason: importedFileCount > 0 ? null : "no importable text files",
    };
  } catch (error) {
    return {
      importable: false,
      reason: error instanceof Error ? error.message : "unknown importability error",
    };
  }
}

function normalizeTitle(raw, fallbackId) {
  let cleaned = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*AI Templates\s*-\s*v0 by Vercel$/i, "")
    .replace(/\s*-\s*v0 by Vercel$/i, "")
    .trim();

  if (/ Templates$/i.test(cleaned)) {
    const dashIndex = Math.max(cleaned.lastIndexOf(" - "), cleaned.lastIndexOf(" – "));
    if (dashIndex > 0) {
      const trailing = cleaned.slice(dashIndex + 3);
      if (/ Templates$/i.test(trailing)) {
        cleaned = cleaned.slice(0, dashIndex).trim();
      }
    }
  }

  return cleaned || fallbackId;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function readJsonl(path) {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${message}`);
      }
    });
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return unique(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function addSourceSlugs(templateToSourceCategories, templateId, rawSourceSlugs) {
  const sourceSlugs = normalizeStringList(rawSourceSlugs);
  if (sourceSlugs.length === 0) return;
  if (!templateToSourceCategories.has(templateId)) {
    templateToSourceCategories.set(templateId, new Set());
  }
  const bucket = templateToSourceCategories.get(templateId);
  for (const sourceSlug of sourceSlugs) {
    bucket.add(sourceSlug);
  }
}

function buildSourceCategorySizes(templateToSourceCategories) {
  const counts = {};
  for (const sourceSlugs of templateToSourceCategories.values()) {
    for (const sourceSlug of sourceSlugs) {
      counts[sourceSlug] = (counts[sourceSlug] || 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function loadLocalManifestSource() {
  if (!(await fileExists(LOCAL_MANIFEST_PATHS.collected))) {
    return null;
  }

  const collected = await readJson(LOCAL_MANIFEST_PATHS.collected, null);
  if (!collected || !Array.isArray(collected.ids)) {
    throw new Error(
      `Local manifest is invalid: expected an "ids" array in ${LOCAL_MANIFEST_PATHS.collected}`,
    );
  }

  const templateToSourceCategories = new Map();
  const discoveredIds = new Set(normalizeStringList(collected.ids));

  const templateSourceSlugs =
    collected && typeof collected === "object" && collected.templateSourceSlugs
      ? collected.templateSourceSlugs
      : {};

  if (templateSourceSlugs && typeof templateSourceSlugs === "object") {
    for (const [rawTemplateId, rawSourceSlugs] of Object.entries(templateSourceSlugs)) {
      const templateId = String(rawTemplateId || "").trim();
      if (!templateId) continue;
      discoveredIds.add(templateId);
      addSourceSlugs(templateToSourceCategories, templateId, rawSourceSlugs);
    }
  }

  let downloadedCount = 0;
  let downloadedPathRewriteCount = 0;
  let downloadedMissingArchiveRows = 0;
  let normalizedDownloadedRows = [];
  const zipBackedTemplateIds = new Set();
  const zipArchivePathByTemplateId = new Map();
  if (await fileExists(LOCAL_MANIFEST_PATHS.downloaded)) {
    const downloadedRowsRaw = await readJsonl(LOCAL_MANIFEST_PATHS.downloaded);
    const normalizedResult = normalizeDownloadedRows(downloadedRowsRaw);
    normalizedDownloadedRows = normalizedResult.normalizedRows;
    downloadedPathRewriteCount = normalizedResult.rewrittenPathCount;

    for (const row of normalizedDownloadedRows) {
      const templateId =
        row && typeof row === "object" && typeof row.templateId === "string"
          ? row.templateId.trim()
          : "";
      const rowPath = row && typeof row === "object" && typeof row.path === "string"
        ? row.path.trim()
        : "";
      if (!templateId) continue;
      downloadedCount += 1;
      discoveredIds.add(templateId);
      addSourceSlugs(templateToSourceCategories, templateId, row.sourceSlugs);
      if (!rowPath) continue;
      const archivePath = resolveArchivePath(rowPath);
      if (await fileExists(archivePath)) {
        zipBackedTemplateIds.add(templateId);
        zipArchivePathByTemplateId.set(templateId, archivePath);
      } else {
        downloadedMissingArchiveRows += 1;
      }
    }
  }

  const discoveredTemplateIds = [...discoveredIds].sort((a, b) => a.localeCompare(b));
  for (const templateId of discoveredTemplateIds) {
    if (!templateToSourceCategories.has(templateId)) {
      templateToSourceCategories.set(templateId, new Set());
    }
  }

  return {
    mode: "local-manifest",
    label: "templates_v0/out manifest",
    source: LOCAL_MANIFEST_PATHS.collected,
    discoveredTemplateIds,
    templateToSourceCategories,
    sourceCategorySizes: buildSourceCategorySizes(templateToSourceCategories),
    manifestTemplateCount: normalizeStringList(collected.ids).length,
    downloadedCount,
    zipBackedTemplateIds: [...zipBackedTemplateIds].sort((a, b) => a.localeCompare(b)),
    zipArchivePathByTemplateId,
    normalizedDownloadedRows,
    downloadedPathRewriteCount,
    downloadedMissingArchiveRows,
  };
}


const LOCAL_METADATA_DIR = resolve(process.cwd(), "templates_v0/out/template-metadata");
const IMAGE_FILE_REGEX = /\.(jpe?g|png|webp|gif|svg)$/i;

async function readDirEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readTemplateIdsWithMetadata() {
  const metadataEntries = await readDirEntries(LOCAL_METADATA_DIR);
  const ids = new Set();
  for (const entry of metadataEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    const templateId = entry.name.slice(0, -5).trim();
    if (!templateId) continue;
    ids.add(templateId);
  }
  return ids;
}

async function templateDirectoryHasImages(path) {
  const directEntries = await readDirEntries(path);
  for (const entry of directEntries) {
    if (entry.isFile() && IMAGE_FILE_REGEX.test(entry.name)) {
      return true;
    }
  }

  for (const subdirName of ["listing", "detail"]) {
    const subdirEntries = await readDirEntries(resolve(path, subdirName));
    if (subdirEntries.some((entry) => entry.isFile() && IMAGE_FILE_REGEX.test(entry.name))) {
      return true;
    }
  }

  return false;
}

async function readTemplateIdsWithImages() {
  const categories = await readDirEntries(TEMPLATE_IMAGES_ROOT);
  const ids = new Set();
  for (const category of categories) {
    if (!category.isDirectory()) continue;
    const categoryPath = resolve(TEMPLATE_IMAGES_ROOT, category.name);
    const templateEntries = await readDirEntries(categoryPath);
    for (const templateEntry of templateEntries) {
      if (!templateEntry.isDirectory()) continue;
      const templateId = templateEntry.name.trim();
      if (!templateId) continue;
      const templatePath = resolve(categoryPath, templateEntry.name);
      if (await templateDirectoryHasImages(templatePath)) {
        ids.add(templateId);
      }
    }
  }
  return ids;
}

function buildLocalImageUrl(templateId) {
  return `${LOCAL_IMAGE_API_PREFIX}/${templateId}`;
}

async function readLocalTemplateMeta(templateId) {
  const metadataPath = resolve(LOCAL_METADATA_DIR, `${templateId}.json`);
  try {
    const raw = JSON.parse(await readFile(metadataPath, "utf8"));
    const title = normalizeTitle(
      raw.ogTitle || raw.h1 || "",
      templateId,
    );
    return { templateId, title, previewImageUrl: buildLocalImageUrl(templateId) };
  } catch {
    return {
      templateId,
      title: templateId,
      previewImageUrl: buildLocalImageUrl(templateId),
    };
  }
}

function pickPrimaryCategory(sourceSlugs) {
  const mapped = unique(
    sourceSlugs
      .map((slug) => SOURCE_TO_APP_CATEGORY[slug])
      .filter((categoryId) => Boolean(categoryId) && APP_CATEGORY_IDS.includes(categoryId)),
  );
  for (const candidate of APP_CATEGORY_PRIORITY) {
    if (mapped.includes(candidate)) return candidate;
  }
  return "website-templates";
}

function buildTemplateRecord(meta, sourceSlugs) {
  const categoryId = pickPrimaryCategory(sourceSlugs);
  return {
    id: meta.templateId,
    title: meta.title || meta.templateId,
    slug: meta.templateId,
    preview_image_url: meta.previewImageUrl || buildLocalImageUrl(meta.templateId),
    image_filename: `${meta.templateId}.jpg`,
    category: categoryId,
  };
}

function buildCategoryMapping(templateIds, templateToSourceCategories) {
  const mapping = Object.fromEntries(APP_CATEGORY_IDS.map((categoryId) => [categoryId, []]));

  for (const templateId of templateIds) {
    const sourceSlugs = [...(templateToSourceCategories.get(templateId) || new Set())];
    const categoryId = pickPrimaryCategory(sourceSlugs);
    mapping[categoryId].push(templateId);
  }

  for (const categoryId of APP_CATEGORY_IDS) {
    mapping[categoryId].sort((a, b) => a.localeCompare(b));
  }

  return mapping;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  if (!SOURCE_MODE_OPTIONS.has(sourceMode)) {
    throw new Error(
      `Unsupported --source value "${sourceMode}". Use one of: ${[...SOURCE_MODE_OPTIONS].join(", ")}`,
    );
  }

  const discovery = await loadLocalManifestSource();
  if (!discovery) {
    throw new Error(
      `No local manifest found at ${LOCAL_MANIFEST_PATHS.collected}. Run the templates_v0 intake first.`,
    );
  }

  console.log(`[templates:sync] Discovery source: ${discovery.label}`);
  console.log(`  Source ref: ${discovery.source}`);
  if (discovery.mode === "local-manifest") {
    console.log(`  Manifest templates: ${discovery.manifestTemplateCount}`);
    console.log(`  Downloaded ZIP rows: ${discovery.downloadedCount}`);
  }

  const {
    discoveredTemplateIds,
    templateToSourceCategories,
    sourceCategorySizes,
    zipBackedTemplateIds,
    zipArchivePathByTemplateId,
    normalizedDownloadedRows,
    downloadedPathRewriteCount,
    downloadedMissingArchiveRows,
  } = discovery;

  if (discoveredTemplateIds.length === 0) {
    throw new Error("No templates discovered from source pages.");
  }

  if (downloadedPathRewriteCount > 0) {
    if (isDryRun) {
      console.log(
        `[templates:sync] Dry-run: would rewrite ${downloadedPathRewriteCount} downloaded.jsonl path values to repo-relative form.`,
      );
    } else {
      await writeFile(LOCAL_MANIFEST_PATHS.downloaded, toJsonl(normalizedDownloadedRows), "utf8");
      console.log(
        `[templates:sync] Normalized ${downloadedPathRewriteCount} downloaded.jsonl path values to repo-relative form.`,
      );
    }
  }

  const zipBackedIdSet = new Set(zipBackedTemplateIds);
  const metadataIdSet = await readTemplateIdsWithMetadata();
  const imageIdSet = await readTemplateIdsWithImages();
  const completeTemplateIds = discoveredTemplateIds.filter(
    (templateId) =>
      zipBackedIdSet.has(templateId) &&
      metadataIdSet.has(templateId) &&
      imageIdSet.has(templateId),
  );

  const importableTemplateIds = [];
  const droppedImportability = [];
  for (const templateId of completeTemplateIds) {
    const archivePath = zipArchivePathByTemplateId.get(templateId);
    if (!archivePath) {
      droppedImportability.push({ templateId, reason: "missing archive path mapping" });
      continue;
    }
    const importCheck = await isArchiveImportable(archivePath);
    if (importCheck.importable) {
      importableTemplateIds.push(templateId);
    } else {
      droppedImportability.push({
        templateId,
        reason: importCheck.reason || "not importable",
      });
    }
  }

  if (importableTemplateIds.length === 0) {
    throw new Error(
      "No importable templates found (requires ZIP + metadata + images + import budget compliance).",
    );
  }

  const previousTemplates = await readJson(PATHS.templates, []);
  if (
    !forceWrite &&
    Array.isArray(previousTemplates) &&
    previousTemplates.length > 0 &&
    importableTemplateIds.length < Math.floor(previousTemplates.length * 0.6)
  ) {
    throw new Error(
      `Safety check failed: filtered ${importableTemplateIds.length} templates, previous file has ${previousTemplates.length}. Use --force if this drop is expected.`,
    );
  }

  console.log(
    `[templates:sync] Reading metadata for ${importableTemplateIds.length} importable templates...`,
  );
  const metas = await Promise.all(
    importableTemplateIds.map((templateId) => readLocalTemplateMeta(templateId)),
  );

  const templates = metas.map((meta) =>
    buildTemplateRecord(meta, [...(templateToSourceCategories.get(meta.templateId) || new Set())]),
  );
  const categoryMapping = buildCategoryMapping(importableTemplateIds, templateToSourceCategories);

  const categoryFile = {
    _comment: "Auto-generated template categorization from local templates_v0 manifests",
    _version: "2.0.0",
    _lastUpdated: todayIsoDate(),
    _source: discovery.source,
    _discoveryMode: discovery.mode,
    ...categoryMapping,
  };

  const missingPreviews = templates.filter((item) => !item.preview_image_url).length;
  const fallbackTitles = templates.filter((item) => item.title === item.id).length;

  console.log("[templates:sync] Summary");
  console.log("  Templates discovered:", discoveredTemplateIds.length);
  console.log("  ZIP-backed templates:", zipBackedIdSet.size);
  console.log("  Metadata templates:", metadataIdSet.size);
  console.log("  Image-backed templates:", imageIdSet.size);
  console.log("  Templates after ZIP+metadata+images filter:", completeTemplateIds.length);
  console.log("  Templates after importability filter:", importableTemplateIds.length);
  console.log("  Importability dropped templates:", droppedImportability.length);
  console.log("  downloaded.jsonl rewritten paths:", downloadedPathRewriteCount);
  console.log("  downloaded.jsonl missing archive rows:", downloadedMissingArchiveRows);
  console.log("  Missing preview images:", missingPreviews);
  console.log("  Fallback titles (id used):", fallbackTitles);
  console.log("  Source category sizes:", sourceCategorySizes);
  if (droppedImportability.length > 0) {
    const preview = droppedImportability
      .slice(0, 10)
      .map((row) => `${row.templateId} (${row.reason})`)
      .join(", ");
    console.log("  Importability dropped preview:", preview);
  }

  if (isDryRun) {
    console.log("[templates:sync] Dry-run mode enabled. No files written.");
    return;
  }

  await writeFile(PATHS.templates, `${JSON.stringify(templates, null, 2)}\n`, "utf8");
  await writeFile(PATHS.categoryMap, `${JSON.stringify(categoryFile, null, 2)}\n`, "utf8");

  console.log("[templates:sync] Updated files:");
  console.log("  -", PATHS.templates);
  console.log("  -", PATHS.categoryMap);
}

main().catch((error) => {
  console.error("[templates:sync] Failed:", error);
  process.exitCode = 1;
});
