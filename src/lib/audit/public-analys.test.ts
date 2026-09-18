import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIT_MODEL_CANDIDATES, PUBLIC_AUDIT_MODEL_CANDIDATES } from "@/app/api/audit/modules/schema";
import { buildPublicAnalysPrompt } from "@/lib/audit-prompts";
import {
  AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL,
  AUDIT_STRUCTURED_DEFAULT_MODEL,
} from "@/lib/gen/defaults";
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
    expect(text).toMatch(/AUDIT-LÄGE: VANLIG/);
  });

  it("kräver varför + hur per åtgärd och förbjuder påhittade siffror", () => {
    const messages = buildPublicAnalysPrompt(sample, "https://nordlunden.se");
    const text = messages
      .flatMap((message) => message.content.map((part) => part.text))
      .join("\n");

    expect(text).toMatch(/MÅSTE ha både "why".*"how"/s);
    expect(text).toMatch(/quick_wins/);
    expect(text).toMatch(/Hitta INTE på procentsatser/);
    expect(text).toMatch(/Svenska genomgående/);
  });
});

describe("audit model split", () => {
  it("keeps Sol as the product Avancerad default and Luna on the public lead magnet", () => {
    expect(AUDIT_STRUCTURED_DEFAULT_MODEL).toBe("openai/gpt-5.6-sol");
    expect(AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL).toBe("openai/gpt-5.6-luna");
    expect(AUDIT_MODEL_CANDIDATES[0]).toBe("openai/gpt-5.6-sol");
    expect(PUBLIC_AUDIT_MODEL_CANDIDATES[0]).toBe("openai/gpt-5.6-luna");
    expect(PUBLIC_AUDIT_MODEL_CANDIDATES).not.toContain("openai/gpt-5.6-sol");
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

describe("public /analys client surface", () => {
  it("konsumerar den publika projektionen, inte hela AuditResult", () => {
    const tool = readFileSync(resolve("src/components/analys/analys-tool.tsx"), "utf8");
    const report = readFileSync(resolve("src/components/analys/analys-report.tsx"), "utf8");

    expect(tool).toMatch(/PublicAnalysReport/);
    expect(tool).not.toMatch(/from "@\/types\/audit"/);
    expect(report).toMatch(/PublicAnalysReport/);
    expect(report).not.toMatch(/from "@\/types\/audit"/);
  });

  it("gästen får signup-CTA i stället för en PDF som kräver konto", () => {
    const report = readFileSync(resolve("src/components/analys/analys-report.tsx"), "utf8");
    expect(report).not.toMatch(/AuditPdfReport/);
    expect(report).toMatch(/PDF, sparad historik och bygge kräver konto/);
  });
});
