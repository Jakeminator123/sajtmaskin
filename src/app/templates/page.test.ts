import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync(resolve(process.cwd(), "src/app/templates/page.tsx"), "utf8");

describe("templates marketing page", () => {
  it("uses a Swedish H1 and higher-contrast hero copy", () => {
    expect(PAGE).toContain("Hemsidemallar");
    expect(PAGE).not.toMatch(/<h1[^>]*>\s*Templates\s*<\/h1>/);
    expect(PAGE).toContain("text-foreground/80");
  });

  it("explains how to choose a template in Swedish text that crawlers can read", () => {
    expect(PAGE).toContain("Färdiga hemsidemallar för småföretag");
    expect(PAGE).toContain("Så väljer du hemsidemall");
    expect(PAGE).toContain("Byt exemplen innan du publicerar");
  });
});
