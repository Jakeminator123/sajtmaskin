#!/usr/bin/env node
/**
 * Build/upload a v0 template Blob manifest from the newer per-template folder layout.
 *
 * Expected source:
 *   downloads/<category>/<slug>__<templateId>/
 *     metadata.json
 *     template.zip
 *     listing/*
 *     detail/*
 *
 * Default mode is dry-run. Add --upload --write-manifest to upload files to Vercel
 * Blob and update src/lib/templates/template-blob-manifest.json.
 */

import { put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { config as loadDotenv } from "dotenv";

const ROOT = process.cwd();
loadDotenv({ path: resolve(ROOT, ".env.local"), override: false });
loadDotenv({ path: resolve(ROOT, ".env"), override: false });
const DEFAULT_SOURCE = "test_förslag_templates_blob";
const DEFAULT_BLOB_PREFIX = "v0-templates";
const MANIFEST_PATH = resolve(ROOT, "src/lib/templates/template-blob-manifest.json");
const TEMPLATES_PATH = resolve(ROOT, "src/lib/templates/templates.json");
const CATEGORY_MAP_PATH = resolve(ROOT, "src/lib/templates/template-categories.json");
const LISTING_FRAME_DURATION_MS = 500;
const MAX_IMPORT_ARCHIVE_BYTES = 50 * 1024 * 1024;
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
  "inloggning och registrering": "login-and-sign-up",
  "blog-and-portfolio": "blog-and-portfolio",
  "blogg-och-portfolio": "blog-and-portfolio",
  "blogg och portfolio": "blog-and-portfolio",
  "design-systems": "design-systems",
  designsystem: "design-systems",
  layouts: "layouts",
  layouter: "layouts",
  "website-templates": "website-templates",
  "webbplatsmallar": "website-templates",
  "landing-pages": "website-templates",
  landningssidor: "website-templates",
  ecommerce: "website-templates",
  "e-handel": "website-templates",
  dashboards: "apps-and-games",
  instrumentpaneler: "apps-and-games",
  "apps-and-games": "apps-and-games",
  "appar-och-spel": "apps-and-games",
  "appar och spel": "apps-and-games",
  "alla-mallar": "website-templates",
  "alla mallar": "website-templates",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);
const ANIMATED_EXTENSIONS = new Set([".gif", ".webp", ".mp4", ".webm"]);
const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

const argv = process.argv.slice(2);
const upload = argv.includes("--upload");
const dryRun = argv.includes("--dry-run") || !upload;
const writeManifest = argv.includes("--write-manifest");
const writeCatalog = argv.includes("--write-catalog");
const overwrite = argv.includes("--overwrite");
const force = argv.includes("--force");
const sourceArg = readArg("--source") ?? DEFAULT_SOURCE;
const blobPrefix = stripSlashes(readArg("--blob-prefix") ?? DEFAULT_BLOB_PREFIX);
const limit = parsePositiveInt(readArg("--limit"));

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

function stripSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function toRepoRelative(absolutePath) {
  const rel = relative(ROOT, absolutePath);
  return rel.split(/[\\/]/).join("/");
}

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/&/g, " och ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value, fallback = "template") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function inferTemplateId(folderName, metadata) {
  if (typeof metadata?.templateId === "string" && metadata.templateId.trim()) {
    return metadata.templateId.trim();
  }
  const parts = folderName.split("__");
  return (parts.length > 1 ? parts.at(-1) : folderName).trim();
}

