import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import { extractAppRoutePathsFromFilePaths, findMissingPlannedRoutes, type PlannedRoute } from "@/lib/gen/route-plan";
import {
  detectBusinessWorkflowPacks,
  type BusinessWorkflowPack,
} from "@/lib/gen/packs/business-packs";
import {
  runProjectSanityChecks,
  type SanityIssue,
  type SanityResult,
} from "@/lib/gen/validation/project-sanity";
import { DESIGN_TOKEN_FILES } from "./constants";
import { diffFiles, type FileDiff } from "./post-checks-diff";
import { getPreviewBlockingReason } from "./post-checks-preview";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import type { DesignTokenSummary, FileEntry, VersionEntry } from "./types";

export type SuspiciousUseCall = {
  file: string;
  line: number;
  snippet: string;
};

export type SeoIssue = {
  severity: "warning" | "error";
  code:
    | "missing-metadata"
    | "missing-title"
    | "missing-description"
    | "missing-canonical"
    | "missing-open-graph"
    | "missing-og-image"
    | "missing-twitter"
    | "missing-robots"
    | "missing-sitemap"
    | "missing-json-ld"
    | "missing-h1"
    | "multiple-h1"
    | "heading-hierarchy";
  message: string;
  file?: string | null;
};

export type SeoReview = {
  passed: boolean;
  issues: SeoIssue[];
  signals: {
    metadata: boolean;
    title: boolean;
    description: boolean;
    canonical: boolean;
    openGraph: boolean;
    ogImage: boolean;
    twitter: boolean;
    robots: boolean;
    sitemap: boolean;
    jsonLd: boolean;
    homeH1Count: number | null;
  };
};

type AnalyticsIssue = {
  severity: "info" | "warning" | "error";
  code:
    | "missing-analytics-tracker"
    | "missing-conversion-events";
  message: string;
  file?: string | null;
};

export type AnalyticsReview = {
  passed: boolean;
  issues: AnalyticsIssue[];
  signals: {
    trackerDetected: boolean;
    trackerProviders: string[];
    conversionSurfaceCount: number;
    conversionEventCount: number;
  };
};

export type EditorialPack = {
  id:
    | "hero"
    | "services"
    | "testimonials"
    | "team"
    | "faq"
    | "contact"
    | "blog"
    | "metadata";
  label: string;
  reason: string;
  suggestedPrompt: string;
};

export type EditorialReview = {
  packs: EditorialPack[];
  signals: {
    hasBlogCollection: boolean;
    hasContactFlow: boolean;
  };
};

export type BusinessWorkflowReview = {
  packs: BusinessWorkflowPack[];
  signals: {
    hasLeadCapture: boolean;
    hasBookingFlow: boolean;
    hasCrmSync: boolean;
  };
};

export type PostCheckBaseline = {
  previousVersionId: string | null;
  changes: FileDiff | null;
  warnings: string[];
  missingRoutes: string[];
  missingPlannedRoutes: PlannedRoute[];
  lucideLinkMisuse: string[];
  suspiciousUseCalls: SuspiciousUseCall[];
  designTokens: DesignTokenSummary | null;
  seoReview: SeoReview;
  analyticsReview: AnalyticsReview;
  editorialReview: EditorialReview;
  businessWorkflowReview: BusinessWorkflowReview;
  sanity: SanityResult;
  sanityIssues: SanityIssue[];
  sanityErrors: SanityIssue[];
  sanityWarnings: SanityIssue[];
  resolvedDemoUrl: string | null;
  previewBlockingReason: string | null;
};

function extractDesignTokens(files: FileEntry[]): DesignTokenSummary | null {
  const candidate = files.find((file) =>
    DESIGN_TOKEN_FILES.some((path) => file.name.endsWith(path)),
  );
  if (!candidate?.content) return null;

  const tokens: Array<{ name: string; value: string }> = [];
  const regex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;\n]+);/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(candidate.content)) && tokens.length < 24) {
    tokens.push({ name: `--${match[1]}`, value: match[2].trim() });
  }
  if (tokens.length === 0) return null;

  return { source: candidate.name, tokens };
}

