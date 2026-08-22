import { describe, expect, it } from "vitest";

import {
  renderScaffoldResearchBlock,
  renderScaffoldVariantBlock,
  renderVariantTemplateInspirationBlock,
} from "./scaffold-stack";
import { getVariantById } from "@/lib/gen/scaffold-variants";

/**
 * The compact variant block is what non-redesign follow-ups get — i.e. most
 * rounds after the first. It used to omit `signaturePatterns` entirely, so the
 * variant's anti-patterns only ever reached the model on init and a follow-up
 * could drift into exactly the styles the variant exists to avoid.
 */
describe("renderScaffoldVariantBlock — compact follow-up form", () => {
  const variant = getVariantById("landing-page", "corporate-grid");

  it("keeps the variant identity and at least one anti-pattern", () => {
    if (!variant) throw new Error("corporate-grid variant not registered");
    expect(variant.signaturePatterns?.antiPatterns.length ?? 0).toBeGreaterThan(0);

    const compact = renderScaffoldVariantBlock(variant, { compact: true }).join("\n");
    expect(compact).toContain("## Scaffold Variant (this generation)");
    expect(compact).toContain("corporate-grid");
    expect(compact).toContain("Still avoid (variant anti-patterns):");
    expect(compact).toContain(variant.signaturePatterns!.antiPatterns[0]);
  });

  it("stays materially shorter than the full block", () => {
    if (!variant) throw new Error("corporate-grid variant not registered");
    const compact = renderScaffoldVariantBlock(variant, { compact: true }).join("\n");
    const full = renderScaffoldVariantBlock(variant).join("\n");
    expect(compact.length).toBeLessThan(full.length / 2);
    expect(full).not.toContain("Derived from curated references");
  });

  it("renders nothing without a variant", () => {
    expect(renderScaffoldVariantBlock(null, { compact: true })).toEqual([]);
  });
});

describe("renderScaffoldVariantBlock — theme token CSS contract", () => {
  it("tells the model to write --color-* tokens into @theme inline", () => {
    const variant = getVariantById("landing-page", "futuristic-investment-landing");
    if (!variant) throw new Error("futuristic-investment-landing not registered");

    const full = renderScaffoldVariantBlock(variant).join("\n");
    expect(full).toContain("@theme inline");
    expect(full).toContain(`--color-background: ${variant.themeTokens!.background}`);
    expect(full).toContain(`--color-primary: ${variant.themeTokens!.primary}`);
    expect(full).toMatch(/Keep the `--color-` prefix exactly as written/);
    expect(full).not.toMatch(/^ *- --(?!color-|radius)[a-z]/m);
  });

  it("keeps the body recipe outside the @theme inline token list", () => {
    const variant = getVariantById("landing-page", "futuristic-investment-landing");
    if (!variant) throw new Error("futuristic-investment-landing not registered");

    const full = renderScaffoldVariantBlock(variant).join("\n");
    const themeIdx = full.indexOf("Emit exactly these values");
    const keepIdx = full.indexOf("Keep the `--color-` prefix");
    const recipeIdx = full.indexOf("Body background recipe");
    expect(themeIdx).toBeGreaterThanOrEqual(0);
    expect(keepIdx).toBeGreaterThan(themeIdx);
    expect(recipeIdx).toBeGreaterThan(keepIdx);

    const tokenSection = full.slice(themeIdx, keepIdx);
    expect(tokenSection).toContain(`--color-background: ${variant.themeTokens!.background}`);
    expect(tokenSection).toContain(`--color-primary: ${variant.themeTokens!.primary}`);
    expect(tokenSection).not.toContain("Body background recipe");
    expect(tokenSection).not.toContain("radial-gradient");

    const recipeSection = full.slice(recipeIdx);
    expect(recipeSection).toContain("NOT inside `@theme inline`");
    expect(recipeSection).toContain("apply this backgroundImage on `body` in `globals.css`");
    expect(recipeSection).toContain("color-mix(in oklab, var(--color-primary) 14%");
  });
});

describe("renderVariantTemplateInspirationBlock", () => {
  it("renders exactly one style-only reference and its bounded structure", () => {
    const rendered = renderVariantTemplateInspirationBlock({
      templateId: "8QhCJAwn16K",
      title: "MindSpace Mental Health Platform",
      category: "landing-pages",
      archiveUrl: "https://example.com/template.zip",
      stillImageUrl: "https://example.com/still.jpg",
      structuralReferences: [
        {
          path: "app/page.tsx",
          language: "tsx",
          reason: "primary-page",
          excerpt: "export default function Page() { return <main />; }",
        },
      ],
    }).join("\n");

    expect(rendered).toContain("## Variant Template Inspiration");
    expect(rendered).toContain("MindSpace Mental Health Platform");
    expect(rendered).toContain("Never embed the still image");
    expect(rendered).toContain("app/page.tsx");
    expect(rendered).not.toContain("https://example.com/still.jpg");
  });

  it("renders only scaffold-owned research guidance", () => {
    const rendered = renderScaffoldResearchBlock({
      id: "landing-page",
      label: "Landing Page",
      qualityChecklist: ["Strong hierarchy"],
      research: {
        upgradeTargets: ["Sharper composition"],
      },
    } as never).join("\n");
    expect(rendered).toContain("Strong hierarchy");
    expect(rendered).toContain("Sharper composition");
  });
});
