import { beforeEach, describe, expect, it, vi } from "vitest";

const guardedFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ssrf-guard")>(),
  safeFetch: guardedFetch,
}));

const { quickScrapeWebsite, scrapeWebsite } = await import("./webscraper");

function htmlResponse(html: string, url = "https://example.com/"): Response {
  const response = new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("quickScrapeWebsite content selection", () => {
  beforeEach(() => {
    guardedFetch.mockReset();
  });

  const wpJsonResponse = (url: string) => {
    const response = new Response(JSON.stringify({
      content: { rendered: `<p>${"FOREIGN99 ".repeat(40)}</p>` },
    }), { headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };

  it.each([
    '<link rel="alternate" type="application/json" href="https://foreign.example/wp-json/wp/v2/posts/1">',
    '<link rel="shortlink" href="https://foreign.example/?p=1">',
    '<link rel="canonical" href="https://foreign.example/article">',
  ])("does not use a foreign WordPress content hint: %s", async (hint) => {
    guardedFetch.mockImplementation(async (target: string) => {
      if (target === "https://example.com/") {
        return htmlResponse(`<html><head><meta name="generator" content="WordPress">${hint}</head><body>ORIGINAL</body></html>`);
      }
      if (target.includes("wp-json")) return wpJsonResponse(target);
      return new Response("<urlset/>", { headers: { "content-type": "application/xml" } });
    });

    const result = await scrapeWebsite("https://example.com/", { maxPages: 1 });

    expect(result.url).toBe("https://example.com/");
    expect(result.text).toContain("ORIGINAL");
    expect(result.text).not.toContain("FOREIGN99");
    expect(guardedFetch.mock.calls.every(([target]) => new URL(target).origin === "https://example.com")).toBe(true);
  });

  it.each([
    ["https://example.com/wp-json/wp/v2/posts/1", true],
    ["https://foreign.example/wp-json/wp/v2/posts/1", false],
  ])("binds WordPress fallback response origin after redirects: %s", async (finalUrl, accepted) => {
    guardedFetch.mockImplementation(async (target: string) => {
      if (target === "https://example.com/") {
        return htmlResponse('<html><head><link rel="alternate" type="application/json" href="/wp-json/wp/v2/posts/1"></head><body>ORIGINAL</body></html>');
      }
      if (target.includes("wp-json")) return wpJsonResponse(finalUrl);
      return new Response("<urlset/>", { headers: { "content-type": "application/xml" } });
    });

    const result = await scrapeWebsite("https://example.com/", { maxPages: 1 });

    expect(result.text.includes("FOREIGN99")).toBe(accepted);
    expect(result.url).toBe("https://example.com/");
  });

  it("keeps default scrape logging and lets a per-call logger silence the same thin-page path", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const thinHtml = "<html><head><title>Thin</title></head><body>Hi</body></html>";
    const scrapeOnce = () => {
      guardedFetch.mockImplementation(async (url: string) => {
        if (String(url).includes("sitemap")) return new Response("<urlset/>", { headers: { "content-type": "application/xml" } });
        return htmlResponse(thinHtml);
      });
    };
    try {
      scrapeOnce();
      const normal = await scrapeWebsite("https://example.com", { maxPages: 1 });
      const normalTargets = guardedFetch.mock.calls.map(([url]) => url);
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("Very little text"));
      consoleWarn.mockClear();
      consoleInfo.mockClear();
      guardedFetch.mockClear();
      scrapeOnce();
      const logger = { info: vi.fn(), warn: vi.fn() };
      const silent = await scrapeWebsite("https://example.com", { maxPages: 1, logger });
      expect(silent).toEqual({ ...normal, responseTime: expect.any(Number) });
      expect(guardedFetch.mock.calls.map(([url]) => url)).toEqual(normalTargets);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Very little text"));
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
      consoleInfo.mockRestore();
    }
  });

  it("normalizes uppercase schemes and whitespace while preserving path and query", async () => {
    guardedFetch.mockResolvedValueOnce(htmlResponse("<html><body>Hotel rooms</body></html>"));

    await quickScrapeWebsite(" HTTPS://Workershotel.se/Rooms/?ref=partner&b=2&a=1#details ");

    expect(guardedFetch).toHaveBeenCalledWith(
      "https://workershotel.se/Rooms/?ref=partner&b=2&a=1#details",
      expect.any(Object),
    );
  });

  it.each(["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "https://user:secret@example.com"])(
    "rejects unsafe URL forms before network work: %s",
    async (input) => {
      await expect(quickScrapeWebsite(input)).rejects.toThrow();
      expect(guardedFetch).not.toHaveBeenCalled();
    },
  );

  it.each(["http://127.0.0.1", "http://localhost", "http://169.254.169.254/latest/meta-data/"])(
    "still rejects private destinations through the SSRF guard: %s",
    async (input) => {
      await expect(quickScrapeWebsite(input)).rejects.toThrow(/private|internal|Forbidden/i);
      expect(guardedFetch).not.toHaveBeenCalled();
    },
  );

  it("falls back to body content when the first main container is empty", async () => {
    guardedFetch.mockResolvedValueOnce(
      htmlResponse(`
        <html>
          <head><title>Thin main</title></head>
          <body>
            <main></main>
            <section>Alpha beta gamma delta epsilon zeta eta theta iota kappa.</section>
          </body>
        </html>
      `),
    );

    const result = await quickScrapeWebsite("https://example.com");

    expect(result.wordCount).toBe(10);
    expect(result.textSummary).toContain("Alpha beta gamma");
  });

  it("keeps a substantive main container instead of unrelated body chrome", async () => {
    guardedFetch.mockResolvedValueOnce(
      htmlResponse(`
        <html>
          <head><title>Normal main</title></head>
          <body>
            <nav>Outside navigation words must not be counted.</nav>
            <main>
              Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu
              nu xi omicron pi rho sigma tau upsilon phi chi psi omega.
            </main>
            <footer>Outside footer words must not be counted either.</footer>
          </body>
        </html>
      `),
    );

    const result = await quickScrapeWebsite("https://example.com");

    expect(result.wordCount).toBe(24);
    expect(result.textSummary).not.toContain("Outside");
  });
});

describe("scrapeWebsite redirect base", () => {
  beforeEach(() => {
    guardedFetch.mockReset();
  });

  it("resolves relative links against the validated final redirect URL", async () => {
    const richCopy = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" ");
    guardedFetch
      .mockResolvedValueOnce(
        htmlResponse(
          `<html><body><main>${richCopy}<a href="contact">Contact</a></main></body></html>`,
          "https://www.example.com/en/",
        ),
      )
      .mockResolvedValueOnce(
        htmlResponse(
          `<html><body><main>${richCopy}</main></body></html>`,
          "https://www.example.com/en/contact",
        ),
      );

    const result = await scrapeWebsite("https://example.com", { maxPages: 2 });

    expect(guardedFetch).toHaveBeenNthCalledWith(
      2,
      "https://www.example.com/en/contact",
      expect.any(Object),
    );
    expect(result.url).toBe("https://www.example.com/en/");
    expect(result.sampledUrls).toContain("https://www.example.com/en/contact");
  });
});
