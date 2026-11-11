import { describe, expect, it } from "vitest";
import { buildAuditPrompt, buildPublicAnalysPrompt } from "@/lib/audit-prompts";
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
  sampledUrls: ["https://nordlunden.se", "https://nordlunden.se/tjanster"],
};

function promptText(
  ...args: Parameters<typeof buildAuditPrompt>
): string {
  return buildAuditPrompt(...args)
    .flatMap((message) => message.content.map((part) => part.text))
    .join("\n");
}

describe("buildAuditPrompt tier split", () => {
  it("tells Vanlig not to generate Advanced-only fields", () => {
    const text = promptText(sample, "https://nordlunden.se", {
      auditMode: "basic",
      schemaKind: "core",
      maxPages: 2,
    });
    expect(text).toMatch(/Generera INTE business_profile/);
    expect(text).toMatch(/6–8 användbara förbättringar/);
    expect(text).toMatch(/ANALYSERADE SIDOR \(upp till 2\)/);
    expect(text).not.toMatch(/"business_profile":/);
    expect(text).not.toMatch(/"market_context":/);
    expect(text).not.toMatch(/"customer_segments":/);
    expect(text).not.toMatch(/"competitive_landscape":/);
    expect(text).not.toMatch(/"competitor_insights":/);
    expect(text).not.toMatch(/Fyll business_profile/);
    expect(text).not.toMatch(/minst 12/);
  });

  it("defaults an advanced-only options object to the full schema", () => {
    const text = promptText(sample, "https://nordlunden.se", { auditMode: "advanced" });
    expect(text).toMatch(/"business_profile":/);
    expect(text).toMatch(/minst 12/);
    expect(text).not.toMatch(/Generera INTE business_profile/);
  });

  it("asks Avancerad for market fields and at least 12 improvements", () => {
    const text = promptText(sample, "https://nordlunden.se", {
      auditMode: "advanced",
      schemaKind: "full",
      maxPages: 4,
    });
    expect(text).toMatch(/Fyll business_profile, market_context/);
    expect(text).toMatch(/minst 12 prioriterade förbättringar/);
    expect(text).toMatch(/ANALYSERADE SIDOR \(upp till 4\)/);
    expect(text).toMatch(/web research/i);
  });

  it("keeps the public lead magnet on the full schema without paid Vanlig stripping", () => {
    const text = buildPublicAnalysPrompt(sample, "https://nordlunden.se")
      .flatMap((message) => message.content.map((part) => part.text))
      .join("\n");
    expect(text).toMatch(/AUDIT-LÄGE: VANLIG/);
    expect(text).toMatch(/ANALYSERADE SIDOR \(upp till 4\)/);
    expect(text).toMatch(/business_profile/);
    expect(text).not.toMatch(/Generera INTE business_profile/);
  });

  it("grounds Avancerad in the collected text beyond the 800-character preview", () => {
    const laterPageEvidence = "UNIKT_SIDTVÅ_BEVISET: Vi erbjuder även konferensbokning.";
    const collectedText = `${"Inledande hotellinformation. ".repeat(80)}${laterPageEvidence}`;
    const multiPageContent = {
      ...sample,
      text: collectedText,
      textPreview: `${collectedText.slice(0, 800)}...`,
      wordCount: 2189,
    };

    for (const options of ["advanced", { auditMode: "advanced" }] as const) {
      const text = promptText(multiPageContent, sample.url, options);
      expect(text).toContain(collectedText);
      expect(text).toContain(laterPageEvidence);
      expect(text).toContain("TEXTINNEHÅLL (insamlat utdrag, max ~2000 ord):");
      expect(text).not.toContain("TEXTINNEHÅLL (första ~800 tecken):");
    }

    const basic = promptText(multiPageContent, sample.url, "basic");
    const publicPrompt = buildPublicAnalysPrompt(multiPageContent, sample.url)
      .flatMap((message) => message.content.map((part) => part.text))
      .join("\n");
    for (const text of [basic, publicPrompt]) {
      expect(text).toContain(multiPageContent.textPreview);
      expect(text).toContain("TEXTINNEHÅLL (första ~800 tecken):");
      expect(text).not.toContain(laterPageEvidence);
      expect(text).not.toContain(collectedText);
      expect(text).not.toContain("max ~2000 ord");
    }
  });

  it("keeps public and paid Vanlig prompts identical when only collected full text changes", () => {
    const changedText = { ...sample, text: "EXTRA_TEXTEVIDENS_SOM_BARA_ADVANCED_SKA_SE" };
    expect(buildAuditPrompt(changedText, sample.url, "basic"))
      .toEqual(buildAuditPrompt(sample, sample.url, "basic"));
    expect(buildPublicAnalysPrompt(changedText, sample.url))
      .toEqual(buildPublicAnalysPrompt(sample, sample.url));
    expect(buildAuditPrompt(changedText, sample.url, "advanced")[0])
      .toEqual(buildAuditPrompt(sample, sample.url, "advanced")[0]);
  });

  it.each(["", "   "])("falls back to the existing preview for empty Avancerad full text: %j", (text) => {
    const result = promptText({ ...sample, text }, sample.url, "advanced");
    expect(result).toContain(`TEXTINNEHÅLL (första ~800 tecken):\n${sample.textPreview}`);
    expect(result).not.toContain("TEXTINNEHÅLL (insamlat utdrag");
  });
});
