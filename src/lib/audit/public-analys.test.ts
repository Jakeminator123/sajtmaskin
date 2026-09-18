import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPublicAnalysPrompt } from "@/lib/audit-prompts";
import type { WebsiteContent } from "@/types/audit";

const sample: WebsiteContent = {
  url: "https://nordlunden.se",
  title: "Nordlunden AB",
  description: "Lokalt hantverk",
  headings: ["Hem", "Tjänster"],
  text: "Vi bygger kök i Umeå",
  images: 2,
  links: { internal: 4, external: 1 },
  meta: { viewport: "width=device-width" },
  hasSSL: true,
  responseTime: 120,
  wordCount: 80,
  textPreview: "Vi bygger kök i Umeå",
};

describe("buildPublicAnalysPrompt", () => {
  it("keeps the product schema but steers away from pentest-first analysis", () => {
    const messages = buildPublicAnalysPrompt(sample, "https://nordlunden.se");
    const text = messages
      .flatMap((message) => message.content.map((part) => part.text))
      .join("\n");
    expect(text).toMatch(/inte pentester/);
    expect(text).toMatch(/Målgrupp/);
    expect(text).toMatch(/Hitta inte på CVE/);
    expect(text).toMatch(/AUDIT-LÄGE: AVANCERAD/);
  });
});

describe("/analys page metadata", () => {
  it("is a distinct noindex landning, not a rewrite to /audits", () => {
    const source = readFileSync(resolve("src/app/analys/page.tsx"), "utf8");
    expect(source).toMatch(/index:\s*false/);
    expect(source).toMatch(/canonical: "https:\/\/sajtmaskin.se\/analys"/);
    expect(source).not.toMatch(/SiteAuditSection/);
    expect(source).not.toMatch(/AuditModal/);
  });
});