function findSuspiciousUseCalls(files: FileEntry[]): SuspiciousUseCall[] {
  const results: SuspiciousUseCall[] = [];
  const pattern = /\b(?:React\.)?use\s*\(/g;
  files.forEach((file) => {
    if (!file.content) return;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(line))) {
        const after = line.slice(match.index + match[0].length);
        const nextChar = after.trim()[0];
        if (nextChar && ("{[\"'`".includes(nextChar) || /[0-9]/.test(nextChar))) {
          results.push({ file: file.name, line: index + 1, snippet: line.trim() });
          break;
        }
      }
    });
  });
  return results;
}

function normalizeInternalHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/api")) return null;
  if (trimmed.startsWith("/_next")) return null;
  if (trimmed.startsWith("/favicon")) return null;
  if (trimmed.startsWith("/robots")) return null;
  if (trimmed.startsWith("/sitemap")) return null;
  if (trimmed.includes("${")) return null;
  const cleaned = trimmed.split("#")[0].split("?")[0];
  if (!cleaned) return null;
  return cleaned === "" ? "/" : cleaned;
}

function extractStaticInternalLinks(files: FileEntry[]): string[] {
  const results = new Set<string>();
  const hrefRegex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g;
  for (const file of files) {
    if (!file?.content) continue;
    const content = file.content;
    let match: RegExpExecArray | null = null;
    hrefRegex.lastIndex = 0;
    while ((match = hrefRegex.exec(content))) {
      const raw = match[1] || match[2] || match[3] || "";
      const normalized = normalizeInternalHref(raw);
      if (normalized) results.add(normalized);
    }
  }
  return Array.from(results);
}

function routePatternToRegex(route: string): RegExp {
  const cleaned = route.replace(/\/+$/, "") || "/";
  if (cleaned === "/") return /^\/$/;
  const segments = cleaned.split("/").filter(Boolean);
  let pattern = "^";
  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      pattern += "(?:/.*)?";
      break;
    }
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      pattern += "/.+";
      continue;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      pattern += "/[^/]+";
      continue;
    }
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
  }
  pattern += "$";
  return new RegExp(pattern);
}

function findMissingRoutes(links: string[], routes: string[]): string[] {
  if (routes.length === 0) return links;
  const matchers = routes.map(routePatternToRegex);
  return links.filter((link) => !matchers.some((matcher) => matcher.test(link)));
}

