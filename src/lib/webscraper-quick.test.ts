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
