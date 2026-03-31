import { describe, expect, it } from "vitest";
import {
  readHeroContentDraft,
  updateHeroContentDraft,
} from "./hero-editor";

describe("hero-editor", () => {
  it("reads hero title, intro, and CTA text from a page file", () => {
    const content = [
      "export default function Page() {",
      "  return (",
      "    <main>",
      "      <h1>Grow faster</h1>",
      "      <p>Launch your site in minutes.</p>",
      '      <a href="/book-demo">Book demo</a>',
      "    </main>",
      "  );",
      "}",
    ].join("\n");

    expect(readHeroContentDraft("src/app/page.tsx", content)).toEqual({
      title: "Grow faster",
      intro: "Launch your site in minutes.",
      ctaLabel: "Book demo",
    });
  });

  it("returns null for non-page files", () => {
    expect(readHeroContentDraft("src/app/layout.tsx", "<h1>Nope</h1>")).toBeNull();
  });

  it("updates hero title, intro, and CTA text", () => {
    const content = [
      "export default function Page() {",
      "  return (",
      "    <main>",
      "      <h1>Grow faster</h1>",
      "      <p>Launch your site in minutes.</p>",
      '      <a href="/book-demo">Book demo</a>',
      "    </main>",
      "  );",
      "}",
    ].join("\n");

    const updated = updateHeroContentDraft(
      content,
      {
        title: "Grow faster",
        intro: "Launch your site in minutes.",
        ctaLabel: "Book demo",
      },
      {
        title: "Scale with confidence",
        intro: "Turn visitors into customers with a sharper launch page.",
        ctaLabel: "Request a demo",
      },
    );

    expect(updated).toContain("<h1>Scale with confidence</h1>");
    expect(updated).toContain("<p>Turn visitors into customers with a sharper launch page.</p>");
    expect(updated).toContain(">Request a demo</a>");
  });
});
