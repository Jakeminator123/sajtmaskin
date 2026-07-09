#!/usr/bin/env node
/**
 * Upload v0 template zips from the "mallar" split-layout intake folder to Vercel
 * Blob and (re)write the blob catalog so the on-site "Mallar"/templates gallery
 * shows exactly the uploaded templates.
 *
 * This is the ONLY write path for the Blob catalog (the older parallel
 * sync-blob-catalog.mjs, which replaced the whole manifest without merging,
 * was removed 2026-07-09).
 *
 * Intake layout ("mallar" split layout):
 *     <source>/out/downloaded.jsonl             templateId -> logged zip path (source of truth)
 *     <source>/out/template-metadata/<id>.json  title + v0 category metadata
 *     <source>/downloads/<swedish-cat>/<id>/*.zip
 *     <source>/downloads/template-images/<cat>/<id>/{listing,detail}/*.jpg|png|webp
 *   The logged category spelling can drift from the on-disk folder
 *   (e.g. "webbplatsmallar" vs "webplatsmallar"), so we locate zips by the
 *   <templateId> folder, not by the logged path.
 *
 * Category derivation (most-authoritative first):
 *   1. v0's own primary category parsed from the template page's ogTitle
 *      ("<Title> - <Category> Templates - v0 by Vercel") in template-metadata.
 *   2. sourceSlugs from downloaded.jsonl (v0 listing pages the template was
 *      found on, excluding the browse-all catch-all).
 *   3. The on-disk intake folder name (legacy behavior, spelling-drift-safe).
 *   The intake folder reflects WHICH v0 listing page the scraper happened to
 *   be on, so it routinely mislabels cross-listed templates — that is why the
 *   template's own metadata wins.
 *
 * A still image (listing image preferred, first detail screenshot otherwise)
 * is uploaded to Blob per template so the gallery shows real thumbnails in
 * prod (templates_v0/ is gitignored, so local files never reach prod).
 *
 * Outputs (consumed by the app):
 *   - src/lib/templates/template-blob-manifest.json  (runtime blob source,
 *       src/lib/templates/local-v0-template-source.ts sourceKind:"blob")
 *   - with --write-catalog also:
 *       src/lib/templates/templates.json             (gallery catalog)
 *       src/lib/templates/template-categories.json   (category mapping)
 *
 * Incremental by default: a template already present in the manifest with the
 * same archive SHA-256 is NOT re-uploaded (pass --overwrite to force). Templates
 * from earlier runs that are not re-discovered are preserved in the manifest.
 *
 * Usage:
 *   node scripts/v0-templates/upload-mallar-blob.mjs                         # dry-run
 *   node scripts/v0-templates/upload-mallar-blob.mjs --upload                # upload missing + write manifest
 *   node scripts/v0-templates/upload-mallar-blob.mjs --upload --write-catalog
 *   node scripts/v0-templates/upload-mallar-blob.mjs --upload --write-catalog --source=../mallar
 *   Flags:
 *     --source=<path>   Intake folder (default: ../mallar relative to repo root)
 *     --blob-prefix=<p> Blob key prefix (default: v0-templates)
 *     --limit=<n>       Only process the first n discovered templates
 *     --ids=a,b,c       Only process these template ids
 *     --overwrite       Re-upload even if the manifest already has the same SHA-256
 *     --write-catalog   Also regenerate templates.json + template-categories.json
 */

import { put } from "@vercel/blob";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { config as loadDotenv } from "dotenv";

const ROOT = process.cwd();
loadDotenv({ path: resolve(ROOT, ".env.local"), override: false });
loadDotenv({ path: resolve(ROOT, ".env"), override: false });

const DEFAULT_SOURCE = "../mallar";
const DEFAULT_BLOB_PREFIX = "v0-templates";
const MANIFEST_PATH = resolve(ROOT, "src/lib/templates/template-blob-manifest.json");
const TEMPLATES_PATH = resolve(ROOT, "src/lib/templates/templates.json");
const CATEGORY_MAP_PATH = resolve(ROOT, "src/lib/templates/template-categories.json");
const MAX_IMPORT_ARCHIVE_BYTES = 50 * 1024 * 1024;

