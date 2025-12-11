/**
 * Website scraper for audit feature
 * Extracts multi-page content so the audit is not limited to a weak landing page.
 */

import type { WebsiteContent } from "@/types/audit";

// Crawl settings
const MAX_PAGES = 4; // root + up to three strong internal pages
const PRIMARY_MIN_WORDS = 160; // prefer pages with real copy, not just hero
const SECONDARY_MIN_WORDS = 80; // minimum words to include a secondary page
const MIN_AGGREGATION_WORDS = 40; // skip near-empty pages from aggregation
const AGGREGATE_WORD_LIMIT = 2000; // cap aggregated text to reduce token usage
const MAX_LINKS_TO_CONSIDER = 25; // cap to avoid crawling too broadly

type CandidateLink = {
  url: string;
  anchor?: string;
  score: number;
};

type ParsedPage = WebsiteContent & {
  linksForFollow: CandidateLink[];
};

function pageRichnessScore(page: ParsedPage): number {
  const topLinkScore = page.linksForFollow[0]?.score ?? 0;
  return page.wordCount + topLinkScore * 15 + page.headings.length * 8;
}

// Use dynamic import for cheerio to avoid build issues
async function getCheerio() {
  const cheerio = await import("cheerio");
  return cheerio;
}

function normalizeInputUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isLikelyHtml(contentType: string | null): boolean {
  if (!contentType) return false;
  return (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  );
}

