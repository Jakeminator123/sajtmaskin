import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("root layout noscript fallback", () => {
  it("does not inject a document H1 that would steal landing-page headings", () => {
    const noscript = LAYOUT.match(/<noscript>[\s\S]*?<\/noscript>/);
    expect(noscript?.[0]).toBeTruthy();
    expect(noscript?.[0]).not.toMatch(/<h1\b/);
    expect(noscript?.[0]).toMatch(/<strong>Sajtmaskin<\/strong>/);
  });
});
