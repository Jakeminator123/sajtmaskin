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
});
