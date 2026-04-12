/**
 * Company Intelligence — orchestrates multi-source data collection
 * for a richer understanding of the customer's business before generation.
 *
 * Sources: multi-page web scrape, Brave web search (social + news),
 * allabolag.se company registry.
 */

import type { WebsiteContent } from "@/types/audit";
import { scrapeWebsite } from "@/lib/webscraper";
import { braveWebSearch, type BraveSearchResult } from "@/lib/brave-search";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface CompanyLookupResult {
  found: boolean;
  companyName?: string;
  orgNr?: string;
  companyType?: string;
  city?: string;
  address?: string;
  industries?: string[];
  revenueKsek?: number;
  employees?: number;
  ceo?: string;
  homepage?: string;
  purpose?: string;
  source?: "allabolag" | "ai_search" | "none";
}

export interface SocialSnippet {
  platform: string;
  snippet: string;
  url: string;
}

export interface NewsSnippet {
  title: string;
  snippet: string;
  url: string;
}

export interface CompanyIntelResult {
  scrapedContent: {
    url: string;
    title: string;
    description: string;
    headings: string[];
    text: string;
    images: number;
    meta: Record<string, string | undefined>;
    wordCount: number;
    sampledUrls?: string[];
  } | null;
  socialSnippets: SocialSnippet[];
  newsSnippets: NewsSnippet[];
  registryInfo: CompanyLookupResult | null;
  rawTextCorpus: string;
  documentTexts?: string[];
}

/* ------------------------------------------------------------------ */
/*  Allabolag lookup (self-contained, mirrors wizard/company-lookup)    */
/* ------------------------------------------------------------------ */

const ALLABOLAG_BASE = "https://www.allabolag.se";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

