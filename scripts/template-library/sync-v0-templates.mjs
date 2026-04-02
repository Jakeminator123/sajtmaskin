#!/usr/bin/env node
/**
 * Sync v0 templates and category mapping.
 *
 * Preferred discovery source is the local manifest created by templates_v0:
 * - templates_v0/out/collected-template-ids.json
 * - templates_v0/out/downloaded.jsonl (optional enrichment)
 *
 * If no local manifest exists, the script falls back to discovering templates
 * from v0.app category pages directly and regenerates:
 * - src/lib/templates/templates.json
 * - src/lib/templates/template-categories.json
 *
 * Usage:
 *   node scripts/template-library/sync-v0-templates.mjs
 *   node scripts/template-library/sync-v0-templates.mjs --dry-run
 *   node scripts/template-library/sync-v0-templates.mjs --force
 *   node scripts/template-library/sync-v0-templates.mjs --source=local-manifest
 *   node scripts/template-library/sync-v0-templates.mjs --source=remote-html
 */

import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { load as loadHtml } from "cheerio";

const BASE_URL = "https://v0.app";
const TEMPLATES_URL = `${BASE_URL}/templates`;
const CATEGORIES_URL = `${TEMPLATES_URL}/categories`;
const USER_AGENT = "sajtmaskin-template-sync/1.0 (+https://sajtmaskin.se)";

const TEMPLATE_ID_MIN_LEN = 10;
const TEMPLATE_ID_MAX_LEN = 16;

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

const IGNORED_SOURCE_SLUGS = new Set([
  "categories",
  "submissions",
  "screenshots",
  "assets",
  "templates",
]);

const PATHS = {
  templates: resolve(process.cwd(), "src/lib/templates/templates.json"),
  categoryMap: resolve(process.cwd(), "src/lib/templates/template-categories.json"),
};

const LOCAL_MANIFEST_PATHS = {
  collected: resolve(process.cwd(), "templates_v0/out/collected-template-ids.json"),
  downloaded: resolve(process.cwd(), "templates_v0/out/downloaded.jsonl"),
};

const SOURCE_MODE_OPTIONS = new Set(["auto", "local-manifest", "remote-html"]);

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

function sanitizePathToSlug(href) {
  const trimmed = String(href || "").trim();
  if (!trimmed.startsWith("/templates/")) return null;
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] || "";
  const parts = withoutQuery.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[1] || null;
}

function isLikelyTemplateId(value) {
  if (!value) return false;
  if (!/^[A-Za-z0-9]+$/.test(value)) return false;
  if (value.length < TEMPLATE_ID_MIN_LEN || value.length > TEMPLATE_ID_MAX_LEN) return false;
  // Avoid plain words like "screenshots" while allowing real IDs.
  return /[A-Z0-9]/.test(value);
}

function normalizeTitle(raw, fallbackId) {
  let cleaned = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*AI Templates\s*-\s*v0 by Vercel$/i, "")
    .replace(/\s*-\s*v0 by Vercel$/i, "")
    .trim();

  // Remove trailing category suffixes like " - Apps & Games Templates".
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

function extractTemplateIds(html) {
  const $ = loadHtml(html);
  const links = $("a[href^='/templates/']")
    .map((_, el) => String($(el).attr("href") || ""))
    .get();
  return unique(
    links
      .map(sanitizePathToSlug)
      .filter((value) => Boolean(value) && isLikelyTemplateId(value)),
  );
}