// Preview-host payload limits (preview-host/src/validate.js). Templates over these
// are uploaded to Blob but excluded from the gallery catalog, because clicking them
// would fail at preview-start ("Invalid filesJson: file too large / total payload too large").
const PREVIEW_MAX_FILE_BYTES = 2 * 1024 * 1024;
const PREVIEW_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const BINARY_BASE64_PREFIX = "base64:";
const BLOCKED_IMPORT_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
];
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

const APP_CATEGORY_ID_LIST = [
  "ai",
  "animations",
  "components",
  "login-and-sign-up",
  "blog-and-portfolio",
  "design-systems",
  "layouts",
  "landing-pages",
  "dashboards",
  "e-commerce",
  "website-templates",
  "apps-and-games",
];
const APP_CATEGORY_IDS = new Set(APP_CATEGORY_ID_LIST);

// Swedish (and English) source-folder names AND v0 sourceSlugs -> app category id.
const SOURCE_TO_APP_CATEGORY = {
  ai: "ai",
  agents: "ai",
  agenter: "ai",
  animations: "animations",
  animationer: "animations",
  components: "components",
  komponenter: "components",
  "login-and-sign-up": "login-and-sign-up",
  "inloggning-och-registrering": "login-and-sign-up",
  "inlogg-och-registrering": "login-and-sign-up",
  "blog-and-portfolio": "blog-and-portfolio",
  "blogg-och-portfolio": "blog-and-portfolio",
  "blog-och-portfolio": "blog-and-portfolio",
  "design-systems": "design-systems",
  designsystem: "design-systems",
  layouts: "layouts",
  layouter: "layouts",
  "website-templates": "website-templates",
  webbplatsmallar: "website-templates",
  webplatsmallar: "website-templates",
  "landing-pages": "landing-pages",
  landningssidor: "landing-pages",
  ecommerce: "e-commerce",
  "e-commerce": "e-commerce",
  "e-handel": "e-commerce",
  dashboards: "dashboards",
  instrumentpaneler: "dashboards",
  "apps-and-games": "apps-and-games",
  "appar-och-spel": "apps-and-games",
  "alla-mallar": "website-templates",
};