function inferSlug(folderName, metadata, templateId) {
  const parts = folderName.split("__");
  if (parts.length > 1 && parts[0]?.trim()) return slugify(parts[0], templateId);
  if (typeof metadata?.canonical === "string") {
    const match = metadata.canonical.match(/\/templates\/([^/?#]+)/i);
    if (match?.[1]) return slugify(match[1].replace(new RegExp(`${templateId}$`, "i"), ""), templateId);
  }
  return slugify(metadata?.ogTitle || metadata?.twitterTitle || metadata?.h1 || templateId, templateId);
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

function mapAppCategory(sourceCategory) {
  const normalized = normalizeCategory(sourceCategory);
  const dashed = normalized.replace(/\s+/g, "-");
  return SOURCE_TO_APP_CATEGORY[normalized] || SOURCE_TO_APP_CATEGORY[dashed] || "website-templates";
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

async function readFileEntries(path, extensions = null) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = resolve(path, entry.name);
      const extension = extname(entry.name).toLowerCase();
      if (extensions && !extensions.has(extension)) continue;
      const info = await stat(absolutePath);
      files.push({
        absolutePath,
        filename: entry.name,
        extension,
        sizeBytes: info.size,
      });
    }
    return files.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

function blobKeyFor(template, relativeFilePath) {
  return `${blobPrefix}/raw/${template.category}/${template.slug}__${template.id}/${relativeFilePath
    .split(/[\\/]/)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function uploadFile(template, absolutePath, relativeFilePath) {
  const key = blobKeyFor(template, relativeFilePath);
  if (dryRun) {
    return {
      key,
      url: `blob-dry-run://${key}`,
    };
  }
  const contentType = CONTENT_TYPES[extname(absolutePath).toLowerCase()] || "application/octet-stream";
  const blob = await put(key, createReadStream(absolutePath), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType,
  });
  return {
    key,
    url: blob.url,
  };
}

function classifyPreview({ listingFiles, detailFiles }) {
  const listingMedia = listingFiles.filter((file) =>
    IMAGE_EXTENSIONS.has(file.extension) || VIDEO_EXTENSIONS.has(file.extension),
  );
  const animatedListing = listingMedia.find((file) => ANIMATED_EXTENSIONS.has(file.extension));
  const likelyFrameFiles = listingMedia.filter((file) => /^L\d{3}_/i.test(file.filename));
  const still = listingMedia[0] || detailFiles.find((file) => IMAGE_EXTENSIONS.has(file.extension)) || null;

  if (animatedListing) {
    return {
      still,
      loopKind: VIDEO_EXTENSIONS.has(animatedListing.extension) ? "video" : "animated-image",
      loopFile: animatedListing,
      frameFiles: [],
      frameDurationMs: null,
    };
  }

  if (likelyFrameFiles.length >= 3) {
    return {
      still,
      loopKind: "frames",
      loopFile: null,
      frameFiles: likelyFrameFiles.slice(0, 12),
      frameDurationMs: LISTING_FRAME_DURATION_MS,
    };
  }

  return {
    still,
    loopKind: "none",
    loopFile: null,
    frameFiles: [],
    frameDurationMs: null,
  };
}

async function discoverTemplates(sourceRoot) {
  const downloadsRoot = resolve(sourceRoot, "downloads");
  if (!(await fileExists(downloadsRoot))) {
    throw new Error(`Missing downloads directory: ${downloadsRoot}`);
  }

  const categoryEntries = await readdir(downloadsRoot, { withFileTypes: true });
  const templates = [];

  for (const categoryEntry of categoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!categoryEntry.isDirectory()) continue;
    const sourceCategory = categoryEntry.name;
    const categoryPath = resolve(downloadsRoot, sourceCategory);
    const templateEntries = await readdir(categoryPath, { withFileTypes: true });

    for (const templateEntry of templateEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!templateEntry.isDirectory()) continue;
      const templatePath = resolve(categoryPath, templateEntry.name);
      const metadataPath = resolve(templatePath, "metadata.json");
      const archivePath = resolve(templatePath, "template.zip");
      const metadata = await readJson(metadataPath, {});
      const id = inferTemplateId(templateEntry.name, metadata);
      if (!id) continue;
      const slug = inferSlug(templateEntry.name, metadata, id);
      const category = mapAppCategory(sourceCategory);
      const [listingFiles, detailFiles] = await Promise.all([
        readFileEntries(resolve(templatePath, "listing")),
        readFileEntries(resolve(templatePath, "detail")),
      ]);
      const archiveExists = await fileExists(archivePath);
      const archiveInfo = archiveExists ? await stat(archivePath) : null;
      const preview = classifyPreview({ listingFiles, detailFiles });
      templates.push({
        id,
        slug,
        title: normalizeTitle(metadata.ogTitle || metadata.twitterTitle || metadata.h1, id),
        category,
        sourceCategory,
        sourcePath: toRepoRelative(templatePath),
        templatePath,
        metadata,
        metadataPath,
        archivePath,
        archiveExists,
        archiveSizeBytes: archiveInfo?.size ?? 0,
        listingFiles,
        detailFiles,
        preview,
      });
    }
  }

  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

