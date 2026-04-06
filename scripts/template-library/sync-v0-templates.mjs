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
 * Usage:
 *   node scripts/template-library/sync-v0-templates.mjs
 *   node scripts/template-library/sync-v0-templates.mjs --dry-run
 *   node scripts/template-library/sync-v0-templates.mjs --force
 *   node scripts/template-library/sync-v0-templates.mjs --source=local-manifest
 */

import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const V0_OG_IMAGE_BASE = "https://v0.app/chat/api/og/t";

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
  if (await fileExists(LOCAL_MANIFEST_PATHS.downloaded)) {
    const downloadedRows = await readJsonl(LOCAL_MANIFEST_PATHS.downloaded);
    for (const row of downloadedRows) {
      const templateId =
        row && typeof row === "object" && typeof row.templateId === "string"
          ? row.templateId.trim()
          : "";
      if (!templateId) continue;
      downloadedCount += 1;
      discoveredIds.add(templateId);
      addSourceSlugs(templateToSourceCategories, templateId, row.sourceSlugs);
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
  };
}


const LOCAL_METADATA_DIR = resolve(process.cwd(), "templates_v0/out/template-metadata");

function buildFallbackPreviewImageUrl(templateId) {
  return `${V0_OG_IMAGE_BASE}/${templateId}`;
}

async function readLocalTemplateMeta(templateId) {
  const metadataPath = resolve(LOCAL_METADATA_DIR, `${templateId}.json`);
  try {
    const raw = JSON.parse(await readFile(metadataPath, "utf8"));
    const title = normalizeTitle(
      raw.ogTitle || raw.h1 || "",
      templateId,
    );
    const previewImageUrl =
      String(raw.ogImage || "").trim() || buildFallbackPreviewImageUrl(templateId);
    return { templateId, title, previewImageUrl };
  } catch {
    return {
      templateId,
      title: templateId,
      previewImageUrl: buildFallbackPreviewImageUrl(templateId),
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
    preview_image_url: meta.previewImageUrl || buildFallbackPreviewImageUrl(meta.templateId),
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

  const { discoveredTemplateIds, templateToSourceCategories, sourceCategorySizes } = discovery;
  if (discoveredTemplateIds.length === 0) {
    throw new Error("No templates discovered from source pages.");
  }

  const previousTemplates = await readJson(PATHS.templates, []);
  if (
    !forceWrite &&
    Array.isArray(previousTemplates) &&
    previousTemplates.length > 0 &&
    discoveredTemplateIds.length < Math.floor(previousTemplates.length * 0.6)
  ) {
    throw new Error(
      `Safety check failed: discovered ${discoveredTemplateIds.length} templates, previous file has ${previousTemplates.length}. Use --force if this drop is expected.`,
    );
  }

  const hasLocalMetadata = await fileExists(LOCAL_METADATA_DIR);
  console.log(`[templates:sync] Reading metadata for ${discoveredTemplateIds.length} templates${hasLocalMetadata ? " (from local files)" : " (fallback titles)"}...`);
  const metas = await Promise.all(
    discoveredTemplateIds.map((templateId) => readLocalTemplateMeta(templateId)),
  );

  const templates = metas.map((meta) =>
    buildTemplateRecord(meta, [...(templateToSourceCategories.get(meta.templateId) || new Set())]),
  );
  const categoryMapping = buildCategoryMapping(discoveredTemplateIds, templateToSourceCategories);

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
  console.log("  Missing preview images:", missingPreviews);
  console.log("  Fallback titles (id used):", fallbackTitles);
  console.log("  Source category sizes:", sourceCategorySizes);

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
