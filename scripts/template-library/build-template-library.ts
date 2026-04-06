import fs from "node:fs";
import path from "node:path";
import { getScaffoldFamilies } from "../../src/lib/gen/scaffolds";
import type { ScaffoldFamily } from "../../src/lib/gen/scaffolds/types";
import {
  deriveTemplateRuntimeGuidance,
  isStarterOrBoilerplateReference,
} from "../../src/lib/gen/template-library/runtime-guidance";
import type {
  TemplateLibraryCatalogFile,
  TemplateLibraryClassification,
  TemplateLibraryEntry,
  TemplateLibraryRepoInfo,
  TemplateLibrarySelectedFile,
  TemplateLibrarySignals,
  TemplateLibraryVerdict,
} from "../../src/lib/gen/template-library/types";
import {
  CANONICAL_USE_CASE_SLUGS,
  parseTemplateCategoryFromUrl,
  PIPELINE_REPORTS_ROOT,
  prettifyCategoryName,
  RAW_DISCOVERY_CURRENT_ROOT,
  REPO_CACHE_ROOT,
  REFERENCE_LIBRARY_ROOT,
  normalizeLegacySummary,
  normalizeRepoUrl,
  readJson,
  resolveRepoCacheDir,
  resolveSummaryPath,
  slugify,
  writeJson,
  type RawTemplateRecord,
} from "./template-library-discovery";
import { writeScaffoldCandidateReport } from "../scaffolds/scaffold-candidate-report";

const WORKSPACE_ROOT = process.cwd();
const TEMPLATE_LIBRARY_ROOT = REFERENCE_LIBRARY_ROOT;
const GENERATED_CATALOG_PATH = path.resolve(
  WORKSPACE_ROOT,
  "src/lib/gen/template-library/template-library.generated.json",
);
const GENERATED_SCAFFOLD_RESEARCH_PATH = path.resolve(
  WORKSPACE_ROOT,
  "src/lib/gen/scaffolds/scaffold-research.generated.json",
);
const SCAFFOLD_CANDIDATE_REPORT_PATH = path.resolve(
  PIPELINE_REPORTS_ROOT,
  "scaffold-candidates-curated.json",
);
const DEFAULT_PORTABLE_SOURCE_ROOT = "data/external-template-pipeline/raw-discovery/current";

function toPortableWorkspacePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const absolute = path.resolve(trimmed);
  const relative = path.relative(WORKSPACE_ROOT, absolute);
  if (
    relative &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  ) {
    return relative.replace(/\\/g, "/");
  }

  return null;
}

function sanitizeSourceRootForCatalog(value: string): string {
  return toPortableWorkspacePath(value) ?? DEFAULT_PORTABLE_SOURCE_ROOT;
}

function sanitizeEntryForCatalogOutput(entry: TemplateLibraryEntry): TemplateLibraryEntry {
  return {
    ...entry,
    repo: {
      ...entry.repo,
      clonePath: toPortableWorkspacePath(entry.repo.clonePath),
    },
  };
}

const NOISE_LINE_RE =
  /\b(Vercel Agent|Vercel documentation|Deploy at the speed of AI|Ship features, not infrastructure|SDKs by Vercel)\b/i;
const KNOWN_SCAFFOLD_FAMILIES = new Set(getScaffoldFamilies());
const TITLE_BLOCKLIST_PATTERNS = [
  "Express on Bun",
  "Hono on Bun",
  "Slack Bolt",
  "Slack Agent",
  "Static Tweets",
  "On-Demand ISR",
  "Preview Mode",
  "EnvShare",
  "Paint by Text",
  "Inpainter",
  "qrGPT",
  "AI Headshot Generator",
  "AI Emoji Generator",
  "Alt Text Generator",
  "Replicache Starter",
  "Statsig Experimentation",
  "Optimizely Feature",
  "TanStack Start",
  "Rollbar",
  "Customer Reviews AI Summary",
];