// v0's own category label from the template page's ogTitle
// ("<Title> - <Category> Templates - v0 by Vercel") -> app category id.
const V0_TITLE_CATEGORY_TO_APP = {
  ai: "ai",
  agents: "ai",
  animations: "animations",
  components: "components",
  "login & sign up": "login-and-sign-up",
  "blog & portfolio": "blog-and-portfolio",
  "design systems": "design-systems",
  layouts: "layouts",
  "landing pages": "landing-pages",
  dashboards: "dashboards",
  commerce: "e-commerce",
  "e-commerce": "e-commerce",
  "website templates": "website-templates",
  "apps & games": "apps-and-games",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const IMAGE_CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const argv = process.argv.slice(2);
const upload = argv.includes("--upload");
const dryRun = !upload;
const overwrite = argv.includes("--overwrite");
const writeCatalog = argv.includes("--write-catalog");
const sourceArg = readArg("--source") ?? DEFAULT_SOURCE;
const blobPrefix = stripSlashes(readArg("--blob-prefix") ?? DEFAULT_BLOB_PREFIX);
const limit = parsePositiveInt(readArg("--limit"));
const idAllowlist = parseIdList(readArg("--ids"));

function readArg(name) {
  const prefix = `${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function parsePositiveInt(value) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseIdList(value) {
  if (!value) return null;
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function stripSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function toRepoRelative(absolutePath) {
  return relative(ROOT, absolutePath).split(/[\\/]/).join("/");
}

function basenameOf(rawPath) {
  return String(rawPath || "").split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function normalizeCategoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/&/g, " och ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapAppCategory(sourceCategory) {
  const key = normalizeCategoryKey(sourceCategory);
  const mapped = SOURCE_TO_APP_CATEGORY[key];
  return mapped && APP_CATEGORY_IDS.has(mapped) ? mapped : "website-templates";
}

/** v0's own primary category from ogTitle/twitterTitle, or null. */
function parseV0TitleCategory(metadata) {
  const candidates = [metadata?.ogTitle, metadata?.twitterTitle];
  for (const raw of candidates) {
    const match = /[-\u2013]\s*([^-\u2013]+?)\s*Templates?\s*[-\u2013]\s*v0/i.exec(String(raw || ""));
    if (!match) continue;
    const mapped = V0_TITLE_CATEGORY_TO_APP[match[1].trim().toLowerCase()];
    if (mapped && APP_CATEGORY_IDS.has(mapped)) return mapped;
  }
  return null;
}

/** First mappable non-browse-all sourceSlug from downloaded.jsonl, or null. */
function mapSourceSlugsCategory(sourceSlugs) {
  for (const slug of Array.isArray(sourceSlugs) ? sourceSlugs : []) {
    const key = normalizeCategoryKey(slug);
    if (!key || key === "browse-all" || key === "alla-mallar") continue;
    const mapped = SOURCE_TO_APP_CATEGORY[key];
    if (mapped && APP_CATEGORY_IDS.has(mapped)) return mapped;
  }
  return null;
}

/**
 * Category priority: template's own v0 metadata (ogTitle) -> v0 listing slugs
 * -> intake folder. The folder only says which listing page the scraper was
 * on, so cross-listed templates end up in the wrong folder — metadata wins.
 */
function deriveAppCategory({ metadata, sourceSlugs, sourceCategory }) {
  const fromTitle = parseV0TitleCategory(metadata);
  if (fromTitle) return { category: fromTitle, categorySource: "v0-title" };
  const fromSlugs = mapSourceSlugsCategory(sourceSlugs);
  if (fromSlugs) return { category: fromSlugs, categorySource: "source-slugs" };
  return { category: mapAppCategory(sourceCategory), categorySource: "intake-folder" };
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
      if (/ Templates$/i.test(trailing)) cleaned = cleaned.slice(0, dashIndex).trim();
    }
  }
  return cleaned || fallbackId;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, fallback = null) {
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
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function readExistingManifestItems() {
  const manifest = await readJson(MANIFEST_PATH, null);
  const templates = manifest && Array.isArray(manifest.templates) ? manifest.templates : [];
  const byId = new Map();
  for (const item of templates) {
    if (item && typeof item.id === "string" && item.id.trim()) {
      byId.set(item.id.trim(), item);
    }
  }
  return byId;
}

/** templateId -> { preferredBasename, sourceSlugs } from downloaded.jsonl (last row wins). */
async function readCanonicalDownloadRows(sourceRoot) {
  const logPath = resolve(sourceRoot, "out/downloaded.jsonl");
  if (!(await fileExists(logPath))) {
    throw new Error(`Missing downloaded.jsonl at ${logPath}`);
  }
  const rows = await readJsonl(logPath);
  const byId = new Map();
  for (const row of rows) {
    const templateId = typeof row?.templateId === "string" ? row.templateId.trim() : "";
    const rowPath = typeof row?.path === "string" ? row.path.trim() : "";
    if (!templateId || !rowPath) continue;
    byId.set(templateId, {
      templateId,
      preferredBasename: basenameOf(rowPath),
      sourceSlugs: Array.isArray(row?.sourceSlugs) ? row.sourceSlugs : [],
    });
  }
  return byId;
}

/** Locate the zip by scanning downloads/<category>/<templateId>/ (spelling-drift safe). */
async function locateZip(sourceRoot, templateId, preferredBasename) {
  const downloadsRoot = resolve(sourceRoot, "downloads");
  let categoryEntries;
  try {
    categoryEntries = await readdir(downloadsRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory() || categoryEntry.name === "template-images") continue;
    const templateDir = resolve(downloadsRoot, categoryEntry.name, templateId);
    if (!(await fileExists(templateDir))) continue;
    let files;
    try {
      files = await readdir(templateDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const zips = files.filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".zip"));
    if (zips.length === 0) continue;
    const preferred = preferredBasename && zips.find((f) => f.name === preferredBasename);
    if (preferred) {
      return { absolutePath: resolve(templateDir, preferred.name), sourceCategory: categoryEntry.name };
    }
    const withStats = await Promise.all(
      zips.map(async (f) => {
        const abs = resolve(templateDir, f.name);
        return { abs, mtimeMs: (await stat(abs)).mtimeMs };
      }),
    );
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { absolutePath: withStats[0].abs, sourceCategory: categoryEntry.name };
  }
  return null;
}

async function readTemplateMetadata(sourceRoot, templateId) {
  return readJson(resolve(sourceRoot, "out/template-metadata", `${templateId}.json`), null);
}

function titleFromMetadata(metadata, templateId) {
  if (!metadata) return templateId;
  return normalizeTitle(metadata.ogTitle || metadata.h1 || metadata.twitterTitle || "", templateId);
}

/**
 * Locate the best still image for a template: a curated listing image if one
 * exists, otherwise the first detail screenshot (D001_… sorts first). Scans
 * every category folder under downloads/template-images/ (spelling-drift safe).
 */
async function locateStillImage(sourceRoot, templateId) {
  const imagesRoot = resolve(sourceRoot, "downloads", "template-images");
  let categoryEntries;
  try {
    categoryEntries = await readdir(imagesRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) continue;
    const templateDir = resolve(imagesRoot, categoryEntry.name, templateId);
    if (!(await fileExists(templateDir))) continue;
    for (const subdir of ["listing", "detail"]) {
      let files;
      try {
        files = await readdir(resolve(templateDir, subdir), { withFileTypes: true });
      } catch {
        continue;
      }
      const images = files
        .filter((f) => f.isFile() && IMAGE_EXTENSIONS.has(extnameLower(f.name)))
        .map((f) => f.name)
        .sort((a, b) => a.localeCompare(b));
      if (images.length > 0) {
        return resolve(templateDir, subdir, images[0]);
      }
    }
  }
  return null;
}

function extnameLower(fileName) {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

async function uploadStillImage(templateId, absolutePath, buffer) {
  const ext = extnameLower(absolutePath);
  const key = `${blobPrefix}/images/${templateId}/still${ext}`;
  if (dryRun) return { url: `blob-dry-run://${key}` };
  const blob = await put(key, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: IMAGE_CONTENT_TYPES[ext] || "application/octet-stream",
  });
  return { url: blob.url };
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

/**
 * Replicate the imported preview payload (text vs base64) and check the preview-host
 * limits, so we can flag/exclude templates the VM would reject at preview-start.
 * On any parse error we default to "fits" (do not block on an unreadable edge case).
 */
async function computePreviewFit(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const rawEntries = Object.values(zip.files).filter((e) => !e.dir).map((e) => e.name);
    const normalized = stripCommonArchiveRoot(rawEntries);
    let totalBytes = 0;
    let maxFileBytes = 0;
    for (let i = 0; i < rawEntries.length; i += 1) {
      const safePath = normalizeImportedPath(normalized[i]);
      if (!safePath) continue;
      const content = Buffer.from(await zip.files[rawEntries[i]].async("uint8array"));
      const isText = shouldTreatAsText(safePath) && !looksBinary(content);
      const payloadBytes = isText
        ? Buffer.byteLength(content.toString("utf8"), "utf8")
        : Buffer.byteLength(BINARY_BASE64_PREFIX + content.toString("base64"), "utf8");
      totalBytes += payloadBytes;
      if (payloadBytes > maxFileBytes) maxFileBytes = payloadBytes;
    }
    return {
      fits: maxFileBytes <= PREVIEW_MAX_FILE_BYTES && totalBytes <= PREVIEW_MAX_TOTAL_BYTES,
      totalBytes,
      maxFileBytes,
    };
  } catch {
    return { fits: true, totalBytes: 0, maxFileBytes: 0 };
  }
}

