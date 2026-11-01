// @vitest-environment node
import { describe, expect, it } from "vitest";
import { transform } from "esbuild";
import { applySeoToProjectFiles } from "@/lib/gen/scaffolds/seo-defaults";
import { addMetadataDefaults, readMetadataString, writeMetadataString } from "./metadata-literal";

const siteUrl = "https://www.tekosom.se";
const layout = (properties: string) => `import type { Metadata } from "next";
const title = "Tekosom";
const description = ["Small runs from 250 pieces,", "technical garments"].join(" ");
export const metadata: Metadata = { ${properties} };
export default function Layout() { return <html><body /></html>; }`;

describe("publish metadata remains compilable", () => {
  it.each([
    '"A Swedish production partner with its own factory in Poland. Small batch outerwear production from 250 pieces, technical garments."',
    "'Johan\\'s factory, small batches'",
    '"Braces { and }, commas, and \\"quotes\\""',
    "`First line,\nsecond line, with { braces }`",
    "description",
    '["Small runs,", "technical garments"].join(" ")',
  ])("preserves a complete description expression: %s", async (expression) => {
    const source = layout(`title: "Tekosom", description: ${expression},`);
    const files = [{ name: "app/layout.tsx", content: source }];
    const result = applySeoToProjectFiles(files, { siteUrl });
    const output = result.files.find((f) => f.name === "app/layout.tsx")!.content;
    await expect(transform(output, { loader: "tsx" })).resolves.toBeDefined();
    expect(output).toContain(`description: ${expression},`);
    expect(output).toContain("metadataBase:");
    expect(output).toContain("openGraph:");
    expect(output).toContain("twitter:");
    expect(files[0].content).toBe(source);
    expect(applySeoToProjectFiles(result.files, { siteUrl }).files).toEqual(result.files);
  });

  it("preserves shorthand fields, custom metadata and existing partial Open Graph", async () => {
    const source = layout(
      'title, description, robots: { index: false }, openGraph: { title: "Custom social title" }, // keep comment\n',
    );
    const output = applySeoToProjectFiles([{ name: "app/layout.tsx", content: source }], {
      siteUrl,
    }).files[0].content;
    await expect(transform(output, { loader: "tsx" })).resolves.toBeDefined();
    expect(output).toContain(
      'title, description, robots: { index: false }, openGraph: { title: "Custom social title" }',
    );
    expect(output).toContain("// keep comment");
    expect(output).not.toContain('title: "Website"');
    expect(readMetadataString(output, "description")).toEqual({ kind: "dynamic" });
  });

  it("does not rewrite a literal prefix of a dynamic concatenation", () => {
    const source = layout('title: "Hello, " + title, description,');
    expect(readMetadataString(source, "title")).toEqual({ kind: "dynamic" });
    expect(writeMetadataString(source, "title", "Replacement")).toBe(source);
  });

  it("keeps spread precedence and recognizes satisfies metadata", async () => {
    const source =
      'const custom = { title: "Project title" }; export const metadata = { ...custom, "description": "Custom, description" } satisfies Record<string, unknown>;';
    const output = addMetadataDefaults(source, {
      title: '"Fallback"',
      metadataBase: 'new URL("https://example.test")',
    });
    expect(output.indexOf('title: "Fallback"')).toBeLessThan(output.indexOf("...custom"));
    expect(readMetadataString(output, "description")).toEqual({
      kind: "literal",
      value: "Custom, description",
    });
    await expect(transform(output, { loader: "tsx" })).resolves.toBeDefined();
  });
});