const INVALID_REPO_PATTERNS: Array<{ reason: TemplateLibraryVerdict; pattern: RegExp }> = [
  { reason: "bad_repo_link", pattern: /github\.com\/settings\//i },
  { reason: "bad_repo_link", pattern: /github\.com\/orgs\//i },
  { reason: "bad_repo_link", pattern: /github\.com\/sponsors\//i },
  { reason: "bad_repo_link", pattern: /user-attachments\//i },
  { reason: "bad_repo_link", pattern: /\/blob\//i },
  { reason: "bad_repo_link", pattern: /\/tree\/[^/]+\/\.\//i },
];

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "out",
  ".vercel",
]);

const SCAFFOLD_CHECKLISTS: Record<ScaffoldFamily, string[]> = {
  "base-nextjs": [
    "Keep a minimal App Router structure with layout, page, and globals.css.",
    "Preserve @theme inline tokens and stable path aliases.",
    "Do not add heavy product or marketing structure unless the prompt clearly asks for it.",
  ],
  "landing-page": [
    "Hero, trust, CTA, and clear section hierarchy should be present.",
    "Layout should remain editable without introducing app-shell complexity.",
    "Copy and section order should feel business-specific rather than generic starter filler.",
  ],
  "saas-landing": [
    "Pricing, product narrative, trust signals, and dashboard preview should exist.",
    "Keep marketing structure separate from logged-in app structure.",
    "Make the product value proposition and hero preview feel tied to the actual product domain.",
  ],
  portfolio: [
    "Strong work showcase and biography sections should remain first-class.",
    "Visual rhythm should prioritize image or project presentation over dashboard UI.",
    "Project cards, case studies, or gallery areas should feel curated rather than generic service blocks.",
  ],
  blog: [
    "Editorial layout, post hierarchy, and reading flow should remain intact.",
    "Content lists and article pages should not collapse into generic marketing cards.",
    "Headings, excerpts, and archive structure should support reading and navigation first.",
  ],
  dashboard: [
    "Sidebar, overview cards, table/chart areas, and dense app layout should remain intact.",
    "Prefer realistic analytics structure over marketing-page sections.",
    "Primary screens should feel operational and data-driven, not like brochure sections.",
  ],
  "auth-pages": [
    "Login, signup, and recovery flows should exist with link relationships between pages.",
    "Auth scaffolds should look ready for real integration, not just a single isolated card.",
    "The entry flow should keep clear form states, helper text, and obvious next actions.",
  ],
  ecommerce: [
    "Catalog, product detail, cart, and checkout direction should be represented.",
    "Use realistic storefront hierarchy instead of generic content sections.",
    "Merchandising, cart, and conversion flow should stay clearer than decorative marketing flourishes.",
  ],
  "content-site": [
    "Keep broad reusable content structure that can support services, docs-lite, and editorial sites.",
    "Do not force pricing or app-shell patterns unless the prompt asks for them.",
    "Navigation and section hierarchy should stay content-first and easy to extend.",
  ],
  "app-shell": [
    "Preserve navigation shell, settings-ready layout, and app-like information density.",
    "Allow auth, billing, and dashboard subflows to be layered in later.",
    "Primary layout should feel like a real product workspace, not a simple landing page with a sidebar.",
  ],
};

const SCAFFOLD_UPGRADE_TARGETS: Record<ScaffoldFamily, string[]> = {
  "base-nextjs": ["Cleaner starter structure", "Better default docs and env hints"],
  "landing-page": ["Stronger hero and CTA rhythm", "More realistic section hierarchy"],
  "saas-landing": ["Better pricing and product proof", "More convincing product preview patterns"],
  portfolio: ["Richer project storytelling", "More image-forward layout options"],
  blog: ["Better article and archive patterns", "Stronger editorial hierarchy"],
  dashboard: ["More realistic data density", "Better sidebar and table patterns"],
  "auth-pages": ["Richer auth flow linking", "More realistic account recovery and OAuth affordances"],
  ecommerce: ["Stronger product and checkout patterns", "Clearer storefront information architecture"],
  "content-site": ["Broader reusable section coverage", "More believable content-first defaults"],
  "app-shell": ["Deeper app navigation patterns", "More settings, account, and workspace affordances"],
};

function ensureDir(target: string): void {
  fs.mkdirSync(target, { recursive: true });
}

function isTitleBlocklisted(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_BLOCKLIST_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeUseCaseTag(value: string): string | null {
  const slug = slugify(value);
  if (!slug) return null;
  if (slug === "marketing-sites") return "marketing";
  if (slug === "multi-tenant-apps") return "multi-tenant";
  if (slug === "realtime-apps") return "realtime";
  if (slug === "vercel-firewall") return "security";
  return slug;
}

function assessRepoUrl(rawUrl: string | null | undefined): {
  url: string | null;
  normalizedUrl: string | null;
  subpath: string | null;
  verdict: TemplateLibraryVerdict | null;
} {
  if (!rawUrl) {
    return { url: null, normalizedUrl: null, subpath: null, verdict: "missing_repo" };
  }

  const url = rawUrl.trim();
  for (const invalid of INVALID_REPO_PATTERNS) {
    if (invalid.pattern.test(url)) {
      return { url, normalizedUrl: null, subpath: null, verdict: invalid.reason };
    }
  }

  const normalized = normalizeRepoUrl(url);
  if (!normalized.normalizedUrl) {
    return { url: normalized.url, normalizedUrl: null, subpath: normalized.subpath, verdict: "bad_repo_link" };
  }

  return {
    url: normalized.url,
    normalizedUrl: normalized.normalizedUrl,
    subpath: normalized.subpath,
    verdict: null,
  };
}

function collectRepoFiles(root: string, maxFiles = 3000): string[] {
  const collected: string[] = [];

  function walk(current: string): void {
    if (collected.length >= maxFiles) return;
    let currentStats: fs.Stats;
    try {
      currentStats = fs.statSync(current);
    } catch {
      return;
    }

    if (!currentStats.isDirectory()) {
      collected.push(current);
      return;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (collected.length >= maxFiles) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isSymbolicLink()) {
        try {
          const targetStats = fs.statSync(fullPath);
          if (targetStats.isDirectory()) {
            walk(fullPath);
          } else {
            collected.push(fullPath);
          }
        } catch {
          continue;
        }
      } else {
        collected.push(fullPath);
      }
    }
  }

  if (fs.existsSync(root)) {
    walk(root);
  }
  return collected;
}

function readMaybe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function detectPackageManager(repoRoot: string, packageDir: string): TemplateLibraryRepoInfo["packageManager"] {
  const candidates = [packageDir, repoRoot];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
    if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) return "bun";
    if (fs.existsSync(path.join(dir, "package-lock.json"))) return "npm";
  }
  return "unknown";
}

function inspectRepo(repoRoot: string): {
  packageDir: string | null;
  repoInfo: TemplateLibraryRepoInfo;
  files: string[];
} {
  const files = collectRepoFiles(repoRoot);
  const packageJsonFiles = files.filter((filePath) => path.basename(filePath) === "package.json");

  let bestPackageDir: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let hasNext = false;
  let hasReact = false;

  for (const packageJsonPath of packageJsonFiles.slice(0, 40)) {
    const content = readMaybe(packageJsonPath);
    if (!content) continue;

    try {
      const parsed = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        workspaces?: string[] | Record<string, unknown>;
        scripts?: Record<string, string>;
      };
      const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      const next = typeof deps.next === "string";
      const react = typeof deps.react === "string" || typeof deps["react-dom"] === "string";
      const dir = path.dirname(packageJsonPath);
      const score =
        (next ? 8 : 0) +
        (react ? 3 : 0) +
        (fs.existsSync(path.join(dir, "app")) ? 4 : 0) +
        (fs.existsSync(path.join(dir, "src", "app")) ? 4 : 0) -
        dir.split(path.sep).length;

      if (score > bestScore) {
        bestScore = score;
        bestPackageDir = dir;
        hasNext = next;
        hasReact = react;
      }
    } catch {
      continue;
    }
  }

  const repoInfo: TemplateLibraryRepoInfo = {
    url: null,
    normalizedUrl: null,
    subpath: null,
    clonePath: fs.existsSync(repoRoot) ? repoRoot : null,
    packageManager: bestPackageDir ? detectPackageManager(repoRoot, bestPackageDir) : "unknown",
    hasNext,
    hasReact,
    isMonorepo:
      packageJsonFiles.length > 4 ||
      fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(repoRoot, "turbo.json")),
    hasAppDir: bestPackageDir ? fs.existsSync(path.join(bestPackageDir, "app")) : false,
    hasSrcAppDir: bestPackageDir ? fs.existsSync(path.join(bestPackageDir, "src", "app")) : false,
  };

  return { packageDir: bestPackageDir, repoInfo, files };
}