function blobKeyFor(appCategory, templateId) {
  return `${blobPrefix}/raw/${appCategory}/${templateId}/template.zip`;
}

async function uploadZip(appCategory, templateId, buffer) {
  const key = blobKeyFor(appCategory, templateId);
  if (dryRun) return { url: `blob-dry-run://${key}` };
  const blob = await put(key, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: "application/zip",
  });
  return { url: blob.url };
}

function buildCatalogFiles(items) {
  // Exclude templates that would be rejected by the preview host so the gallery
  // never exposes a clickable template that can't open in the VM.
  const catalogItems = items.filter((item) => item.previewFits !== false);
  const templates = catalogItems.map((item) => {
    const stillUrl =
      typeof item.stillImageUrl === "string" && item.stillImageUrl.startsWith("http")
        ? item.stillImageUrl
        : null;
    return {
      id: item.id,
      title: item.title || item.id,
      slug: item.id,
      // Blob still image when available; local-disk API route only as fallback
      // (templates_v0/ is gitignored, so the route always falls back in prod).
      preview_image_url: stillUrl ?? `/api/template-image/${item.id}`,
      preview_still_url: stillUrl,
      archive_url: item.archiveUrl,
      image_filename: `${item.id}.jpg`,
      category: APP_CATEGORY_IDS.has(item.category) ? item.category : "website-templates",
    };
  });

  const categoryMap = Object.fromEntries(APP_CATEGORY_ID_LIST.map((id) => [id, []]));
  for (const item of catalogItems) {
    const cat = APP_CATEGORY_IDS.has(item.category) ? item.category : "website-templates";
    categoryMap[cat].push(item.id);
  }
  for (const id of APP_CATEGORY_ID_LIST) categoryMap[id].sort((a, b) => a.localeCompare(b));

  return {
    templates,
    categoryFile: {
      _comment: "Auto-generated template categorization from Vercel Blob template manifest",
      _version: "3.0.0",
      _lastUpdated: todayIsoDate(),
      _source: toRepoRelative(MANIFEST_PATH),
      _discoveryMode: "blob-manifest",
      ...categoryMap,
    },
  };
}