function extractCategorySlugs(html) {
  const $ = loadHtml(html);
  const links = $("a[href^='/templates/']")
    .map((_, el) => String($(el).attr("href") || ""))
    .get();
  const slugs = unique(links.map(sanitizePathToSlug).filter(Boolean));
  return slugs.filter(
    (slug) =>
      Boolean(slug) &&
      /^[a-z-]+$/.test(slug) &&
      !IGNORED_SOURCE_SLUGS.has(slug) &&
      !slug.startsWith("page-"),
  );
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return await response.text();
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
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

async function discoverTemplatesFromRemoteHtml() {
  console.log("[templates:sync] Fetching category index...");
  const categoriesHtml = await fetchHtml(CATEGORIES_URL);
  const discoveredSourceSlugs = unique([
    ...extractCategorySlugs(categoriesHtml),
    ...Object.keys(SOURCE_TO_APP_CATEGORY),
  ]).sort((a, b) => a.localeCompare(b));

  const unknownSourceSlugs = discoveredSourceSlugs.filter((slug) => !SOURCE_TO_APP_CATEGORY[slug]);
  if (unknownSourceSlugs.length > 0) {
    console.warn(
      "[templates:sync] Unmapped source categories found (fallback -> website-templates):",
      unknownSourceSlugs.join(", "),
    );
  }

  const templateToSourceCategories = new Map();
  const sourceCategorySizes = {};

  console.log(`[templates:sync] Fetching ${discoveredSourceSlugs.length} source categories...`);
  for (const sourceSlug of discoveredSourceSlugs) {
    const url = `${TEMPLATES_URL}/${sourceSlug}`;
    try {
      const html = await fetchHtml(url);
      const templateIds = extractTemplateIds(html);
      sourceCategorySizes[sourceSlug] = templateIds.length;

      for (const templateId of templateIds) {
        addSourceSlugs(templateToSourceCategories, templateId, [sourceSlug]);
      }
    } catch (error) {
      console.warn(`[templates:sync] Failed category fetch for ${sourceSlug}:`, error);
      sourceCategorySizes[sourceSlug] = 0;
    }
  }

  console.log("[templates:sync] Fetching templates root for additional IDs...");
  const rootHtml = await fetchHtml(TEMPLATES_URL);
  const rootTemplateIds = extractTemplateIds(rootHtml);
  for (const templateId of rootTemplateIds) {
    if (!templateToSourceCategories.has(templateId)) {
      templateToSourceCategories.set(templateId, new Set());
    }
  }

  return {
    mode: "remote-html",
    label: "v0.app category discovery",
    source: CATEGORIES_URL,
    discoveredTemplateIds: [...templateToSourceCategories.keys()].sort((a, b) =>
      a.localeCompare(b),
    ),
    templateToSourceCategories,
    sourceCategorySizes,
  };
}

function buildTemplatePreviewImageUrl(templateId) {
  return `${BASE_URL}/chat/api/og/t/${templateId}`;
}

async function fetchTemplateMeta(templateId) {
  const url = `${TEMPLATES_URL}/${templateId}`;
  try {
    const html = await fetchHtml(url);
    const $ = loadHtml(html);
    const title = normalizeTitle(
      $("meta[property='og:title']").attr("content") || $("title").first().text(),
      templateId,
    );
    const previewImageUrl =
      String($("meta[property='og:image']").attr("content") || "").trim() ||
      buildTemplatePreviewImageUrl(templateId);
    return { templateId, title, previewImageUrl };
  } catch (error) {
    console.warn(`[templates:sync] metadata fetch failed for ${templateId}:`, error);
    return {
      templateId,
      title: templateId,
      previewImageUrl: buildTemplatePreviewImageUrl(templateId),
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
    view_url: `${TEMPLATES_URL}/${meta.templateId}`,
    edit_url: `${BASE_URL}/chat/${meta.templateId}`,
    preview_image_url: meta.previewImageUrl || buildTemplatePreviewImageUrl(meta.templateId),
    image_filename: `${meta.templateId}.jpg`,
    views: "",
    likes: "",
    author: "",
    author_avatar: "",
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

  let discovery;
  if (sourceMode === "local-manifest") {
    discovery = await loadLocalManifestSource();
    if (!discovery) {
      throw new Error(
        `Requested --source=local-manifest but no manifest was found at ${LOCAL_MANIFEST_PATHS.collected}`,
      );
    }
  } else if (sourceMode === "remote-html") {
    discovery = await discoverTemplatesFromRemoteHtml();
  } else {
    discovery = (await loadLocalManifestSource()) ?? (await discoverTemplatesFromRemoteHtml());
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

  console.log(`[templates:sync] Fetching metadata for ${discoveredTemplateIds.length} templates...`);
  const metas = await mapWithConcurrency(discoveredTemplateIds, 8, async (templateId) =>
    fetchTemplateMeta(templateId),
  );

  const templates = metas.map((meta) =>
    buildTemplateRecord(meta, [...(templateToSourceCategories.get(meta.templateId) || new Set())]),
  );
  const categoryMapping = buildCategoryMapping(discoveredTemplateIds, templateToSourceCategories);

  const categoryFile = {
    _comment: "Auto-generated template categorization from local v0 manifests or v0 source categories",
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
