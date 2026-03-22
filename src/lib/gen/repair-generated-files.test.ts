import { describe, expect, it } from "vitest";

import { repairGeneratedFiles } from "./repair-generated-files";

describe("repairGeneratedFiles", () => {
  it("rewrites a single missing named import to a default import when the target only exports default", () => {
    const files = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content: [
          'import { SectionHeading } from "@/components/section-heading";',
          "",
          "export default function Page() {",
          "  return <SectionHeading />;",
          "}",
        ].join("\n"),
      },
      {
        path: "components/section-heading.tsx",
        language: "tsx",
        content: [
          "export default function SectionHeading() {",
          "  return <h2>Hej</h2>;",
          "}",
        ].join("\n"),
      },
    ];

    const result = repairGeneratedFiles(files);
    const page = result.files.find((file) => file.path === "app/page.tsx");

    expect(page?.content).toContain('import SectionHeading from "@/components/section-heading";');
    expect(result.fixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fixer: "named-import-default-mismatch-fixer",
          file: "app/page.tsx",
        }),
      ]),
    );
  });

  it("adds missing siteConfig import when JSON-LD references it", () => {
    const files = [
      {
        path: "site-config.ts",
        language: "ts",
        content: [
          "export const siteConfig = {",
          "  name: 'Test',",
          "  url: 'https://example.com',",
          "  description: 'x',",
          "  email: 'a@b.com',",
          "};",
        ].join("\n"),
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: [
          'import type { Metadata } from "next";',
          "",
          "const jsonLd = {",
          '  "@context": "https://schema.org",',
          '  "@type": "FinancialService",',
          "  name: siteConfig.name,",
          "  url: siteConfig.url,",
          "};",
          "",
          "export default function Page() {",
          "  return <script type=\"application/ld+json\">{JSON.stringify(jsonLd)}</script>;",
          "}",
        ].join("\n"),
      },
    ];

    const result = repairGeneratedFiles(files);
    const page = result.files.find((f) => f.path === "app/page.tsx");

    expect(page?.content).toContain('import { siteConfig } from "../site-config"');
    expect(result.fixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fixer: "site-config-import-fixer",
          file: "app/page.tsx",
        }),
      ]),
    );
  });

  it("restores preview-stripped imports back to real import statements", () => {
    const files = [
      {
        path: "app/demo/actions.ts",
        language: "ts",
        content: [
          '// import { headers } from "next/headers"; (stripped for preview compatibility)',
          '// import "server-only"; (stripped for preview compatibility)',
          "",
          "export async function getServerActionData() {",
          "  return { ok: true };",
          "}",
        ].join("\n"),
      },
    ];

    const result = repairGeneratedFiles(files);
    const repaired = result.files.find((file) => file.path === "app/demo/actions.ts");

    expect(repaired?.content).toContain('import { headers } from "next/headers";');
    expect(repaired?.content).toContain('import "server-only";');
    expect(repaired?.content).not.toContain("(stripped for preview compatibility)");
    expect(result.fixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fixer: "preview-import-restore-fixer",
          file: "app/demo/actions.ts",
        }),
      ]),
    );
  });
});
