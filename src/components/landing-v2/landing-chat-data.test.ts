import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import {
  categories,
  creditPackageCopy,
  homepageCreditFaq,
  homepageHeroCopy,
  homepageTrustPoints,
} from "./landing-chat-data";

describe("creditPackageCopy", () => {
  it("covers every canonical credit package without listing prices", () => {
    for (const pkg of CREDIT_PACKAGES) {
      const copy = creditPackageCopy[pkg.id];
      expect(copy.description.length).toBeGreaterThan(0);
      expect(copy.cta).toContain(pkg.name);
      expect(JSON.stringify(copy)).not.toMatch(/\b(49|99|179)\b/);
      expect(copy.features.join(" ")).toMatch(/beror på vad du gör/i);
    }
  });
});

describe("homepage copy contracts", () => {
  it("keeps a single stable product H1 and outcome-first value proposition", () => {
    expect(homepageHeroCopy.h1).toBe("Skapa en professionell hemsida med AI");
    expect(homepageHeroCopy.valueProposition).toMatch(/Beskriv företaget/);
    expect(homepageHeroCopy.valueProposition).toMatch(/publicera/i);
    expect(homepageHeroCopy.valueProposition).toMatch(/domän/i);
    expect(homepageHeroCopy.h1).not.toMatch(/Frisörsajt|Bokningssajt|30 sekunder/);
  });

  it("leads with the freeform path and avoids developer jargon in method labels", () => {
    expect(categories[0]?.id).toBe("fritext");
    expect(JSON.stringify(categories)).not.toMatch(/v0-templates|runtime|prompt|agent/i);
  });

  it("explains credits without inventing a per-credit page or prompt count", () => {
    const faq = JSON.stringify(homepageCreditFaq);
    expect(faq).toContain("1 kr = 1 credit");
    expect(faq).toMatch(/kreditkort/i);
    expect(faq).toMatch(/tar slut/i);
    expect(faq).toMatch(/beror på vad du gör/i);
    expect(faq).not.toMatch(/räcker till \d+/);
    expect(faq).not.toMatch(/prompts? per/i);
  });

  it("uses honest trust copy instead of celebrity customer logos", () => {
    expect(homepageTrustPoints.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(homepageTrustPoints)).not.toMatch(
      /Netflix|Spotify|Nike|OpenAI|partner|rekommenderar/i,
    );
  });

  it("keeps the homepage source free of misleading partner marquees", () => {
    const chatArea = readFileSync(resolve(process.cwd(), "src/components/landing-v2/chat-area.tsx"), "utf8");
    const hero = readFileSync(resolve(process.cwd(), "src/components/landing-v2/landing-hero.tsx"), "utf8");
    expect(chatArea).not.toMatch(/trustLogos|Netflix|Spotify|Nike|OpenAI/);
    expect(hero).toContain("homepageHeroCopy.h1");
    expect(hero).toContain("data-homepage-cta=\"primary\"");
    expect(hero.match(/<h1/g)).toHaveLength(1);
  });
});