function findInterestingFiles(repoRoot: string, packageDir: string | null, allFiles: string[]): string[] {
  const preferredRoots = [packageDir, repoRoot].filter(Boolean) as string[];
  const explicitCandidates: string[] = [];

  for (const root of preferredRoots) {
    explicitCandidates.push(
      path.join(root, "README.md"),
      path.join(root, "package.json"),
      path.join(root, "app", "layout.tsx"),
      path.join(root, "app", "page.tsx"),
      path.join(root, "src", "app", "layout.tsx"),
      path.join(root, "src", "app", "page.tsx"),
      path.join(root, "middleware.ts"),
      path.join(root, "src", "middleware.ts"),
      path.join(root, ".env.example"),
      path.join(root, ".env.local.example"),
      path.join(root, "app", "login", "page.tsx"),
      path.join(root, "src", "app", "login", "page.tsx"),
      path.join(root, "app", "signup", "page.tsx"),
      path.join(root, "src", "app", "signup", "page.tsx"),
      path.join(root, "app", "forgot-password", "page.tsx"),
      path.join(root, "src", "app", "forgot-password", "page.tsx"),
    );
  }

  const ranked = new Set(
    explicitCandidates
      .filter((filePath) => fs.existsSync(filePath))
      .concat(
        allFiles.filter((filePath) => {
          const normalized = filePath.replace(/\\/g, "/").toLowerCase();
          return (
            normalized.endsWith("/sidebar.tsx") ||
            normalized.endsWith("/header.tsx") ||
            normalized.endsWith("/pricing-card.tsx") ||
            normalized.endsWith("/pricing/page.tsx") ||
            normalized.endsWith("/dashboard/page.tsx") ||
            normalized.endsWith("/cart/page.tsx") ||
            normalized.endsWith("/checkout/page.tsx")
          );
        }),
      ),
  );

  return Array.from(ranked).slice(0, 10);
}

function buildFileExcerpt(filePath: string, repoRoot: string): TemplateLibrarySelectedFile | null {
  const content = readMaybe(filePath);
  if (!content) return null;
  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const excerptSource = content.length > 2400 ? content.slice(0, 2400) : content;
  const normalizedExcerpt = excerptSource
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
  const excerpt = content.length > 2400 ? `${normalizedExcerpt}\n\n// ... truncated` : normalizedExcerpt;

  let reason = "Useful structural reference";
  if (relativePath.endsWith("package.json")) reason = "Dependency and script verification";
  else if (relativePath.toLowerCase().includes("readme")) reason = "Setup and architecture context";
  else if (relativePath.includes("login") || relativePath.includes("signup") || relativePath.includes("forgot-password")) {
    reason = "Auth flow reference";
  } else if (relativePath.includes("pricing") || relativePath.includes("checkout")) {
    reason = "Commerce or pricing reference";
  } else if (relativePath.includes("layout") || relativePath.includes("sidebar")) {
    reason = "Layout and navigation reference";
  }

  return { path: relativePath, reason, excerpt };
}

function detectSignals(entry: RawTemplateRecord, selectedFiles: TemplateLibrarySelectedFile[]): TemplateLibrarySignals {
  const stackTags = (entry.stack_tags ?? []).filter((tag) => !/related templates?/i.test(tag));
  const useCaseBadges = entry.use_case_badges ?? [];
  const databaseBadges = entry.database_badges ?? [];
  const authBadges = entry.auth_badges ?? [];
  const usefulLines = (entry.important_lines ?? [])
    .filter((line) => !NOISE_LINE_RE.test(line))
    .filter((line) => !/^(deploy|features|gettings started|getting started|vercel)$/i.test(line.trim()));
  const selectedPaths = selectedFiles.map((file) => file.path).join("\n").toLowerCase();
  const text = [
    entry.title,
    entry.description,
    entry.category_name,
    entry.framework_reason,
    ...stackTags,
    ...useCaseBadges,
    ...databaseBadges,
    ...authBadges,
    entry.artifact_tier ?? "",
    ...usefulLines,
    selectedPaths,
  ]
    .join("\n")
    .toLowerCase();

  return {
    auth:
      /\b(auth|nextauth|auth\.js|oauth|session)\b/.test(text) ||
      /\/(login|signup|forgot-password|register)\//.test(selectedPaths),
    dashboard:
      /\b(dashboard|analytics|sidebar|table|chart|metrics|admin dashboard)\b/.test(text) ||
      /\/(dashboard|sidebar)\//.test(selectedPaths),
    pricing: /\b(pricing|billing|subscription|checkout|stripe)\b/.test(text),
    blog: /\b(blog|article|editorial|newsletter|contentlayer)\b/.test(text),
    portfolio: /\b(portfolio|photographer|gallery|case study|creative portfolio)\b/.test(text),
    ecommerce: /\b(ecommerce|shop|cart|checkout|store|product detail|catalog|storefront)\b/.test(text),
    docs: /\b(docs|documentation|knowledge base|nextra)\b/.test(text),
    ai: /\b(ai|agent|chatbot|workflow|llm|openai)\b/.test(text),
    multiTenant: /\b(multi-tenant|subdomain|workspace|organization)\b/.test(text),
    cms: /\b(cms|contentful|sanity|wordpress|payload|drupal)\b/.test(text),
  };
}

