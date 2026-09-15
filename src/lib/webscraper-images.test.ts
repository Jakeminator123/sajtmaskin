import { describe, expect, it } from "vitest";
import { collectSiteImagesFromHtml } from "./webscraper";

describe("collectSiteImagesFromHtml", () => {
  it("collects og:image, a logo candidate and content images with extensions", async () => {
    const images = await collectSiteImagesFromHtml(
      `
      <html>
        <head>
          <meta property="og:image" content="/og.jpg" />
        </head>
        <body>
          <img src="/logo.png" alt="Företagslogga" class="site-logo" />
          <img src="/hero.jpg" alt="Showroom" />
          <img src="/project.webp" alt="Projekt" />
          <img src="/skip.svg" alt="Ikon" />
          <img src="data:image/png;base64,xx" alt="inline" />
        </body>
      </html>
      `,
      "https://granit.se",
    );

    expect(images.map((image) => image.kind)).toEqual(["og", "logo", "content", "content"]);
    expect(images[0]?.url).toBe("https://granit.se/og.jpg");
    expect(images[1]?.url).toBe("https://granit.se/logo.png");
    expect(images.some((image) => image.url.endsWith(".svg"))).toBe(false);
  });
});
