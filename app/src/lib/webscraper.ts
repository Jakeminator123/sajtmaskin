/**
 * Website scraper for audit feature
 * Extracts content from websites for AI analysis
 */

import type { WebsiteContent } from "@/types/audit";

// Use dynamic import for cheerio to avoid build issues
async function getCheerio() {
  const cheerio = await import("cheerio");
  return cheerio;
}

/**
 * Scrape website content for audit analysis
 * @param url - The URL to scrape
 * @returns WebsiteContent object with extracted data
 */
export async function scrapeWebsite(url: string): Promise<WebsiteContent> {
  // Normalize URL
  let normalizedUrl = url.trim();
  if (
    !normalizedUrl.startsWith("http://") &&
    !normalizedUrl.startsWith("https://")
  ) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const startTime = Date.now();

  try {
    // Fetch the website with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    let response: Response;
    try {
      response = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
        },
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("Timeout: Hemsidan svarade inte inom 15 sekunder");
      }
      throw fetchError;
    }

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP-fel: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const responseTime = Date.now() - startTime;

    // Parse HTML with cheerio
    const cheerio = await getCheerio();
    const $ = cheerio.load(html);

    // Remove script and style tags to get clean text
    $("script, style, noscript").remove();

    // Extract title
    const title = $("title").text().trim() || "Ingen titel";

    // Extract meta description
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";

    // Extract headings (limit to first 15 for analysis)
    const headings: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text && headings.length < 15) headings.push(text);
    });

    // Extract body text
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    // Limit text to ~1500 words to save tokens but provide good context
    const words = bodyText.split(" ");
    const wordCount = words.length;
    const limitedText = words.slice(0, 1500).join(" ");

    // Count images
    const images = $("img").length;

    // Count links
    const urlObj = new URL(normalizedUrl);
    const baseHost = urlObj.hostname;
    let internalLinks = 0;
    let externalLinks = 0;

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      try {
        // Handle relative URLs
        if (href.startsWith("/") || href.startsWith("#")) {
          internalLinks++;
        } else if (href.startsWith("http")) {
          const linkUrl = new URL(href);
          if (linkUrl.hostname === baseHost) {
            internalLinks++;
          } else {
            externalLinks++;
          }
        }
      } catch {
        // Invalid URL, skip
      }
    });

    // Extract meta tags
    const meta = {
      keywords: $('meta[name="keywords"]').attr("content"),
      author: $('meta[name="author"]').attr("content"),
      viewport: $('meta[name="viewport"]').attr("content"),
      robots: $('meta[name="robots"]').attr("content"),
    };

    // Check if SSL
    const hasSSL = normalizedUrl.startsWith("https://");

    // Create text preview
    const textPreview =
      limitedText.substring(0, 800) + (limitedText.length > 800 ? "..." : "");

    return {
      url: normalizedUrl,
      title,
      description,
      headings: headings.slice(0, 20), // Limit to first 20 headings
      text: limitedText,
      images,
      links: {
        internal: internalLinks,
        external: externalLinks,
      },
      meta,
      hasSSL,
      responseTime,
      wordCount,
      textPreview,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Timeout: Hemsidan svarade inte inom 15 sekunder");
      }
      throw new Error(`Kunde inte hämta hemsidan: ${error.message}`);
    }
    throw new Error("Ett okänt fel uppstod vid hämtning av hemsidan");
  }
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