function deriveClassification(
  categorySlug: string,
  entry: RawTemplateRecord,
  signals: TemplateLibrarySignals,
  repoInfo: TemplateLibraryRepoInfo,
  recommendedScaffoldFamilies: ScaffoldFamily[],
  selectedFiles: TemplateLibrarySelectedFile[],
): TemplateLibraryClassification {
  const businessText = [
    entry.title,
    entry.description,
    categorySlug.replace(/-/g, " "),
  ]
    .join("\n")
    .toLowerCase();

  const useCaseTags = uniqueSorted([
    normalizeUseCaseTag(categorySlug),
    /\bsaas|subscription|billing\b/.test(businessText) ? "saas" : null,
    /\becommerce|commerce|store|storefront|checkout|product\b/.test(businessText) ? "ecommerce" : null,
    /\bblog|editorial|newsletter|article\b/.test(businessText) ? "blog" : null,
    /\bportfolio|gallery|creative\b/.test(businessText) ? "portfolio" : null,
    /\bsecurity|firewall|encryption|bot protection\b/.test(businessText) ? "security" : null,
    /\bweb3|wallet|nft|blockchain|onchain\b/.test(businessText) ? "web3" : null,
  ]);

  const selectedPathsText = selectedFiles.map((file) => file.path).join("\n").toLowerCase();
  const siteFormText = [businessText, selectedPathsText].join("\n").toLowerCase();

  const siteFormTags = uniqueSorted([
    categorySlug === "marketing-sites" || /\blanding page|waitlist|marketing website|hero\b/.test(siteFormText)
      ? "landing-page"
      : null,
    categorySlug === "admin-dashboard" ||
    /\bdashboard|analytics|admin dashboard|issue tracker\b/.test(siteFormText) ||
    /\/dashboard\//.test(selectedPathsText)
      ? "dashboard"
      : null,
    categorySlug === "saas" ||
    categorySlug === "backend" ||
    categorySlug === "multi-tenant-apps" ||
    categorySlug === "realtime-apps" ||
    /\bworkspace|settings|team nav|issue tracker|editor|platform\b/.test(siteFormText) ||
    /\/(settings|workspace|team|billing|account)\//.test(selectedPathsText)
      ? "app-shell"
      : null,
    categorySlug === "cms" || /\bcms|content management\b/.test(siteFormText)
      ? "content-site"
      : null,
    categorySlug === "blog" || /\bblog|editorial|newsletter|article\b/.test(siteFormText)
      ? "editorial-site"
      : null,
    categorySlug === "portfolio" || /\bportfolio|gallery|case study|creative\b/.test(siteFormText)
      ? "portfolio"
      : null,
    categorySlug === "ecommerce" || /\becommerce|commerce|shop|storefront|checkout|product detail\b/.test(siteFormText)
      ? "storefront"
      : null,
    categorySlug === "authentication" ||
    /\bauthentication|login|signup|sign up|oauth|recovery\b/.test(siteFormText) ||
    /\/(login|signup|forgot-password|register)\//.test(selectedPathsText)
      ? "auth-flow"
      : null,
    categorySlug === "documentation" || /\bdocs|documentation|knowledgebase|nextra\b/.test(siteFormText)
      ? "documentation-site"
      : null,
  ]);

  const technicalText = [
    entry.title,
    entry.description,
    ...(entry.stack_tags ?? []),
    ...(entry.database_badges ?? []),
    ...(entry.auth_badges ?? []),
    ...(entry.css_tags ?? []),
    entry.framework_reason,
  ]
    .join("\n")
    .toLowerCase();

  const technicalPatternTags = uniqueSorted([
    repoInfo.hasAppDir || repoInfo.hasSrcAppDir ? "app-router" : null,
    repoInfo.isMonorepo || entry.is_monorepo_example || entry.artifact_tier === "monorepo-examples"
      ? "monorepo"
      : null,
    /\b(ai|agent|chatbot|llm|openai|ai sdk)\b/.test(technicalText) ? "ai" : null,
    (entry.auth_badges?.length ?? 0) > 0 || /\b(auth|oauth|clerk|auth0|nextauth|kinde|descope)\b/.test(technicalText)
      ? "auth"
      : null,
    signals.pricing || /\b(stripe|billing|subscription|paddle)\b/.test(technicalText) ? "billing" : null,
    categorySlug === "cms" || /\b(cms|contentful|sanity|wordpress|payload|drupal|notion cms|builder\.io)\b/.test(technicalText)
      ? "cms"
      : null,
    (entry.database_badges?.length ?? 0) > 0 || /\b(postgres|redis|mysql|prisma|turso|blob|database)\b/.test(technicalText)
      ? "database"
      : null,
    categorySlug === "multi-tenant-apps" || /\b(multi-tenant|subdomain|workspace|per user)\b/.test(technicalText)
      ? "multi-tenant"
      : null,
    categorySlug === "realtime-apps" || /\b(ably|liveblocks|anycable|realtime|websocket)\b/.test(technicalText)
      ? "realtime"
      : null,
    categorySlug.startsWith("edge-") || categorySlug === "vercel-firewall" ? "edge" : null,
    categorySlug === "cron" ? "cron" : null,
    categorySlug === "backend" || /\b(express|hono|fastify|flask|django|nestjs|serverless)\b/.test(technicalText)
      ? "backend-service"
      : null,
    categorySlug === "security" || /\b(security|firewall|encryption|bot protection|arcjet|evervault)\b/.test(technicalText)
      ? "security"
      : null,
    categorySlug === "web3" || /\b(wallet|nft|coinbase|web3|blockchain|onchain)\b/.test(technicalText)
      ? "web3"
      : null,
  ]);

  return {
    useCaseTags: useCaseTags.length > 0 ? useCaseTags : [normalizeUseCaseTag(categorySlug) ?? "starter"],
    siteFormTags: siteFormTags.length > 0 ? siteFormTags : ["content-site"],
    technicalPatternTags,
  };
}

function deriveStrengths(signals: TemplateLibrarySignals, repoInfo: TemplateLibraryRepoInfo): string[] {
  const strengths: string[] = [];
  if (repoInfo.hasNext) strengths.push("verified Next.js codebase");
  if (repoInfo.hasAppDir || repoInfo.hasSrcAppDir) strengths.push("App Router structure");
  if (signals.auth) strengths.push("auth flow reference");
  if (signals.dashboard) strengths.push("dashboard shell patterns");
  if (signals.pricing) strengths.push("pricing or billing structure");
  if (signals.ecommerce) strengths.push("storefront or checkout patterns");
  if (signals.blog) strengths.push("editorial content hierarchy");
  if (signals.portfolio) strengths.push("portfolio or gallery presentation");
  if (signals.multiTenant) strengths.push("multi-tenant or workspace patterns");
  if (signals.cms) strengths.push("CMS integration hints");
  return strengths;
}

function deriveWeaknesses(
  rawRepoVerdict: TemplateLibraryVerdict | null,
  repoInfo: TemplateLibraryRepoInfo,
  usefulLines: string[],
  noiseLines: string[],
  subpathMissing?: boolean,
  frameworkMatch = true,
  titleBlocklisted = false,
): string[] {
  const weaknesses: string[] = [];
  if (rawRepoVerdict === "bad_repo_link") weaknesses.push("repo URL is not trustworthy");
  if (!frameworkMatch) weaknesses.push("template page did not pass strict Next.js/React lane");
  if (titleBlocklisted) weaknesses.push("title is blocklisted as a low-value generation reference");
  if (repoInfo.isMonorepo && !repoInfo.subpath) weaknesses.push("large monorepo without a clear example path");
  if (subpathMissing) weaknesses.push("monorepo subpath not found locally — file excerpts unavailable");
  if (!repoInfo.hasNext && !repoInfo.hasReact) weaknesses.push("framework could not be verified from package.json");
  if (noiseLines.length > usefulLines.length) weaknesses.push("page-derived hints are noisy");
  if (!repoInfo.clonePath) weaknesses.push("repo clone is missing");
  return weaknesses;
}