async function buildManifestItem(template) {
  if (!template.archiveExists) {
    throw new Error(`Missing template.zip for ${template.id} (${template.sourcePath})`);
  }
  if (template.archiveSizeBytes > MAX_IMPORT_ARCHIVE_BYTES) {
    throw new Error(
      `template.zip exceeds import limit for ${template.id}: ${template.archiveSizeBytes} > ${MAX_IMPORT_ARCHIVE_BYTES}`,
    );
  }

  const archiveSha256 = await sha256File(template.archivePath);
  const archiveUpload = await uploadFile(template, template.archivePath, "template.zip");
  const metadataUpload = (await fileExists(template.metadataPath))
    ? await uploadFile(template, template.metadataPath, "metadata.json")
    : null;

  const listingUploads = [];
  for (const file of template.listingFiles) {
    const uploadResult = await uploadFile(template, file.absolutePath, `listing/${file.filename}`);
    listingUploads.push({
      filename: file.filename,
      url: uploadResult.url,
      sizeBytes: file.sizeBytes,
      sha256: await sha256File(file.absolutePath),
    });
  }

  const detailUploads = [];
  for (const file of template.detailFiles) {
    const uploadResult = await uploadFile(template, file.absolutePath, `detail/${file.filename}`);
    detailUploads.push({
      filename: file.filename,
      url: uploadResult.url,
      sizeBytes: file.sizeBytes,
      sha256: await sha256File(file.absolutePath),
    });
  }

  const findUploadedListing = (file) =>
    file ? listingUploads.find((item) => item.filename === file.filename) || null : null;
  const findUploadedDetail = (file) =>
    file ? detailUploads.find((item) => item.filename === file.filename) || null : null;
  const previewStill =
    findUploadedListing(template.preview.still) || findUploadedDetail(template.preview.still) || null;
  const previewLoop = findUploadedListing(template.preview.loopFile);
  const previewFrames = template.preview.frameFiles
    .map((file) => findUploadedListing(file))
    .filter(Boolean);

  return {
    id: template.id,
    title: template.title,
    slug: template.slug,
    category: template.category,
    sourceCategory: template.sourceCategory,
    sourcePath: template.sourcePath,
    source: "v0-blob",
    archiveUrl: archiveUpload.url,
    archiveSizeBytes: template.archiveSizeBytes,
    archiveSha256,
    metadataUrl: metadataUpload?.url ?? null,
    previewStillUrl: previewStill?.url ?? null,
    previewLoopUrl: previewLoop?.url ?? null,
    previewLoopKind: template.preview.loopKind,
    previewLoopFrameDurationMs: template.preview.frameDurationMs,
    previewFrameUrls: previewFrames.map((item) => item.url),
    listingImages: listingUploads,
    detailImages: detailUploads,
  };
}