function absoluteUrl(href: string, base: URL): string | null {
  if (!href) return null;
  const trimmed = href.trim();

  if (!trimmed || trimmed.startsWith("javascript:")) return null;
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return null;

  try {
    if (trimmed.startsWith("//")) {
      return `${base.protocol}${trimmed}`;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("#")) {
      return null; // fragment only
    }
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

function scoreLink(url: string, anchor?: string): number {
  const value = `${url} ${anchor || ""}`.toLowerCase();
  let score = 0;

  // Prefer core navigation/overview pages
  if (value.includes("om oss") || value.includes("about")) score += 6;
  if (value.includes("tjänster") || value.includes("services")) score += 5;
  if (value.includes("produkter") || value.includes("product")) score += 4;
  if (
    value.includes("portfolio") ||
    value.includes("case") ||
    value.includes("work")
  )
    score += 3;
  if (value.includes("blog") || value.includes("nyheter")) score += 2;
  if (
    value.includes("home") ||
    value.includes("hem") ||
    value.includes("start")
  )
    score += 2;
  if (value.includes("kontakt") || value.includes("contact")) score += 1;

  // Penalize low-value/legal-only links
  if (
    value.includes("policy") ||
    value.includes("cookie") ||
    value.includes("privacy") ||
    value.includes("integritet") ||
    value.includes("terms")
  ) {
    score -= 4;
  }
  if (
    value.includes("login") ||
    value.includes("logga in") ||
    value.includes("signup")
  ) {
    score -= 3;
  }

  // Slight boost for short, clean paths
  const pathSegments = url.split("/").filter(Boolean);
  if (pathSegments.length <= 2) score += 1;

  return score;
}

function dedupeLinks(links: CandidateLink[]): CandidateLink[] {
  const seen = new Set<string>();
  const result: CandidateLink[] = [];

  for (const link of links) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    result.push(link);
  }

  return result;
}

async function fetchPage(url: string): Promise<{
  html: string;
  finalUrl: string;
  responseTime: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  const start = Date.now();
  let response: Response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`HTTP-fel: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!isLikelyHtml(contentType)) {
    throw new Error("Hittade inget HTML-innehåll att analysera");
  }

  const html = await response.text();
  const responseTime = Date.now() - start;

  return {
    html,
    finalUrl: response.url || url,
    responseTime,
  };
}

async function parsePage(
  html: string,
  url: string,
  responseTime: number
): Promise<ParsedPage> {
  const cheerio = await getCheerio();
  const $ = cheerio.load(html);
  const baseUrl = new URL(url);

  // Remove noise
  $("script, style, noscript").remove();

  // Extract core fields
  const title = $("title").text().trim() || "Ingen titel";
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text && headings.length < 25) headings.push(text);
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const words = bodyText.split(" ");
  const limitedText = words.slice(0, 1500).join(" ");
  const wordCount = words.length;

  let internalLinks = 0;
  let externalLinks = 0;
  const images = $("img").length;

  const linksForFollow: CandidateLink[] = [];

  // Canonical/OG URLs are strong candidates
  const canonicalHref = $('link[rel="canonical"]').attr("href");
  const ogHref = $('meta[property="og:url"]').attr("content");

  [canonicalHref, ogHref].forEach((href) => {
    if (!href) return;
    const abs = absoluteUrl(href, baseUrl);
    if (!abs) return;
    try {
      const u = new URL(abs);
      if (u.hostname !== baseUrl.hostname) return;
      linksForFollow.push({
        url: u.toString(),
        anchor: "canonical",
        score: 10,
      });
    } catch {
      // Ignore invalid canonical
    }
  });

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const anchor = $(el).text().trim();
    if (!href) return;

    const abs = absoluteUrl(href, baseUrl);
    if (!abs) return;

    try {
      const linkUrl = new URL(abs);
      if (linkUrl.hostname === baseUrl.hostname) {
        internalLinks++;
        const scored: CandidateLink = {
          url: linkUrl.toString(),
          anchor,
          score: scoreLink(linkUrl.pathname, anchor),
        };
        linksForFollow.push(scored);
      } else {
        externalLinks++;
      }
    } catch {
      // Skip invalid URLs
    }
  });

  const meta = {
    keywords: $('meta[name="keywords"]').attr("content"),
    author: $('meta[name="author"]').attr("content"),
    viewport: $('meta[name="viewport"]').attr("content"),
    robots: $('meta[name="robots"]').attr("content"),
  };

  const textPreview =
    limitedText.substring(0, 800) + (limitedText.length > 800 ? "..." : "");

  return {
    url,
    title,
    description,
    headings: headings.slice(0, 20),
    text: limitedText,
    images,
    links: {
      internal: internalLinks,
      external: externalLinks,
    },
    meta,
    hasSSL: url.startsWith("https://"),
    responseTime,
    wordCount,
    textPreview,
    linksForFollow: dedupeLinks(linksForFollow).sort(
      (a, b) => b.score - a.score
    ),
  };
}

async function fetchAndParse(targetUrl: string): Promise<ParsedPage> {
  const page = await fetchPage(targetUrl);
  return parsePage(page.html, page.finalUrl, page.responseTime);
}

async function safeFetch(targetUrl: string): Promise<ParsedPage | null> {
  try {
    return await fetchAndParse(targetUrl);
  } catch (error) {
    console.warn(
      `[webscraper] Skipping ${targetUrl}: ${
        error instanceof Error ? error.message : "okänt fel"
      }`
    );
    return null;
  }
}

/**
 * Scrape website content for audit analysis.
 * Tries to pick a meaningful entry page and pulls a few internal pages for context.
 */
export async function scrapeWebsite(url: string): Promise<WebsiteContent> {
  const normalizedUrl = normalizeInputUrl(url);
  if (!normalizedUrl) {
    throw new Error("URL måste anges");
  }

  const visited = new Set<string>();
  const enqueued = new Set<string>();
  const pages: ParsedPage[] = [];
  const candidateQueue: CandidateLink[] = [];

  const enqueueCandidates = (parsed: ParsedPage) => {
    for (const candidate of parsed.linksForFollow.slice(
      0,
      MAX_LINKS_TO_CONSIDER
    )) {
      if (visited.has(candidate.url) || enqueued.has(candidate.url)) continue;
      enqueued.add(candidate.url);
      candidateQueue.push(candidate);
    }
    candidateQueue.sort((a, b) => b.score - a.score);
  };

  const firstPage = await fetchAndParse(normalizedUrl);
  pages.push(firstPage);
  visited.add(firstPage.url);
  enqueueCandidates(firstPage);

  // Crawl top-scoring internal links until we reach the cap or run out of good candidates
  while (candidateQueue.length > 0 && pages.length < MAX_PAGES) {
    const candidate = candidateQueue.shift();
    if (!candidate || visited.has(candidate.url)) continue;

    // Mark the candidate URL as visited immediately to avoid refetching the original
    // URL even if it redirects to another location.
    visited.add(candidate.url);

    const parsed = await safeFetch(candidate.url);
    if (!parsed) continue;

    // Also mark the final resolved URL to prevent duplicates after redirects.
    visited.add(parsed.url);

    const isRichEnough = parsed.wordCount >= SECONDARY_MIN_WORDS;
    const isUsableFallback = parsed.wordCount >= MIN_AGGREGATION_WORDS;
    if (isRichEnough || isUsableFallback) {
      pages.push(parsed);
    }

    // Even thin nav pages can point to richer content, so we still enqueue their links
    enqueueCandidates(parsed);
  }

  // Choose the richest page as primary (prefers real content over hero-only landers)
  const rankedByRichness = [...pages].sort(
    (a, b) => pageRichnessScore(b) - pageRichnessScore(a)
  );
  const primaryPage =
    rankedByRichness.find((p) => p.wordCount >= PRIMARY_MIN_WORDS) ||
    rankedByRichness[0];

  // Aggregate content across pages
  const aggregationCandidates = pages.filter(
    (p) => p.wordCount >= MIN_AGGREGATION_WORDS
  );

  const pagesForAggregation: ParsedPage[] = [];
  const addForAggregation = (p: ParsedPage) => {
    if (pagesForAggregation.length >= MAX_PAGES) return;
    if (pagesForAggregation.some((x) => x.url === p.url)) return;
    pagesForAggregation.push(p);
  };

  // Always include primary page for consistency between metadata and content
  addForAggregation(primaryPage);

  const aggregationSource =
    aggregationCandidates.length > 0 ? aggregationCandidates : pages;
  for (const page of aggregationSource) {
    if (pagesForAggregation.length >= MAX_PAGES) break;
    addForAggregation(page);
  }

  const allHeadings = Array.from(
    new Set(pagesForAggregation.flatMap((p) => p.headings).filter(Boolean))
  ).slice(0, 20);

  const combinedWords = pagesForAggregation.flatMap((p) => p.text.split(" "));
  const aggregatedWordCount = pagesForAggregation.reduce(
    (sum, p) => sum + p.wordCount,
    0
  );
  const limitedWords = combinedWords.slice(0, AGGREGATE_WORD_LIMIT);
  const aggregatedText = limitedWords.join(" ");
  const textPreview =
    aggregatedText.substring(0, 800) +
    (aggregatedText.length > 800 ? "..." : "");

  const totalImages = pagesForAggregation.reduce((sum, p) => sum + p.images, 0);
  const totalInternal = pagesForAggregation.reduce(
    (sum, p) => sum + p.links.internal,
    0
  );
  const totalExternal = pagesForAggregation.reduce(
    (sum, p) => sum + p.links.external,
    0
  );

  return {
    url: primaryPage.url,
    title: primaryPage.title,
    description: primaryPage.description,
    headings: allHeadings,
    text: aggregatedText,
    images: totalImages,
    links: {
      internal: totalInternal,
      external: totalExternal,
    },
    meta: primaryPage.meta,
    hasSSL: primaryPage.hasSSL,
    responseTime: primaryPage.responseTime,
    wordCount: aggregatedWordCount,
    textPreview,
    sampledUrls: pagesForAggregation.map((p) => p.url),
  };
}

/**
 * Validate URL format
 * @param url - URL string to validate
 * @returns Normalized URL or throws error
 */
export function validateAndNormalizeUrl(url: string): string {
  if (!url || typeof url !== "string") {
    throw new Error("URL måste anges");
  }

  let normalized = url.trim();

  if (!normalized) {
    throw new Error("URL kan inte vara tom");
  }

  // Auto-add https:// if missing protocol
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = `https://${normalized}`;
  }

  // Validate URL format
  try {
    const urlObj = new URL(normalized);
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      throw new Error("Ogiltig URL - saknar domännamn");
    }
    return normalized;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Ogiltig URL-format. Ange t.ex. 'exempel.se' eller 'https://exempel.se'"
      );
    }
    throw error;
  }
}