function recommendScaffoldFamilies(
  categorySlug: string,
  signals: TemplateLibrarySignals,
): ScaffoldFamily[] {
  const scores = new Map<ScaffoldFamily, number>();
  const add = (family: ScaffoldFamily, score: number) => {
    scores.set(family, (scores.get(family) ?? 0) + score);
  };

  if (categorySlug === "authentication") add("auth-pages", 6);
  if (signals.auth) add("auth-pages", 4);

  if (categorySlug === "ecommerce") add("ecommerce", 6);
  if (signals.ecommerce) add("ecommerce", 4);

  if (categorySlug === "admin-dashboard") add("dashboard", 6);
  if (signals.dashboard) add("dashboard", 4);

  if (categorySlug === "saas") add("saas-landing", 6);
  if (signals.pricing || signals.multiTenant) add("saas-landing", 3);

  if (categorySlug === "blog") add("blog", 6);
  if (signals.blog) add("blog", 4);

  if (categorySlug === "portfolio") add("portfolio", 6);
  if (signals.portfolio) add("portfolio", 4);

  if (categorySlug === "documentation") add("content-site", 6);
  if (signals.docs || signals.cms) add("content-site", 4);
  if (categorySlug === "cms" || categorySlug === "security" || categorySlug === "cdn") add("content-site", 3);

  if (categorySlug === "marketing-sites") add("landing-page", 6);
  if (categorySlug === "starter") add("base-nextjs", 6);

  const TECH_DEMO_CATEGORIES = new Set([
    "ai", "cron", "edge-functions", "edge-middleware", "edge-config",
    "web3", "vercel-firewall", "cdn", "backend", "security",
    "microfrontends", "virtual-event", "monorepos", "realtime-apps",
  ]);
  if (
    !TECH_DEMO_CATEGORIES.has(categorySlug) &&
    !signals.dashboard && !signals.auth && !signals.ecommerce && !signals.blog && !signals.portfolio
  ) {
    add("landing-page", 2);
  }

  if (signals.dashboard || signals.auth || signals.multiTenant || categorySlug === "backend") add("app-shell", 4);
  if (signals.ai && categorySlug !== "marketing-sites") add("app-shell", 2);

  const ranked = Array.from(scores.entries())
    .filter(([, score]) => score >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([family]) => family);

  return ranked.length > 0 ? ranked : ["base-nextjs"];
}

function scoreEntry(
  rawRepoVerdict: TemplateLibraryVerdict | null,
  repoInfo: TemplateLibraryRepoInfo,
  selectedFiles: TemplateLibrarySelectedFile[],
  strengths: string[],
  weaknesses: string[],
  recommendedScaffoldFamilies: ScaffoldFamily[],
): number {
  let score = 15;
  if (!rawRepoVerdict) score += 10;
  if (repoInfo.clonePath) score += 10;
  if (repoInfo.hasNext) score += 25;
  else if (repoInfo.hasReact) score += 10;
  if (repoInfo.hasAppDir || repoInfo.hasSrcAppDir) score += 10;
  if (selectedFiles.length >= 4) score += 10;
  else score += selectedFiles.length * 2;
  score += Math.min(10, strengths.length * 2);
  score += Math.min(8, recommendedScaffoldFamilies.length * 2);
  score -= Math.min(30, weaknesses.length * 6);
  if (repoInfo.isMonorepo) score -= 8;
  return Math.max(0, Math.min(100, score));
}

function decideVerdict(
  rawRepoVerdict: TemplateLibraryVerdict | null,
  repoInfo: TemplateLibraryRepoInfo,
  qualityScore: number,
  frameworkMatch: boolean,
  titleBlocklisted: boolean,
): TemplateLibraryVerdict {
  if (rawRepoVerdict === "bad_repo_link") return "bad_repo_link";
  if (!frameworkMatch) return "non_next_template";
  if (titleBlocklisted) return "research_only";
  if (!repoInfo.clonePath) return "research_only";
  if (!repoInfo.hasNext) return "non_next_template";
  if (repoInfo.isMonorepo && !repoInfo.subpath && qualityScore < 70) return "huge_monorepo";
  if (qualityScore >= 60) return "valid";
  return "research_only";
}

function resolveRepoInspectionPaths(sourceRoot: string, template: RawTemplateRecord): {
  cloneRoot: string;
  inspectionRoot: string;
  subpathMissing: boolean;
} {
  const repoUrl = assessRepoUrl(template.repo_url);
  const cachedRepoDir = resolveRepoCacheDir(repoUrl.normalizedUrl);
  const cloneRoot = cachedRepoDir ?? path.join(sourceRoot, "__missing_repo_cache__");

  if (repoUrl.subpath) {
    const subpathDir = path.join(cloneRoot, repoUrl.subpath);
    if (fs.existsSync(subpathDir)) {
      return { cloneRoot, inspectionRoot: subpathDir, subpathMissing: false };
    }
    return { cloneRoot, inspectionRoot: cloneRoot, subpathMissing: true };
  }

  return { cloneRoot, inspectionRoot: cloneRoot, subpathMissing: false };
}