function safeInt(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function fmtOrgNr(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 10
    ? `${digits.slice(0, 6)}-${digits.slice(6)}`
    : raw;
}

async function parseAllabolagPage(
  html: string,
  companyName: string,
): Promise<CompanyLookupResult> {
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  const nextDataScript = $("#__NEXT_DATA__").html();
  if (!nextDataScript) throw new Error("No __NEXT_DATA__ found");

  const nextData = JSON.parse(nextDataScript);
  const c = nextData?.props?.pageProps?.company;
  if (!c) throw new Error("No company object in __NEXT_DATA__");

  const addr = c.visitorAddress || {};
  const cp = c.contactPerson || {};

  return {
    found: true,
    companyName: c.name || companyName,
    orgNr: fmtOrgNr(c.orgnr || ""),
    companyType: c.companyType?.name,
    city: addr.postPlace || undefined,
    address: [addr.addressLine, addr.zipCode, addr.postPlace]
      .filter(Boolean)
      .join(", "),
    industries: (c.industries || [])
      .map((i: { name?: string }) => i.name)
      .filter(Boolean),
    revenueKsek: safeInt(c.revenue),
    employees: safeInt(c.employees),
    ceo: cp.name
      ? `${cp.name}${cp.role ? ` (${cp.role})` : ""}`
      : undefined,
    homepage: (c.homePage || "").trim() || undefined,
    purpose: (c.purpose || "").slice(0, 300) || undefined,
    source: "allabolag",
  };
}

async function lookupViaCheerio(
  companyName: string,
): Promise<CompanyLookupResult> {
  const searchUrl = `${ALLABOLAG_BASE}/bransch-sok?q=${encodeURIComponent(companyName)}`;
  const searchRes = await fetch(searchUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) throw new Error(`Search returned ${searchRes.status}`);

  const cheerio = await import("cheerio");
  const searchHtml = await searchRes.text();
  const $search = cheerio.load(searchHtml);

  const firstLink = $search('a[href*="/foretag/"]')
    .toArray()
    .map((el) => $search(el).attr("href") || "")
    .find((href) => href.split("/").length > 4);

  if (!firstLink) throw new Error("No company link found");

  const companyUrl = firstLink.startsWith("http")
    ? firstLink
    : `${ALLABOLAG_BASE}${firstLink}`;
  const companyRes = await fetch(companyUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!companyRes.ok)
    throw new Error(`Company page returned ${companyRes.status}`);

  return parseAllabolagPage(await companyRes.text(), companyName);
}

async function lookupViaBraveSearch(
  companyName: string,
): Promise<CompanyLookupResult> {
  const results = await braveWebSearch(
    `företag ${companyName} allabolag`,
    5,
  );
  if (results.length === 0) throw new Error("Brave returned no results");

  const allabolagUrl = results
    .map((r) => r.url)
    .find((u) => u.includes("allabolag.se/foretag/"));

  if (!allabolagUrl)
    throw new Error("No allabolag company URL in Brave results");

  const companyRes = await fetch(allabolagUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!companyRes.ok)
    throw new Error(`Company page returned ${companyRes.status}`);

  return parseAllabolagPage(await companyRes.text(), companyName);
}

function namesResemble(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s*(ab|hb|kb|ek\.?\s*för\.?|handelsbolag|aktiebolag)\s*/gi, "")
      .replace(/[^a-zåäö0-9]/g, "")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

async function lookupAllabolag(
  companyName: string,
): Promise<CompanyLookupResult> {
  try {
    const result = await lookupViaCheerio(companyName);
    if (result.found && result.companyName && !namesResemble(result.companyName, companyName)) {
      return { found: false, source: "none" };
    }
    return result;
  } catch {
    try {
      const result = await lookupViaBraveSearch(companyName);
      if (result.found && result.companyName && !namesResemble(result.companyName, companyName)) {
        return { found: false, source: "none" };
      }
      return result;
    } catch {
      return { found: false, source: "none" };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Social & news search via Brave                                     */
/* ------------------------------------------------------------------ */

const SOCIAL_DOMAINS = [
  "linkedin.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
] as const;

function categorizeBraveResults(results: BraveSearchResult[]): {
  social: SocialSnippet[];
  news: NewsSnippet[];
} {
  const social: SocialSnippet[] = [];
  const news: NewsSnippet[] = [];

  for (const r of results) {
    const matchedDomain = SOCIAL_DOMAINS.find((d) =>
      r.url.includes(d),
    );
    if (matchedDomain) {
      social.push({
        platform: matchedDomain.replace(".com", ""),
        snippet: r.description,
        url: r.url,
      });
    } else {
      news.push({
        title: r.title,
        snippet: r.description,
        url: r.url,
      });
    }
  }

  return { social, news };
}

/* ------------------------------------------------------------------ */
/*  Main orchestrator                                                  */
/* ------------------------------------------------------------------ */

function extractCompanyNameFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname
      .replace(/^www\./, "")
      .split(".")[0]
      .replace(/[-_]/g, " ");
  } catch {
    return "";
  }
}

function websiteContentToScraped(wc: WebsiteContent): CompanyIntelResult["scrapedContent"] {
  return {
    url: wc.url,
    title: wc.title,
    description: wc.description,
    headings: wc.headings,
    text: wc.text,
    images: wc.images,
    meta: {
      keywords: wc.meta.keywords,
      author: wc.meta.author,
    },
    wordCount: wc.wordCount,
    sampledUrls: wc.sampledUrls,
  };
}

function buildRawTextCorpus(
  scraped: CompanyIntelResult["scrapedContent"],
  social: SocialSnippet[],
  news: NewsSnippet[],
  registry: CompanyLookupResult | null,
  documentTexts?: string[],
): string {
  const parts: string[] = [];

  if (scraped) {
    parts.push(
      `[WEBSITE] ${scraped.title}\n${scraped.description}\n${scraped.text.slice(0, 5000)}`,
    );
  }

  if (registry?.found) {
    const regLines = [
      `[COMPANY REGISTRY]`,
      registry.companyName && `Namn: ${registry.companyName}`,
      registry.orgNr && `Org.nr: ${registry.orgNr}`,
      registry.companyType && `Bolagsform: ${registry.companyType}`,
      registry.city && `Ort: ${registry.city}`,
      registry.address && `Adress: ${registry.address}`,
      registry.industries?.length && `Branscher: ${registry.industries.join(", ")}`,
      registry.employees != null && `Anställda: ${registry.employees}`,
      registry.revenueKsek != null && `Omsättning: ${registry.revenueKsek} KSEK`,
      registry.ceo && `VD: ${registry.ceo}`,
      registry.purpose && `Ändamål: ${registry.purpose}`,
    ]
      .filter(Boolean)
      .join("\n");
    parts.push(regLines);
  }

  for (const s of social) {
    parts.push(`[SOCIAL:${s.platform.toUpperCase()}] ${s.snippet} (${s.url})`);
  }

  for (const n of news) {
    parts.push(`[NEWS] ${n.title}: ${n.snippet} (${n.url})`);
  }

  if (documentTexts) {
    for (const dt of documentTexts) {
      parts.push(`[DOCUMENT]\n${dt.slice(0, 5000)}`);
    }
  }

  return parts.join("\n\n");
}

export interface CollectCompanyIntelOptions {
  url: string;
  companyName?: string;
  documentTexts?: string[];
}

/**
 * Extracts a likely company name from a page title by stripping common
 * suffixes like " | Startsida", " - Hem", " – Välkommen" etc.
 */
function extractCompanyNameFromTitle(title: string): string {
  if (!title) return "";
  let clean = title
    .replace(/\s*[|–—-]\s*(Startsida|Hem|Välkommen|Home|Start|Framsida).*$/i, "")
    .replace(/\s*[|–—-]\s*$/, "")
    .trim();
  if (clean.length > 60) clean = clean.slice(0, 60);
  return clean;
}

export async function collectCompanyIntel(
  opts: CollectCompanyIntelOptions,
): Promise<CompanyIntelResult> {
  const { url, documentTexts } = opts;

  const scrapeResult = await scrapeWebsite(url).catch(() => null);
  const scraped = scrapeResult ? websiteContentToScraped(scrapeResult) : null;

  const companyName =
    opts.companyName ||
    (scraped?.title ? extractCompanyNameFromTitle(scraped.title) : "") ||
    extractCompanyNameFromUrl(url);

  const [braveResults, registryResult] =
    await Promise.allSettled([
      braveWebSearch(
        `"${companyName}" site:linkedin.com OR site:instagram.com OR nyheter`,
        10,
      ),
      companyName ? lookupAllabolag(companyName) : Promise.resolve(null),
    ]);

  const braveHits =
    braveResults.status === "fulfilled" ? braveResults.value : [];
  const { social, news } = categorizeBraveResults(braveHits);

  const registry =
    registryResult.status === "fulfilled"
      ? registryResult.value
      : null;

  const rawTextCorpus = buildRawTextCorpus(
    scraped,
    social,
    news,
    registry,
    documentTexts,
  );

  return {
    scrapedContent: scraped,
    socialSnippets: social,
    newsSnippets: news,
    registryInfo: registry,
    rawTextCorpus,
    documentTexts,
  };
}