function findLucideLinkMisuse(files: FileEntry[]): string[] {
  const affected = new Set<string>();
  const lucideLinkImport =
    /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*["']lucide-react["'];?/;
  const hrefUsage = /<Link\b[^>]*\bhref\s*=/;

  for (const file of files) {
    if (!file?.content) continue;
    if (!lucideLinkImport.test(file.content)) continue;
    if (!hrefUsage.test(file.content)) continue;
    affected.add(file.name);
  }

  return Array.from(affected);
}

function findFileBySuffix(files: FileEntry[], suffixes: string[]): FileEntry | null {
  return (
    files.find((file) =>
      suffixes.some((suffix) => file.name === suffix || file.name.endsWith(`/${suffix}`)),
    ) ?? null
  );
}

function countMatches(content: string, regex: RegExp): number {
  return (content.match(regex) || []).length;
}

function hasBrokenHeadingHierarchy(content: string): boolean {
  const headingMatches = Array.from(content.matchAll(/<h([1-6])\b/gi));
  if (headingMatches.length <= 1) return false;
  let previousLevel: number | null = null;
  for (const match of headingMatches) {
    const currentLevel = Number(match[1]);
    if (!Number.isFinite(currentLevel)) continue;
    if (previousLevel !== null && currentLevel - previousLevel > 1) {
      return true;
    }
    previousLevel = currentLevel;
  }
  return false;
}

function buildSeoReview(files: FileEntry[]): SeoReview {
  const layoutFile = findFileBySuffix(files, ["app/layout.tsx", "src/app/layout.tsx"]);
  const homePageFile = findFileBySuffix(files, ["app/page.tsx", "src/app/page.tsx"]);
  const robotsFile = findFileBySuffix(files, ["app/robots.ts", "src/app/robots.ts"]);
  const sitemapFile = findFileBySuffix(files, ["app/sitemap.ts", "src/app/sitemap.ts"]);
  const opengraphFile = findFileBySuffix(files, [
    "app/opengraph-image.tsx",
    "src/app/opengraph-image.tsx",
    "app/opengraph-image.png",
    "src/app/opengraph-image.png",
    "app/opengraph-image.jpg",
    "src/app/opengraph-image.jpg",
    "app/opengraph-image.jpeg",
    "src/app/opengraph-image.jpeg",
  ]);

  const layoutContent = layoutFile?.content ?? "";
  const metadata = /\bexport\s+const\s+metadata\b/.test(layoutContent);
  const title = metadata && /\btitle\s*:/.test(layoutContent);
  const description = metadata && /\bdescription\s*:/.test(layoutContent);
  const canonical = metadata && (/\balternates\s*:/.test(layoutContent) || /\bcanonical\s*:/.test(layoutContent) || /rel=["']canonical["']/.test(layoutContent));
  const openGraph = metadata && /\bopenGraph\s*:/.test(layoutContent);
  const ogImage = (openGraph && /\bimages\s*:/.test(layoutContent)) || Boolean(opengraphFile);
  const twitter = metadata && /\btwitter\s*:/.test(layoutContent);
  const robots = Boolean(robotsFile);
  const sitemap = Boolean(sitemapFile);
  const jsonLd = files.some((file) =>
    /application\/ld\+json|json-ld/i.test(file.content ?? ""),
  );
  const homeH1Count = homePageFile?.content ? countMatches(homePageFile.content, /<h1\b/gi) : null;
  const pageFiles = files.filter((file) =>
    /(^|\/)app\/.*page\.(tsx|jsx)$/.test(file.name) || /(^|\/)src\/app\/.*page\.(tsx|jsx)$/.test(file.name),
  );

  const issues: SeoIssue[] = [];

  if (!metadata) {
    issues.push({
      severity: "warning",
      code: "missing-metadata",
      message: "Layouten saknar export av metadata för title/description.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !title) {
    issues.push({
      severity: "warning",
      code: "missing-title",
      message: "Metadata saknar title.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !description) {
    issues.push({
      severity: "warning",
      code: "missing-description",
      message: "Metadata saknar description.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !canonical) {
    issues.push({
      severity: "warning",
      code: "missing-canonical",
      message: "Metadata saknar canonical-strategi.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !openGraph) {
    issues.push({
      severity: "warning",
      code: "missing-open-graph",
      message: "Metadata saknar Open Graph-falt.",
      file: layoutFile?.name ?? null,
    });
  }
  if (openGraph && !ogImage) {
    issues.push({
      severity: "warning",
      code: "missing-og-image",
      message: "Open Graph saknar bildstrategi (metadata images eller opengraph-image-fil).",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !twitter) {
    issues.push({
      severity: "warning",
      code: "missing-twitter",
      message: "Metadata saknar Twitter-kort.",
      file: layoutFile?.name ?? null,
    });
  }
  if (!robots) {
    issues.push({
      severity: "warning",
      code: "missing-robots",
      message: "Projektet saknar app/robots.ts.",
      file: null,
    });
  }
  if (!sitemap) {
    issues.push({
      severity: "warning",
      code: "missing-sitemap",
      message: "Projektet saknar app/sitemap.ts.",
      file: null,
    });
  }
  if (!jsonLd) {
    issues.push({
      severity: "warning",
      code: "missing-json-ld",
      message: "Ingen JSON-LD/schema.org-markup hittades.",
      file: null,
    });
  }
  if (homeH1Count === 0) {
    issues.push({
      severity: "warning",
      code: "missing-h1",
      message: "Startsidan saknar h1-rubrik.",
      file: homePageFile?.name ?? null,
    });
  } else if (homeH1Count !== null && homeH1Count > 1) {
    issues.push({
      severity: "warning",
      code: "multiple-h1",
      message: "Startsidan har flera h1-rubriker.",
      file: homePageFile?.name ?? null,
    });
  }
  for (const pageFile of pageFiles.slice(0, 12)) {
    if (hasBrokenHeadingHierarchy(pageFile.content ?? "")) {
      issues.push({
        severity: "warning",
        code: "heading-hierarchy",
        message: "Rubrikhierarkin hoppar över nivåer (t.ex. h1 -> h3).",
        file: pageFile.name,
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    signals: {
      metadata,
      title,
      description,
      canonical,
      openGraph,
      ogImage,
      twitter,
      robots,
      sitemap,
      jsonLd,
      homeH1Count,
    },
  };
}

function detectAnalyticsSignals(files: FileEntry[]) {
  const combined = files.map((file) => file.content ?? "").join("\n\n");
  const trackerProviders = [
    { label: "Besöksstatistik", match: /@vercel\/analytics|<Analytics\b|from\s+["']@vercel\/analytics/i },
    { label: "Google Analytics", match: /\bgtag\(|google-analytics|GA_MEASUREMENT_ID|NEXT_PUBLIC_GA_ID/i },
    { label: "Google Tag Manager", match: /googletagmanager|dataLayer\.push|NEXT_PUBLIC_GTM_ID|GTM-[A-Z0-9]+/i },
    { label: "Plausible", match: /\bplausible\b|NEXT_PUBLIC_PLAUSIBLE_DOMAIN/i },
    { label: "PostHog", match: /\bposthog\b|NEXT_PUBLIC_POSTHOG_KEY|NEXT_PUBLIC_POSTHOG_HOST/i },
    { label: "Mixpanel", match: /\bmixpanel\b|mixpanel\.track/i },
    { label: "Fathom", match: /\bfathom\b|trackGoal|trackEvent/i },
  ]
    .filter((provider) => provider.match.test(combined))
    .map((provider) => provider.label);

  const conversionSurfaceCount = files.reduce((count, file) => {
    const content = file.content ?? "";
    const formHits = (content.match(/<form\b|onSubmit=|type=["']submit["']/gi) || []).length;
    const ctaHits = (content.match(/mailto:|tel:|book now|boka nu|quote request|request quote|checkout|subscribe/gi) || []).length;
    return count + formHits + ctaHits;
  }, 0);

  const conversionEventCount = files.reduce((count, file) => {
    const content = file.content ?? "";
    const eventHits =
      (content.match(/gtag\(\s*["']event["']/gi) || []).length +
      (content.match(/dataLayer\.push\(\s*\{/gi) || []).length +
      (content.match(/plausible\(\s*["']/gi) || []).length +
      (content.match(/posthog\.capture\(/gi) || []).length +
      (content.match(/mixpanel\.track\(/gi) || []).length +
      (content.match(/trackGoal\(|trackEvent\(/gi) || []).length;
    return count + eventHits;
  }, 0);

  return {
    trackerDetected: trackerProviders.length > 0,
    trackerProviders,
    conversionSurfaceCount,
    conversionEventCount,
  };
}

export function buildAnalyticsReview(files: FileEntry[]): AnalyticsReview {
  const signals = detectAnalyticsSignals(files);
  const issues: AnalyticsIssue[] = [];

  if (signals.conversionSurfaceCount > 0 && !signals.trackerDetected) {
    issues.push({
      severity: "info",
      code: "missing-analytics-tracker",
      message: "Sidan verkar ha CTA-/formulärflöden men ingen analytics-tracker hittades.",
      file: null,
    });
  }

  if (signals.conversionSurfaceCount > 0 && signals.trackerDetected && signals.conversionEventCount === 0) {
    issues.push({
      severity: "info",
      code: "missing-conversion-events",
      message: "Tracker finns, men inga tydliga konverteringsevents hittades för CTA-/formulärflöden.",
      file: null,
    });
  }

  return {
    passed: issues.length === 0,
    issues,
    signals,
  };
}

function buildEditorialReview(files: FileEntry[]): EditorialReview {
  const combined = files.map((file) => file.content ?? "").join("\n\n");
  const routeNames = files.map((file) => file.name).join("\n");
  const packs: EditorialPack[] = [];

  const pushPack = (pack: EditorialPack) => {
    if (!packs.some((existing) => existing.id === pack.id)) {
      packs.push(pack);
    }
  };

  if (/\bhero\b|text-5xl|text-6xl|primary cta|headline/i.test(combined)) {
    pushPack({
      id: "hero",
      label: "Hero",
      reason: "Startsidan verkar ha en hero- eller top-section med huvudbudskap och CTA.",
      suggestedPrompt: "Uppdatera hero-sektionen med ny rubrik, ingress och CTA utan att ändra resten av designen.",
    });
  }
  if (/\b(services?|offerings|what we do)\b/i.test(combined) && /id=["']?(services|tjanster|erbjudande)\b|<h[2-3][^>]*>\s*(Tjänster|Services|Erbjudande)/i.test(combined)) {
    pushPack({
      id: "services",
      label: "Services",
      reason: "Sajten verkar ha ett tjänste- eller erbjudandeblock.",
      suggestedPrompt: "Uppdatera tjänste-/erbjudandesektionen med nya titlar, beskrivningar och ordning utan att göra en full redesign.",
    });
  }
  if (/\btestimonial|testimonials|reviews?|kundomdomen|kundrecension/i.test(combined)) {
    pushPack({
      id: "testimonials",
      label: "Testimonials",
      reason: "Sajten verkar ha social proof i form av omdömen eller testimonials.",
      suggestedPrompt: "Uppdatera testimonials-sektionen med nya kundnamn, citat och roller utan att ändra layouten.",
    });
  }
  if (/\b(team|medarbetare|our people|staff)\b/i.test(combined) && /id=["']?team\b|<h[2-3][^>]*>\s*(Team|Medarbetare|Our People)/i.test(combined)) {
    pushPack({
      id: "team",
      label: "Team",
      reason: "Sajten verkar ha en team- eller people-sektion.",
      suggestedPrompt: "Uppdatera team-sektionen med nya personer, roller och korta bio-texter utan att ändra resten av sidan.",
    });
  }
  if (/\bfaq\b/i.test(combined) || (/\b(accordion|frågor|fragor|questions)\b/i.test(combined) && /id=["']?faq\b|<h[2-3][^>]*>\s*(FAQ|Vanliga frågor|Questions)/i.test(combined))) {
    pushPack({
      id: "faq",
      label: "FAQ",
      reason: "Sajten verkar ha en FAQ eller frågesektion.",
      suggestedPrompt: "Uppdatera FAQ-sektionen med nya frågor och svar utan att ändra den visuella strukturen.",
    });
  }
  if (/\bcontact\b|kontakt|mailto:|tel:|<form\b/i.test(combined)) {
    pushPack({
      id: "contact",
      label: "Contact",
      reason: "Sajten verkar ha kontaktuppgifter eller kontaktflöde.",
      suggestedPrompt: "Uppdatera kontaktsektionen med nya kontaktuppgifter, öppettider och CTA utan att ändra resten av designen.",
    });
  }
  if (/\bblog\b|inlagg|inlägg|newsletter/i.test(combined) || /\/blog\b/i.test(routeNames)) {
    pushPack({
      id: "blog",
      label: "Blog / content",
      reason: "Sajten verkar ha blogg- eller innehållssidor.",
      suggestedPrompt: "Uppdatera blogg-/innehållssektionen med nya artikeltitlar, sammanfattningar eller metadata utan att ändra site shell.",
    });
  }
  if (/\bexport\s+const\s+metadata\b|generateMetadata|application\/ld\+json/i.test(combined)) {
    pushPack({
      id: "metadata",
      label: "Metadata",
      reason: "Sajten verkar redan ha metadata/SEO-yta som kan redigeras separat.",
      suggestedPrompt: "Uppdatera metadata, titelmall, beskrivning och social sharing-text utan att ändra sidlayouten.",
    });
  }

  return {
    packs,
    signals: {
      hasBlogCollection: packs.some((pack) => pack.id === "blog"),
      hasContactFlow: packs.some((pack) => pack.id === "contact"),
    },
  };
}

function buildBusinessWorkflowReview(files: FileEntry[]): BusinessWorkflowReview {
  const combined = files.map((file) => file.content ?? "").join("\n\n");
  const packs = detectBusinessWorkflowPacks(combined);
  return {
    packs,
    signals: {
      hasLeadCapture: packs.some(
        (pack) => pack.id === "lead-capture" && pack.signalStrength !== "weak",
      ),
      hasBookingFlow: packs.some(
        (pack) => pack.id === "booking" && pack.signalStrength !== "weak",
      ),
      hasCrmSync: packs.some((pack) => pack.id === "crm-sync"),
    },
  };
}

export function buildPostCheckBaseline(params: {
  currentFiles: FileEntry[];
  previousFiles: FileEntry[];
  previousVersionId: string | null;
  versions: VersionEntry[];
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
}): PostCheckBaseline {
  const { currentFiles, previousFiles, previousVersionId, versions, versionId, demoUrl, preflight } =
    params;
  const changes = previousVersionId ? diffFiles(previousFiles, currentFiles) : null;
  const suspiciousUseCalls = findSuspiciousUseCalls(currentFiles);
  const warnings: string[] = [];

  if (suspiciousUseCalls.length > 0) {
    warnings.push(
      `Möjlig React use()-missbruk i ${
        new Set(suspiciousUseCalls.map((entry) => entry.file)).size
      } fil(er).`,
    );
  }

  const routePaths = extractAppRoutePathsFromFilePaths(currentFiles.map((file) => file.name));
  const internalLinks = extractStaticInternalLinks(currentFiles);
  const missingRoutes = findMissingRoutes(internalLinks, routePaths);
  const missingPlannedRoutes = findMissingPlannedRoutes(preflight?.routePlan, routePaths);
  const lucideLinkMisuse = findLucideLinkMisuse(currentFiles);
  const seoReview = buildSeoReview(currentFiles);
  const analyticsReview = buildAnalyticsReview(currentFiles);
  const editorialReview = buildEditorialReview(currentFiles);
  const businessWorkflowReview = buildBusinessWorkflowReview(currentFiles);
  const sanity = runProjectSanityChecks(
    currentFiles.map((file) => ({
      path: file.name,
      content: file.content ?? "",
      language: inferFileLanguage(file.name),
    })),
    { scaffoldBaselineCoversPackageJson: true },
  );
  const sanityIssues = sanity.issues;
  const sanityErrors = sanityIssues.filter((issue) => issue.severity === "error");
  const sanityWarnings = sanityIssues.filter((issue) => issue.severity === "warning");

  if (missingRoutes.length > 0) {
    const preview = missingRoutes.slice(0, 6).join(", ");
    const suffix = missingRoutes.length > 6 ? " …" : "";
    warnings.push(`Saknar route för ${preview}${suffix}.`);
  }
  // Route-plan mismatches are already emitted by preflight diagnostics.
  // Keep this data in baseline for tooling, but avoid duplicate user-facing warnings.
  if (lucideLinkMisuse.length > 0) {
    const preview = lucideLinkMisuse.slice(0, 6).join(", ");
    const suffix = lucideLinkMisuse.length > 6 ? " …" : "";
    warnings.push(`Fel Link-import i ${preview}${suffix}. Använd \`next/link\`, inte \`lucide-react\`.`);
  }
  if (sanityErrors.length > 0 || sanityWarnings.length > 0) {
    warnings.push(`Kodsanity: ${sanityErrors.length} error, ${sanityWarnings.length} warning.`);
  }
  if (!seoReview.passed) {
    const preview = seoReview.issues
      .slice(0, 4)
      .map((issue) => issue.message)
      .join(" | ");
    const suffix = seoReview.issues.length > 4 ? " …" : "";
    warnings.push(`SEO: ${preview}${suffix}`);
  }
  // Analytics, editorial, and business packs are logged as separate info-level
  // entries via post-checks-results — not included in the warning baseline.

  const versionEntry = versions.find(
    (entry) => entry.versionId === versionId || entry.id === versionId,
  );
  const resolvedDemoUrl = demoUrl ?? versionEntry?.demoUrl ?? null;
  const previewBlockingReason = getPreviewBlockingReason(preflight);
  const designTokens = extractDesignTokens(currentFiles);

  if (preflight?.verificationBlocked && resolvedDemoUrl) {
    warnings.push("Preview är tillgänglig, men versionen har verifieringsblockerande preflightfel.");
  }

  return {
    previousVersionId,
    changes,
    warnings,
    missingRoutes,
    missingPlannedRoutes,
    lucideLinkMisuse,
    suspiciousUseCalls,
    designTokens,
    seoReview,
    analyticsReview,
    editorialReview,
    businessWorkflowReview,
    sanity,
    sanityIssues,
    sanityErrors,
    sanityWarnings,
    resolvedDemoUrl,
    previewBlockingReason,
  };
}
