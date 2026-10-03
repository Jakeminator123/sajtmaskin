import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChatArea mobile document flow", () => {
  it("keeps the scrolling viewport in block flow so expanded templates reserve height", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/chat-area.tsx"),
      "utf8",
    );
    const scrollContainer = source.match(/className="([^"]+)"\s*\n\s*data-scroll-container/);

    expect(scrollContainer).not.toBeNull();
    const classes = scrollContainer?.[1].split(/\s+/) ?? [];
    expect(classes).toContain("overflow-y-auto");
    expect(classes).toContain("overflow-x-clip");
    expect(classes).not.toContain("flex");
    expect(classes).not.toContain("flex-col");
    expect(source).toContain("overflow-x-clip overflow-y-hidden");
    expect(source).not.toMatch(/<main className="[^"]*overflow-hidden"/);
  });

  it("shows outcomes and price before integrations, without a brand-logo marquee", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/chat-area.tsx"),
      "utf8",
    );
    const trustAt = source.indexOf("<LandingTrustStrip");
    const examplesAt = source.indexOf("<LandingExamples");
    const howAt = source.indexOf("id=\"hur-det-fungerar\"");
    const priceAt = source.indexOf("id=\"priser\"");
    const integrationsAt = source.indexOf("item={item}");
    expect(trustAt).toBeGreaterThan(-1);
    expect(examplesAt).toBeGreaterThan(trustAt);
    expect(howAt).toBeGreaterThan(examplesAt);
    expect(priceAt).toBeGreaterThan(howAt);
    expect(integrationsAt).toBeGreaterThan(priceAt);
    expect(source).toContain("<LandingPricingExplainer");
    expect(source).not.toMatch(/trustLogos|animate-marquee/);
    expect(source).toContain("data-homepage-cta=\"bottom\"");
    expect(source).toContain("Se exempel");
  });
});