function buildCatalogFiles(manifestItems) {
  const templates = manifestItems.map((item) => ({
    id: item.id,
    title: item.title || item.id,
    slug: item.id,
    preview_image_url: item.previewStillUrl || `/api/template-image/${item.id}`,
    preview_still_url: item.previewStillUrl || null,
    preview_loop_url: item.previewLoopUrl || null,
    preview_loop_kind: item.previewLoopKind || "none",
    preview_loop_frame_duration_ms: item.previewLoopFrameDurationMs,
    preview_frame_urls: item.previewFrameUrls || [],
    archive_url: item.archiveUrl,
    image_filename: `${item.id}.jpg`,
    category: item.category,
  }));

  const categoryMap = Object.fromEntries(APP_CATEGORY_IDS.map((categoryId) => [categoryId, []]));
  for (const item of manifestItems) {
    categoryMap[item.category].push(item.id);
  }
  for (const categoryId of APP_CATEGORY_IDS) {
    categoryMap[categoryId].sort((a, b) => a.localeCompare(b));
  }

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  if (writeManifest && dryRun) {
    throw new Error("--write-manifest requires --upload so manifest URLs are real Blob URLs.");
  }
  if (writeCatalog && !writeManifest && !force) {
    throw new Error("--write-catalog should be used together with --write-manifest, or pass --force.");
  }

  const sourceRoot = isAbsolute(sourceArg) ? sourceArg : resolve(ROOT, sourceArg);
  const discovered = await discoverTemplates(sourceRoot);
  const selected = limit ? discovered.slice(0, limit) : discovered;

  console.log("[templates:blob] Source:", sourceRoot);
  console.log("[templates:blob] Mode:", dryRun ? "dry-run" : "upload");
  console.log("[templates:blob] Templates discovered:", discovered.length);
  console.log("[templates:blob] Templates selected:", selected.length);

  const missingArchives = selected.filter((template) => !template.archiveExists);
  const tooLargeArchives = selected.filter(
    (template) => template.archiveExists && template.archiveSizeBytes > MAX_IMPORT_ARCHIVE_BYTES,
  );
  const uploadableTemplates = selected.filter(
    (template) => template.archiveExists && template.archiveSizeBytes <= MAX_IMPORT_ARCHIVE_BYTES,
  );
  const frameLoops = selected.filter((template) => template.preview.loopKind === "frames").length;
  const animatedLoops = selected.filter((template) =>
    ["animated-image", "video"].includes(template.preview.loopKind),
  ).length;

  console.log("[templates:blob] Missing archives:", missingArchives.length);
  console.log("[templates:blob] Archives over import limit:", tooLargeArchives.length);
  console.log("[templates:blob] Listing frame loops:", frameLoops);
  console.log("[templates:blob] Native animated loops:", animatedLoops);
  console.log("[templates:blob] Uploadable templates:", uploadableTemplates.length);

  if (dryRun) {
    for (const template of selected.slice(0, 10)) {
      console.log(
        `  - ${template.id} ${template.category} zip=${template.archiveExists ? template.archiveSizeBytes : "missing"} preview=${template.preview.loopKind}`,
      );
    }
    console.log("[templates:blob] Dry-run complete. Add --upload --write-manifest to upload.");
    return;
  }

  const manifestItems = [];
  for (const template of uploadableTemplates) {
    console.log(`[templates:blob] Uploading ${template.id} (${template.sourceCategory})`);
    manifestItems.push(await buildManifestItem(template));
  }

  const manifest = {
    _comment: "Auto-generated by scripts/v0-templates/sync-blob-catalog.mjs",
    _version: "1.0.0",
    _lastUpdated: new Date().toISOString(),
    _source: toRepoRelative(sourceRoot),
    templates: manifestItems,
  };

  if (writeManifest) {
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log("[templates:blob] Wrote manifest:", MANIFEST_PATH);
  }

  if (writeCatalog) {
    const { templates, categoryFile } = buildCatalogFiles(manifestItems);
    await writeFile(TEMPLATES_PATH, `${JSON.stringify(templates, null, 2)}\n`, "utf8");
    await writeFile(CATEGORY_MAP_PATH, `${JSON.stringify(categoryFile, null, 2)}\n`, "utf8");
    console.log("[templates:blob] Wrote catalog:", TEMPLATES_PATH);
    console.log("[templates:blob] Wrote categories:", CATEGORY_MAP_PATH);
  }
}

main().catch((error) => {
  console.error("[templates:blob] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
