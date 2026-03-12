import fs from "node:fs";
import path from "node:path";

export type RawTemplateRecord = {
  category_slug: string;
  category_name: string;
  template_url: string;
  title: string;
  description: string;
  repo_url?: string | null;
  demo_url?: string | null;
  framework_match: boolean;
  framework_reason: string;
  stack_tags?: string[];
  important_lines?: string[];
};

export type RawSummary = Record<string, RawTemplateRecord[]>;

export type CanonicalDiscoverySourceKind = "legacy-summary" | "playwright-catalog";

export interface CanonicalDiscoveryCatalogEntry extends RawTemplateRecord {
  discovery_source: CanonicalDiscoverySourceKind;
  image_url?: string | null;
}

export interface CanonicalDiscoveryMetadata {
  generatedAt: string;
  sourceKind: CanonicalDiscoverySourceKind;
  sourceLabel: string;
  sourcePath: string | null;
  sourceUrl: string | null;
  filterPreset: string | null;
  totalTemplates: number;
  categorySlugs: string[];
}

export interface PlaywrightTemplateEntry {
  title: string;
  description: string;
  url: string;
  categories: string[];
  imageUrl?: string | null;
  stackTags?: string[];
  repoUrl?: string | null;
  demoUrl?: string | null;
  frameworkMatch?: boolean;
  frameworkReason?: string;
  importantLines?: string[];
}

export interface PlaywrightCatalogFile {
  scrapedAt: string;
  sourceUrl: string;
  filterPreset: string;
  appliedFilters?: Record<string, string[]>;
  totalTemplates: number;
  templates: PlaywrightTemplateEntry[];
}

export const WORKSPACE_ROOT = process.cwd();
export const RAW_DISCOVERY_ROOT = path.resolve(
  WORKSPACE_ROOT,
  "research",
  "external-templates",
  "raw-discovery",
);
export const RAW_DISCOVERY_CURRENT_ROOT = path.join(RAW_DISCOVERY_ROOT, "current");
export const REPO_CACHE_ROOT = path.resolve(
  WORKSPACE_ROOT,
  "research",
  "external-templates",
  "repo-cache",
);
export const LEGACY_SOURCE_ROOT_CANDIDATES = [
  path.resolve(WORKSPACE_ROOT, "_sidor", "vercel_usecase_next_react_templates"),
  path.resolve(WORKSPACE_ROOT, "research", "_sidor", "vercel_usecase_next_react_templates"),
  "C:\\Users\\jakem\\Desktop\\_sidor\\vercel_usecase_next_react_templates",
];
export const CANONICAL_USE_CASE_SLUGS = new Set([
  "ai",
  "starter",
  "ecommerce",
  "saas",
  "blog",
  "portfolio",
  "cms",
  "backend",
  "edge-functions",
  "edge-middleware",
  "edge-config",
  "cron",
  "multi-tenant-apps",
  "realtime-apps",
  "documentation",
  "virtual-event",
  "monorepos",
  "web3",
  "vercel-firewall",
  "microfrontends",
  "authentication",
  "marketing-sites",
  "cdn",
  "admin-dashboard",
  "security",
]);