async function main() {
  if (writeCatalog && dryRun) {
    throw new Error("--write-catalog requires --upload (needs real Blob URLs in the catalog).");
  }
  if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set — cannot upload to Vercel Blob.");
  }

  const sourceRoot = isAbsolute(sourceArg) ? sourceArg : resolve(ROOT, sourceArg);
  console.log("[mallar-blob] Source:", sourceRoot);
  console.log("[mallar-blob] Mode:", dryRun ? "dry-run" : "upload");
  if (idAllowlist) console.log("[mallar-blob] ID allowlist:", [...idAllowlist].join(", "));
  if (limit) console.log("[mallar-blob] Limit:", limit);

  const existingById = await readExistingManifestItems();
  const canonicalRows = await readCanonicalDownloadRows(sourceRoot);

  const candidates = [];
  const missingZip = [];
  for (const [templateId, row] of canonicalRows) {
    if (idAllowlist && !idAllowlist.has(templateId)) continue;
    const located = await locateZip(sourceRoot, templateId, row.preferredBasename);
    if (!located) {
      missingZip.push(templateId);
      continue;
    }
    const info = await stat(located.absolutePath);
    if (info.size > MAX_IMPORT_ARCHIVE_BYTES) {
      console.warn(`[mallar-blob] Skipping ${templateId}: archive ${info.size} bytes over import limit`);
      continue;
    }
    const metadata = await readTemplateMetadata(sourceRoot, templateId);
    const derived = deriveAppCategory({
      metadata,
      sourceSlugs: row.sourceSlugs,
      sourceCategory: located.sourceCategory,
    });
    candidates.push({
      templateId,
      absolutePath: located.absolutePath,
      sourceCategory: located.sourceCategory,
      appCategory: derived.category,
      categorySource: derived.categorySource,
      title: titleFromMetadata(metadata, templateId),
      sizeBytes: info.size,
    });
  }

  candidates.sort((a, b) => a.templateId.localeCompare(b.templateId));
  const selected = limit ? candidates.slice(0, limit) : candidates;

  console.log("[mallar-blob] Existing manifest templates:", existingById.size);
  console.log("[mallar-blob] Templates in log:", canonicalRows.size);
  console.log("[mallar-blob] With zip on disk:", candidates.length);
  console.log("[mallar-blob] Selected:", selected.length);
  if (missingZip.length > 0) console.log("[mallar-blob] Log entries without zip on disk:", missingZip.length);

  const mergedById = new Map(existingById);
  let uploadedCount = 0;
  let skippedCount = 0;
  let previewBlockedCount = 0;
  let imageUploadedCount = 0;
  let imageSkippedCount = 0;
  let imageMissingCount = 0;
  for (const candidate of selected) {
    const title = candidate.title;
    const buffer = await readFile(candidate.absolutePath);
    const archiveSha256 = createHash("sha256").update(buffer).digest("hex");
    const previewFit = await computePreviewFit(buffer);
    if (!previewFit.fits) previewBlockedCount += 1;
    const existing = existingById.get(candidate.templateId);
    const alreadyUploaded =
      !overwrite &&
      existing &&
      typeof existing.archiveUrl === "string" &&
      existing.archiveUrl.startsWith("http") &&
      existing.archiveSha256 === archiveSha256;

    let archiveUrl;
    if (alreadyUploaded) {
      archiveUrl = existing.archiveUrl;
      skippedCount += 1;
      console.log(`[mallar-blob] skip (already uploaded, same sha) ${candidate.templateId}`);
    } else {
      const uploaded = await uploadZip(candidate.appCategory, candidate.templateId, buffer);
      archiveUrl = uploaded.url;
      uploadedCount += 1;
      console.log(
        `[mallar-blob] ${dryRun ? "would upload" : "uploaded"} ${candidate.templateId} ` +
          `(${candidate.sourceCategory} -> ${candidate.appCategory}, ${candidate.sizeBytes} bytes)`,
      );
    }
    if (!previewFit.fits) {
      console.log(
        `[mallar-blob] preview-blocked ${candidate.templateId} ` +
          `(maxFile=${(previewFit.maxFileBytes / 1024 / 1024).toFixed(2)}MB, ` +
          `total=${(previewFit.totalBytes / 1024 / 1024).toFixed(1)}MB) — excluded from catalog`,
      );
    }

    // Still image: sha-based incremental, same discipline as the archive.
    let stillImageUrl =
      existing && typeof existing.stillImageUrl === "string" ? existing.stillImageUrl : null;
    let stillImageSha256 =
      existing && typeof existing.stillImageSha256 === "string" ? existing.stillImageSha256 : null;
    const stillPath = await locateStillImage(sourceRoot, candidate.templateId);
    if (stillPath) {
      const imageBuffer = await readFile(stillPath);
      const imageSha = createHash("sha256").update(imageBuffer).digest("hex");
      const imageAlreadyUploaded =
        !overwrite &&
        stillImageUrl &&
        stillImageUrl.startsWith("http") &&
        stillImageSha256 === imageSha;
      if (imageAlreadyUploaded) {
        imageSkippedCount += 1;
      } else {
        const uploadedImage = await uploadStillImage(candidate.templateId, stillPath, imageBuffer);
        stillImageUrl = uploadedImage.url;
        stillImageSha256 = imageSha;
        imageUploadedCount += 1;
      }
    } else if (!stillImageUrl) {
      imageMissingCount += 1;
    }

    mergedById.set(candidate.templateId, {
      id: candidate.templateId,
      title,
      slug: candidate.templateId,
      category: candidate.appCategory,
      categorySource: candidate.categorySource,
      sourceCategory: candidate.sourceCategory,
      source: "v0-blob",
      archiveUrl,
      archiveSizeBytes: candidate.sizeBytes,
      archiveSha256,
      stillImageUrl,
      stillImageSha256,
      previewFits: previewFit.fits,
      previewMaxFileBytes: previewFit.maxFileBytes,
      previewTotalBytes: previewFit.totalBytes,
    });
  }

  const items = [...mergedById.values()].sort((a, b) => a.id.localeCompare(b.id));

  console.log(`[mallar-blob] Uploaded: ${uploadedCount} | Skipped (already uploaded): ${skippedCount}`);
  console.log(
    `[mallar-blob] Still images — uploaded: ${imageUploadedCount} | skipped (same sha): ${imageSkippedCount} | missing on disk: ${imageMissingCount}`,
  );
  console.log(`[mallar-blob] Preview-blocked (excluded from catalog): ${previewBlockedCount}`);
  console.log(`[mallar-blob] Manifest total after merge: ${items.length}`);

  const manifest = {
    _comment: "Generated by scripts/v0-templates/upload-mallar-blob.mjs from the mallar split-layout intake.",
    _version: "1.0.0",
    _lastUpdated: new Date().toISOString(),
    _source: sourceArg,
    templates: items,
  };

  if (dryRun) {
    console.log("[mallar-blob] Dry-run complete. Re-run with --upload (--write-catalog) to persist.");
    return;
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("[mallar-blob] Wrote manifest:", MANIFEST_PATH, `(${items.length} templates)`);

  if (writeCatalog) {
    const { templates, categoryFile } = buildCatalogFiles(items);
    await writeFile(TEMPLATES_PATH, `${JSON.stringify(templates, null, 2)}\n`, "utf8");
    await writeFile(CATEGORY_MAP_PATH, `${JSON.stringify(categoryFile, null, 2)}\n`, "utf8");
    console.log("[mallar-blob] Wrote catalog:", TEMPLATES_PATH);
    console.log("[mallar-blob] Wrote categories:", CATEGORY_MAP_PATH);
  }
}

main().catch((error) => {
  console.error("[mallar-blob] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
