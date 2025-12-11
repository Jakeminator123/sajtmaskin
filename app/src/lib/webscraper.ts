/**
 * Website scraper for audit feature
 * Extracts multi-page content so the audit is not limited to a weak landing page.
 */

import type { WebsiteContent } from "@/types/audit";

// Crawl settings
const MAX_PAGES = 3; // root + up to two strong internal pages
const PRIMARY_MIN_WORDS = 120; // minimum words to accept a page as primary
const SECONDARY_MIN_WORDS = 60; // minimum words to include a secondary page
const MAX_LINKS_TO_CONSIDER = 25; // cap to avoid crawling too broadly

type CandidateLink = {
  url: string;
  anchor?: string;
  score: number;
};

type ParsedPage = WebsiteContent & {
  linksForFollow: CandidateLink[];
};

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
  const pages: ParsedPage[] = [];

  const firstPage = await fetchAndParse(normalizedUrl);
  pages.push(firstPage);
  visited.add(firstPage.url);

  let primaryPage = firstPage;

  // If the first page is thin, try to find a better primary candidate
  if (primaryPage.wordCount < PRIMARY_MIN_WORDS) {
    for (const candidate of primaryPage.linksForFollow.slice(
      0,
      MAX_LINKS_TO_CONSIDER
    )) {
      if (visited.has(candidate.url)) continue;
      const parsed = await safeFetch(candidate.url);
      if (!parsed) continue;
      pages.push(parsed);
      visited.add(parsed.url);
      if (parsed.wordCount >= PRIMARY_MIN_WORDS) {
        primaryPage = parsed;
        break;
      }
    }
  }

  // Add a couple more rich pages for breadth
  for (const candidate of primaryPage.linksForFollow.slice(
    0,
    MAX_LINKS_TO_CONSIDER
  )) {
    if (pages.length >= MAX_PAGES) break;
    if (visited.has(candidate.url)) continue;

    const parsed = await safeFetch(candidate.url);
    if (!parsed) continue;
    if (parsed.wordCount < SECONDARY_MIN_WORDS) continue;

    pages.push(parsed);
    visited.add(parsed.url);
  }

  // Aggregate content across pages
  const allHeadings = Array.from(
    new Set(pages.flatMap((p) => p.headings).filter(Boolean))
  ).slice(0, 20);

  const combinedWords = pages.flatMap((p) => p.text.split(" "));
  const aggregatedWordCount = combinedWords.length;
  const limitedWords = combinedWords.slice(0, 1500);
  const aggregatedText = limitedWords.join(" ");
  const textPreview =
    aggregatedText.substring(0, 800) +
    (aggregatedText.length > 800 ? "..." : "");

  const totalImages = pages.reduce((sum, p) => sum + p.images, 0);
  const totalInternal = pages.reduce((sum, p) => sum + p.links.internal, 0);
  const totalExternal = pages.reduce((sum, p) => sum + p.links.external, 0);

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
    sampledUrls: pages.map((p) => p.url),
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