const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI",
  cms: "CMS",
  saas: "SaaS",
  "admin-dashboard": "Admin Dashboard",
  "marketing-sites": "Marketing Sites",
  "edge-middleware": "Edge Middleware",
  "edge-functions": "Edge Functions",
  "multi-tenant-apps": "Multi-Tenant Apps",
  "realtime-apps": "Realtime Apps",
  web3: "Web3",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ensureDir(target: string): void {
  fs.mkdirSync(target, { recursive: true });
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

export function prettifyCategoryName(categorySlug: string): string {
  if (CATEGORY_LABELS[categorySlug]) return CATEGORY_LABELS[categorySlug];
  return categorySlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseTemplateCategoryFromUrl(templateUrl: string): string | null {
  try {
    const parsed = new URL(templateUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "templates" || parts.length < 3) return null;
    return slugify(parts[1]);
  } catch {
    return null;
  }
}

function normalizeImportantLines(values: Array<string | null | undefined>, maxLines = 24): string[] {
  return uniqueStrings(values)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 2)
    .slice(0, maxLines);
}

export function normalizeRawTemplateRecord(input: RawTemplateRecord): RawTemplateRecord {
  const categorySlug = slugify(input.category_slug || parseTemplateCategoryFromUrl(input.template_url) || "uncategorized");
  const categoryName = (input.category_name ?? "").trim() || prettifyCategoryName(categorySlug);
  return {
    category_slug: categorySlug,
    category_name: categoryName,
    template_url: input.template_url.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    repo_url: input.repo_url?.trim() || null,
    demo_url: input.demo_url?.trim() || null,
    framework_match: Boolean(input.framework_match),
    framework_reason: input.framework_reason.trim(),
    stack_tags: uniqueStrings(input.stack_tags ?? []),
    important_lines: normalizeImportantLines(input.important_lines ?? []),
  };
}

export function normalizeLegacySummary(input: unknown): RawSummary {
  if (!isObject(input)) {
    throw new Error("Legacy summary must be an object keyed by category slug.");
  }

  const normalized: RawSummary = {};
  for (const [rawCategorySlug, rawEntries] of Object.entries(input)) {
    if (!Array.isArray(rawEntries)) continue;
    const categorySlug = slugify(rawCategorySlug);
    const entries = rawEntries
      .filter(isObject)
      .map((entry) =>
        normalizeRawTemplateRecord({
          category_slug: String(entry.category_slug ?? categorySlug),
          category_name: String(entry.category_name ?? prettifyCategoryName(categorySlug)),
          template_url: String(entry.template_url ?? ""),
          title: String(entry.title ?? ""),
          description: String(entry.description ?? ""),
          repo_url: typeof entry.repo_url === "string" ? entry.repo_url : null,
          demo_url: typeof entry.demo_url === "string" ? entry.demo_url : null,
          framework_match: Boolean(entry.framework_match),
          framework_reason: String(entry.framework_reason ?? ""),
          stack_tags: Array.isArray(entry.stack_tags) ? entry.stack_tags.map(String) : [],
          important_lines: Array.isArray(entry.important_lines) ? entry.important_lines.map(String) : [],
        }),
      )
      .filter((entry) => entry.template_url && entry.title);

    if (entries.length === 0) continue;

    const deduped = new Map<string, RawTemplateRecord>();
    for (const entry of entries) {
      const key = `${entry.category_slug}::${entry.template_url}`;
      deduped.set(key, entry);
    }

    normalized[categorySlug] = Array.from(deduped.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  return normalized;
}

export function normalizePlaywrightCatalog(input: PlaywrightCatalogFile): {
  summary: RawSummary;
  flatEntries: CanonicalDiscoveryCatalogEntry[];
} {
  const grouped = new Map<string, CanonicalDiscoveryCatalogEntry[]>();
  const requestedTypeFilters = uniqueStrings(input.appliedFilters?.type ?? []).map((value) => slugify(value));
  const requestedTypeSet = new Set(requestedTypeFilters);

  for (const template of input.templates ?? []) {
    const baseCategory = parseTemplateCategoryFromUrl(template.url);
    const normalizedTemplateCategories = uniqueStrings((template.categories ?? []).map((category) => slugify(category)));
    const selectedTemplateCategories = normalizedTemplateCategories.filter((category) =>
      requestedTypeSet.size > 0 ? requestedTypeSet.has(category) : CANONICAL_USE_CASE_SLUGS.has(category),
    );
    const categorySlugs = uniqueStrings(
      selectedTemplateCategories.concat(
        baseCategory && CANONICAL_USE_CASE_SLUGS.has(baseCategory) && (requestedTypeSet.size === 0 || requestedTypeSet.has(baseCategory))
          ? [baseCategory]
          : [],
      ),
    );
    const effectiveCategories = categorySlugs.length > 0 ? categorySlugs : ["uncategorized"];

    const stackTags = uniqueStrings(template.stackTags ?? []);
    const inferredReasons = uniqueStrings([
      template.frameworkReason,
      stackTags.some((tag) => /next\.?js/i.test(tag)) ? "Next.js" : null,
      stackTags.some((tag) => /\breact\b/i.test(tag)) ? "React" : null,
      /framework=next\.js/i.test(input.sourceUrl) ? "Collected from a Next.js filtered Vercel catalog view" : null,
    ]);
    const frameworkReason = inferredReasons.join(", ") || "Framework could not be verified from the catalog page";
    const frameworkMatch =
      typeof template.frameworkMatch === "boolean"
        ? template.frameworkMatch
        : /next\.?js|react/i.test(frameworkReason);
    const importantLines = normalizeImportantLines([
      template.title,
      template.description,
      ...(template.importantLines ?? []),
      ...stackTags,
    ]);

    for (const categorySlug of effectiveCategories) {
      const entry: CanonicalDiscoveryCatalogEntry = {
        category_slug: categorySlug,
        category_name: prettifyCategoryName(categorySlug),
        template_url: template.url.trim(),
        title: template.title.trim(),
        description: template.description.trim(),
        repo_url: template.repoUrl?.trim() || null,
        demo_url: template.demoUrl?.trim() || null,
        framework_match: frameworkMatch,
        framework_reason: frameworkReason,
        stack_tags: stackTags,
        important_lines: importantLines,
        discovery_source: "playwright-catalog",
        image_url: template.imageUrl?.trim() || null,
      };

      if (!grouped.has(categorySlug)) grouped.set(categorySlug, []);
      grouped.get(categorySlug)?.push(entry);
    }
  }

  const flatEntries = Array.from(grouped.values())
    .flat()
    .filter((entry) => entry.template_url && entry.title)
    .sort((a, b) => a.category_slug.localeCompare(b.category_slug) || a.title.localeCompare(b.title));

  const summary: RawSummary = {};
  for (const [categorySlug, entries] of grouped.entries()) {
    const deduped = new Map<string, CanonicalDiscoveryCatalogEntry>();
    for (const entry of entries) {
      deduped.set(`${entry.category_slug}::${entry.template_url}`, entry);
    }
    summary[categorySlug] = Array.from(deduped.values())
      .map((entry) => normalizeRawTemplateRecord(entry))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  return { summary, flatEntries };
}

export function flattenRawSummary(summary: RawSummary): RawTemplateRecord[] {
  return Object.values(summary).flat();
}

export function resolveSummaryPath(target: string): string {
  if (!target) return path.join(RAW_DISCOVERY_CURRENT_ROOT, "summary.json");
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return path.join(target, "summary.json");
  }
  return target;
}

export function resolveExistingLegacySummaryPath(): string | null {
  for (const root of LEGACY_SOURCE_ROOT_CANDIDATES) {
    const summaryPath = path.join(root, "summary.json");
    if (fs.existsSync(summaryPath)) return summaryPath;
  }
  return null;
}

export function writeCanonicalDiscoveryDataset(options: {
  outputRoot?: string;
  summary: RawSummary;
  metadata: CanonicalDiscoveryMetadata;
  flatEntries?: CanonicalDiscoveryCatalogEntry[];
}): void {
  const outputRoot = options.outputRoot ?? RAW_DISCOVERY_CURRENT_ROOT;
  ensureDir(outputRoot);

  const summary = normalizeLegacySummary(options.summary);
  const flatEntries =
    options.flatEntries?.length
      ? options.flatEntries
      : flattenRawSummary(summary).map((entry) => ({
          ...entry,
          discovery_source: options.metadata.sourceKind,
          image_url: null,
        }));

  writeJson(path.join(outputRoot, "summary.json"), summary);
  writeJson(path.join(outputRoot, "catalog.json"), {
    generatedAt: options.metadata.generatedAt,
    sourceKind: options.metadata.sourceKind,
    sourceLabel: options.metadata.sourceLabel,
    sourcePath: options.metadata.sourcePath,
    sourceUrl: options.metadata.sourceUrl,
    filterPreset: options.metadata.filterPreset,
    totalTemplates: flatEntries.length,
    entries: flatEntries,
  });
  writeJson(path.join(outputRoot, "source-metadata.json"), {
    ...options.metadata,
    totalTemplates: flattenRawSummary(summary).length,
    categorySlugs: Object.keys(summary).sort(),
  });
}

export function normalizeRepoUrl(rawUrl: string | null | undefined): {
  url: string | null;
  normalizedUrl: string | null;
  subpath: string | null;
  isGitHub: boolean;
} {
  if (!rawUrl) {
    return { url: null, normalizedUrl: null, subpath: null, isGitHub: false };
  }

  const url = rawUrl.trim();
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "vercel.com" && parsed.pathname.startsWith("/new/clone")) {
      return normalizeRepoUrl(parsed.searchParams.get("repository-url"));
    }

    if (parsed.hostname === "app.netlify.com" && parsed.pathname.startsWith("/start/deploy")) {
      const repoCandidate = parsed.searchParams.get("repository");
      return normalizeRepoUrl(repoCandidate);
    }

    if (parsed.hostname !== "github.com") {
      return { url, normalizedUrl: null, subpath: null, isGitHub: false };
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] === "orgs" || parts[0] === "settings" || parts[0] === "user-attachments") {
      return { url, normalizedUrl: null, subpath: null, isGitHub: true };
    }

    const normalizedUrl = `${parsed.protocol}//${parsed.hostname}/${parts[0]}/${parts[1]}`;
    const subpath = parts[2] === "tree" && parts.length >= 5 ? parts.slice(4).join("/") : null;
    return { url, normalizedUrl, subpath, isGitHub: true };
  } catch {
    return { url, normalizedUrl: null, subpath: null, isGitHub: false };
  }
}

export function repoCacheKeyFromNormalizedUrl(normalizedUrl: string): string {
  const parsed = new URL(normalizedUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  return slugify(parts.join("--")) || "repo-cache-entry";
}

export function resolveRepoCacheDir(normalizedUrl: string | null): string | null {
  if (!normalizedUrl) return null;
  return path.join(REPO_CACHE_ROOT, repoCacheKeyFromNormalizedUrl(normalizedUrl));
}