function loadRepoCacheFailures(): Set<string> {
  const indexPath = path.join(REPO_CACHE_ROOT, "index.json");
  if (!fs.existsSync(indexPath)) return new Set();
  try {
    const indexJson = readJson<{ failedRepos?: string[] }>(indexPath);
    return new Set((indexJson.failedRepos ?? []).map((value) => value.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function collectMissingRepoCacheUrls(
  entries: RawTemplateRecord[],
  failedRepoUrls: Set<string>,
): string[] {
  const missing = new Set<string>();
  for (const entry of entries) {
    if (!entry.framework_match) continue;
    if (entry.is_monorepo_example || entry.artifact_tier === "monorepo-examples") continue;
    const repoUrl = assessRepoUrl(entry.repo_url);
    if (!repoUrl.normalizedUrl) continue;
    if (failedRepoUrls.has(repoUrl.normalizedUrl)) continue;
    const cacheDir = resolveRepoCacheDir(repoUrl.normalizedUrl);
    if (!cacheDir || !fs.existsSync(cacheDir)) {
      missing.add(repoUrl.normalizedUrl);
    }
  }
  return Array.from(missing).sort((a, b) => a.localeCompare(b));
}

function buildEntry(
  template: RawTemplateRecord,
  sourceRoot: string,
): TemplateLibraryEntry {
  const parsedCategorySlug = parseTemplateCategoryFromUrl(template.template_url);
  const canonicalCategorySlug =
    parsedCategorySlug && CANONICAL_USE_CASE_SLUGS.has(parsedCategorySlug)
      ? parsedCategorySlug
      : template.category_slug;
  const canonicalCategoryName =
    template.category_slug === canonicalCategorySlug
      ? template.category_name
      : prettifyCategoryName(canonicalCategorySlug);
  const slug = slugify(`${canonicalCategorySlug}-${template.title}`);
  const titleBlocklisted = isTitleBlocklisted(template.title);
  const repoUrl = assessRepoUrl(template.repo_url);
  const { cloneRoot, inspectionRoot, subpathMissing } = resolveRepoInspectionPaths(sourceRoot, template);

  const repoInspection = inspectRepo(inspectionRoot);
  const isMonorepoFallback = subpathMissing && repoUrl.subpath;
  const isMonorepoWithoutSubpath = repoInspection.repoInfo.isMonorepo && !repoUrl.subpath;
  const skipFileSelection = isMonorepoFallback || isMonorepoWithoutSubpath;

  const selectedFilePaths = skipFileSelection
    ? []
    : (repoInspection.packageDir || repoInspection.files.length > 0
        ? findInterestingFiles(inspectionRoot, repoInspection.packageDir, repoInspection.files)
        : []);
  const selectedFiles = selectedFilePaths
    .map((filePath) => buildFileExcerpt(filePath, inspectionRoot))
    .filter(Boolean) as TemplateLibrarySelectedFile[];

  if (isMonorepoFallback) {
    console.warn(`[template-library] Subpath "${repoUrl.subpath}" not found locally for ${template.title} — skipping file selection to avoid monorepo contamination`);
  } else if (isMonorepoWithoutSubpath) {
    console.warn(`[template-library] Monorepo without subpath for ${template.title} — skipping file selection to avoid contamination`);
  }

  const usefulLines = (template.important_lines ?? [])
    .filter((line) => !NOISE_LINE_RE.test(line))
    .filter((line) => !/related templates?/i.test(line))
    .slice(0, 12);
  const noiseLines = (template.important_lines ?? []).filter((line) => NOISE_LINE_RE.test(line)).slice(0, 12);
  const repoInfo: TemplateLibraryRepoInfo = {
    ...repoInspection.repoInfo,
    url: repoUrl.url,
    normalizedUrl: repoUrl.normalizedUrl,
    subpath: repoUrl.subpath,
    clonePath: fs.existsSync(cloneRoot) ? cloneRoot : null,
  };
  const signals = detectSignals(template, selectedFiles);
  const strengths = deriveStrengths(signals, repoInfo);
  const recommendedScaffoldFamilies = recommendScaffoldFamilies(canonicalCategorySlug, signals);
  const classification = deriveClassification(
    canonicalCategorySlug,
    template,
    signals,
    repoInfo,
    recommendedScaffoldFamilies,
    selectedFiles,
  );
  const weaknesses = deriveWeaknesses(
    repoUrl.verdict,
    repoInfo,
    usefulLines,
    noiseLines,
    Boolean(isMonorepoFallback) || isMonorepoWithoutSubpath,
    template.framework_match,
    titleBlocklisted,
  );
  const qualityScore = scoreEntry(
    repoUrl.verdict,
    repoInfo,
    selectedFiles,
    strengths,
    weaknesses,
    recommendedScaffoldFamilies,
  );
  const verdict = decideVerdict(
    repoUrl.verdict,
    repoInfo,
    qualityScore,
    template.framework_match,
    titleBlocklisted,
  );

  const entryBase: TemplateLibraryEntry = {
    id: slug,
    slug,
    title: template.title,
    categorySlug: canonicalCategorySlug,
    categoryName: canonicalCategoryName,
    templateUrl: template.template_url,
    demoUrl: template.demo_url ?? null,
    description: template.description,
    frameworkReason: template.framework_reason,
    frameworkMatch: template.framework_match,
    verdict,
    qualityScore,
    repo: repoInfo,
    stackTags: template.stack_tags ?? [],
    usefulLines,
    noiseLines,
    strengths,
    weaknesses,
    recommendedScaffoldFamilies,
    signals,
    classification,
    summary: `${template.title} is a ${canonicalCategoryName} reference with ${strengths.slice(0, 3).join(", ") || "limited verified signals"}. Site form: ${classification.siteFormTags.join(", ")}. Verdict: ${verdict}.`,
    selectedFiles,
  };

  return {
    ...entryBase,
    runtimeGuidance: deriveTemplateRuntimeGuidance(entryBase),
  };
}

function tieBreakRepoDuplicatePreference(entry: TemplateLibraryEntry): number {
  let score = 0;
  if (!/\b\d+\b/.test(entry.title)) score += 2;
  if (!/\bwith\b/i.test(entry.title)) score += 1;
  if (!/^a\s/i.test(entry.title.trim())) score += 1;
  score -= entry.title.length / 500;
  return score;
}

function dedupeEntries(entries: TemplateLibraryEntry[]): TemplateLibraryEntry[] {
  const deduped = new Map<string, TemplateLibraryEntry>();
  for (const entry of entries) {
    if (!deduped.has(entry.id)) {
      deduped.set(entry.id, entry);
      continue;
    }

    const previous = deduped.get(entry.id)!;
    const preferCurrent =
      entry.qualityScore > previous.qualityScore ||
      (entry.qualityScore === previous.qualityScore &&
        entry.selectedFiles.length > previous.selectedFiles.length) ||
      (entry.qualityScore === previous.qualityScore &&
        entry.selectedFiles.length === previous.selectedFiles.length &&
        entry.strengths.length > previous.strengths.length);

    if (preferCurrent) {
      deduped.set(entry.id, entry);
    }
  }

  const repoDeduped = new Map<string, TemplateLibraryEntry>();
  for (const entry of deduped.values()) {
    const repoIdentity =
      entry.repo.normalizedUrl
        ? `${entry.categorySlug}::${entry.repo.normalizedUrl}::${entry.repo.subpath ?? ""}`
        : entry.id;
    if (!repoDeduped.has(repoIdentity)) {
      repoDeduped.set(repoIdentity, entry);
      continue;
    }

    const previous = repoDeduped.get(repoIdentity)!;
    const preferCurrent =
      entry.qualityScore > previous.qualityScore ||
      (entry.qualityScore === previous.qualityScore &&
        entry.selectedFiles.length > previous.selectedFiles.length) ||
      (entry.qualityScore === previous.qualityScore &&
        entry.selectedFiles.length === previous.selectedFiles.length &&
        entry.strengths.length > previous.strengths.length) ||
      (entry.qualityScore === previous.qualityScore &&
        entry.selectedFiles.length === previous.selectedFiles.length &&
        entry.strengths.length === previous.strengths.length &&
        tieBreakRepoDuplicatePreference(entry) > tieBreakRepoDuplicatePreference(previous));

    if (preferCurrent) {
      repoDeduped.set(repoIdentity, entry);
    }
  }

  return Array.from(repoDeduped.values()).sort(
    (a, b) => b.qualityScore - a.qualityScore || a.title.localeCompare(b.title),
  );
}

function writeTemplateLibraryDocs(catalog: TemplateLibraryCatalogFile, outputRoot: string): void {
  const dossierRoot = path.join(outputRoot, "dossiers");
  fs.rmSync(dossierRoot, { recursive: true, force: true });
  ensureDir(dossierRoot);

  const lines = [
    "# Template Library Catalog",
    "",
    `Generated: ${catalog.generatedAt}`,
    `Source root: ${catalog.sourceRoot}`,
    `Total templates audited: ${catalog.totalTemplates}`,
    `Curated templates: ${catalog.curatedTemplates}`,
    "",
    "## Verdict counts",
    "",
  ];

  const verdictCounts = new Map<TemplateLibraryVerdict, number>();
  for (const entry of catalog.entries) {
    verdictCounts.set(entry.verdict, (verdictCounts.get(entry.verdict) ?? 0) + 1);
  }
  for (const [verdict, count] of verdictCounts) {
    lines.push(`- ${verdict}: ${count}`);
  }

  lines.push("", "## Curated entries", "");
  for (const entry of catalog.entries.filter((item) => item.verdict === "valid" && item.qualityScore >= 45)) {
    lines.push(
      `- **${entry.title}** (${entry.verdict}, score ${entry.qualityScore}) -> ${entry.recommendedScaffoldFamilies.join(", ")}`,
    );

    const dossierDir = path.join(dossierRoot, entry.id);
    ensureDir(path.join(dossierDir, "selected_files"));
    writeJson(path.join(dossierDir, "manifest.json"), entry);

    const summaryLines = [
      `# ${entry.title}`,
      "",
      `- Category: ${entry.categoryName} (${entry.categorySlug})`,
      `- Verdict: ${entry.verdict}`,
      `- Quality score: ${entry.qualityScore}`,
      `- Scaffold families: ${entry.recommendedScaffoldFamilies.join(", ")}`,
      `- Repo: ${entry.repo.normalizedUrl ?? entry.repo.url ?? "missing"}`,
      `- Demo: ${entry.demoUrl ?? "missing"}`,
      "",
      entry.summary,
      "",
      "## Strengths",
      ...entry.strengths.map((value) => `- ${value}`),
      "",
      "## Weaknesses",
      ...(entry.weaknesses.length > 0 ? entry.weaknesses : ["- none noted"]),
    ];
    fs.writeFileSync(path.join(dossierDir, "summary.md"), summaryLines.join("\n"), "utf-8");

    for (const file of entry.selectedFiles) {
      const fileSlug = slugify(file.path).replace(/^-+|-+$/g, "") || "excerpt";
      const content = [
        `# ${file.path}`,
        "",
        `Reason: ${file.reason}`,
        "",
        "```text",
        file.excerpt,
        "```",
        "",
      ].join("\n");
      fs.writeFileSync(path.join(dossierDir, "selected_files", `${fileSlug}.md`), content, "utf-8");
    }
  }

  fs.writeFileSync(path.join(outputRoot, "catalog.md"), lines.join("\n"), "utf-8");
  writeJson(path.join(outputRoot, "catalog.json"), catalog);
  writeJson(path.join(outputRoot, "schema.template-manifest.json"), {
    type: "object",
    required: ["id", "title", "categorySlug", "verdict", "qualityScore", "recommendedScaffoldFamilies", "summary"],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      categorySlug: { type: "string" },
      verdict: { type: "string" },
      qualityScore: { type: "number" },
      recommendedScaffoldFamilies: {
        type: "array",
        items: { type: "string" },
      },
      summary: { type: "string" },
    },
  });
}

function pickBaseNextjsReferences(entries: TemplateLibraryEntry[]): TemplateLibraryEntry[] {
  return entries
    .filter((entry) => entry.verdict === "valid")
    .map((entry) => {
      let score = entry.qualityScore;
      if (entry.categorySlug === "starter") score += 12;
      if (/\bstarter\b/i.test(entry.title)) score += 4;
      if (/\bboilerplate\b/i.test(entry.title)) score -= 8;
      if (entry.repo.hasAppDir || entry.repo.hasSrcAppDir) score += 8;
      if (entry.recommendedScaffoldFamilies.includes("landing-page")) score += 4;
      if (entry.recommendedScaffoldFamilies.includes("content-site")) score += 4;
      if (!entry.signals.auth && !entry.signals.dashboard && !entry.signals.ecommerce) score += 6;
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score || b.entry.qualityScore - a.entry.qualityScore)
    .slice(0, 5)
    .map(({ entry }) => entry);
}

function buildScaffoldResearch(entries: TemplateLibraryEntry[]) {
  const grouped = new Map<string, TemplateLibraryEntry[]>();
  for (const entry of entries.filter((item) => item.verdict === "valid")) {
    for (const family of entry.recommendedScaffoldFamilies) {
      if (!grouped.has(family)) grouped.set(family, []);
      grouped.get(family)?.push(entry);
    }
  }

  const scaffolds: Record<string, { qualityChecklist: string[]; research: { upgradeTargets: string[]; referenceTemplates: Array<{ id: string; title: string; categorySlug: string; qualityScore: number; strengths: string[]; }>; }; }> = {};
  const families = Array.from(new Set([
    ...(Object.keys(SCAFFOLD_CHECKLISTS) as ScaffoldFamily[]),
    ...(Object.keys(SCAFFOLD_UPGRADE_TARGETS) as ScaffoldFamily[]),
    ...(Array.from(grouped.keys()) as ScaffoldFamily[]),
  ]));

  for (const family of families) {
    const groupedReferences = grouped.get(family) ?? [];
    const RESEARCH_EXCLUDE_CATEGORIES = new Set([
      "ai", "cron", "edge-functions", "edge-middleware", "edge-config",
      "web3", "vercel-firewall", "cdn", "backend", "security",
      "microfrontends", "virtual-event", "monorepos", "realtime-apps",
    ]);
    const filteredReferences = groupedReferences.filter(
      (entry) =>
        !isStarterOrBoilerplateReference(entry) &&
        !RESEARCH_EXCLUDE_CATEGORIES.has(entry.categorySlug),
    );
    const references =
      family === "base-nextjs"
        ? pickBaseNextjsReferences(entries)
        : filteredReferences.length > 0
          ? filteredReferences
          : groupedReferences;
    scaffolds[family] = {
      qualityChecklist: SCAFFOLD_CHECKLISTS[family] ?? [],
      research: {
        upgradeTargets: SCAFFOLD_UPGRADE_TARGETS[family] ?? [],
        referenceTemplates: references
          .sort((a, b) => b.qualityScore - a.qualityScore)
          .slice(0, 5)
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            categorySlug: entry.categorySlug,
            qualityScore: entry.qualityScore,
            strengths: entry.strengths.slice(0, 4),
          })),
      },
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "scripts/template-library/build-template-library.ts",
    scaffolds,
  };
}

function validateTemplateLibraryEntries(entries: TemplateLibraryEntry[]): void {
  for (const entry of entries) {
    for (const family of entry.recommendedScaffoldFamilies) {
      if (!KNOWN_SCAFFOLD_FAMILIES.has(family)) {
        throw new Error(
          `[template-library] ${entry.id} references unknown scaffold family "${family}"`,
        );
      }
    }
  }
}

function validateScaffoldResearchAgainstCatalog(
  scaffoldResearch: ReturnType<typeof buildScaffoldResearch>,
  entries: TemplateLibraryEntry[],
): void {
  const entryIds = new Set(entries.map((entry) => entry.id));
  for (const [family, payload] of Object.entries(scaffoldResearch.scaffolds)) {
    if (!KNOWN_SCAFFOLD_FAMILIES.has(family as ScaffoldFamily)) {
      throw new Error(
        `[template-library] scaffold research generated unknown family "${family}"`,
      );
    }
    for (const reference of payload.research.referenceTemplates) {
      if (!entryIds.has(reference.id)) {
        throw new Error(
          `[template-library] scaffold family "${family}" references missing template id "${reference.id}"`,
        );
      }
    }
  }
}

function parseArgs(): { sourceRoot: string } {
  const explicit = process.argv.find((arg) => arg.startsWith("--source="));
  return {
    sourceRoot: explicit ? explicit.slice("--source=".length) : RAW_DISCOVERY_CURRENT_ROOT,
  };
}

function main(): void {
  const { sourceRoot } = parseArgs();
  const summaryPath = path.resolve(resolveSummaryPath(sourceRoot));
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Template dataset not found at ${summaryPath}`);
  }

  const normalizedSummary = normalizeLegacySummary(readJson<unknown>(summaryPath));
  const sourceDir = fs.statSync(summaryPath).isFile() ? path.dirname(summaryPath) : sourceRoot;
  const rawEntries = Object.values(normalizedSummary).flat();
  const failedRepoUrls = loadRepoCacheFailures();
  if (failedRepoUrls.size > 0) {
    console.warn(
      `[template-library] hydrate reported ${failedRepoUrls.size} failed repo clone(s); affected entries may be demoted to research_only`,
    );
  }
  const missingRepoCacheUrls = collectMissingRepoCacheUrls(rawEntries, failedRepoUrls);
  if (missingRepoCacheUrls.length > 0) {
    const preview = missingRepoCacheUrls.slice(0, 10).join("\n- ");
    throw new Error(
      `[template-library] Missing repo-cache entries for ${missingRepoCacheUrls.length} repos.\n` +
      `Run scripts/template-library/hydrate-template-library-cache.ts against the same --source before build.\n` +
      `Examples:\n- ${preview}`,
    );
  }
  const allEntries = rawEntries
    .map((entry) => buildEntry(entry, sourceDir))
    .sort((a, b) => b.qualityScore - a.qualityScore || a.title.localeCompare(b.title));
  const entries = dedupeEntries(allEntries);

  const curatedEntries = entries.filter(
    (entry) => entry.verdict === "valid" && entry.qualityScore >= 45,
  );
  validateTemplateLibraryEntries(curatedEntries);
  const scaffoldResearch = buildScaffoldResearch(curatedEntries);
  validateScaffoldResearchAgainstCatalog(scaffoldResearch, curatedEntries);
  const sanitizedEntries = entries.map(sanitizeEntryForCatalogOutput);
  const sanitizedCuratedEntries = curatedEntries.map(sanitizeEntryForCatalogOutput);

  const catalog: TemplateLibraryCatalogFile = {
    generatedAt: new Date().toISOString(),
    sourceRoot: sanitizeSourceRootForCatalog(sourceDir),
    totalTemplates: entries.length,
    curatedTemplates: curatedEntries.length,
    entries: sanitizedEntries,
  };

  ensureDir(TEMPLATE_LIBRARY_ROOT);
  writeTemplateLibraryDocs(catalog, TEMPLATE_LIBRARY_ROOT);
  writeJson(GENERATED_CATALOG_PATH, {
    generatedAt: catalog.generatedAt,
    sourceRoot: catalog.sourceRoot,
    totalTemplates: catalog.totalTemplates,
    curatedTemplates: catalog.curatedTemplates,
    entries: sanitizedCuratedEntries,
  });
  writeJson(GENERATED_SCAFFOLD_RESEARCH_PATH, scaffoldResearch);
  writeScaffoldCandidateReport(curatedEntries, {
    outputPath: SCAFFOLD_CANDIDATE_REPORT_PATH,
    source: "scripts/template-library/build-template-library.ts",
    input: summaryPath,
  });

  console.info(`[template-library] Total templates audited: ${catalog.totalTemplates}`);
  console.info(`[template-library] Curated templates: ${catalog.curatedTemplates}`);
  console.info(`[template-library] Wrote agent library to ${TEMPLATE_LIBRARY_ROOT}`);
  console.info(`[template-library] Wrote scaffold candidate report to ${SCAFFOLD_CANDIDATE_REPORT_PATH}`);
}

main();
