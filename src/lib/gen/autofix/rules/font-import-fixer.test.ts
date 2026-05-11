import { describe, expect, it } from "vitest";
import { fixFontImport } from "./font-import-fixer";

const BASELINE_LAYOUT = `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Min webbplats",
  description: "Byggd med Next.js och Tailwind CSS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark" suppressHydrationWarning>
      <body className={\`\${inter.variable} antialiased\`}>{children}</body>
    </html>
  );
}
`;

const BASELINE_LAYOUT_BARE_VARIABLE = `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
`;

describe("fixFontImport — variant font materialization", () => {
  it("materializes editorial-lux pair (Cormorant_Garamond + Raleway) into baseline layout", () => {
    const result = fixFontImport(BASELINE_LAYOUT, "app/layout.tsx", {
      scaffoldId: "landing-page",
      variantId: "editorial-lux",
    });
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      'import { Cormorant_Garamond, Raleway } from "next/font/google";',
    );
    expect(result.code).toContain(
      'const fontDisplay = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display", display: "swap" });',
    );
    expect(result.code).toContain(
      'const fontSans = Raleway({ subsets: ["latin"], variable: "--font-sans", display: "swap" });',
    );
    expect(result.code).toContain(
      "${fontDisplay.variable} ${fontSans.variable} antialiased",
    );
    expect(result.code).not.toMatch(/\bInter\b/);
    expect(result.code).not.toMatch(/\binter\.variable\b/);
    expect(
      result.fixes.some((fix) => fix.fixer === "variant-font-materializer"),
    ).toBe(true);
  });

  it("rewrites bare className={inter.variable} to template-literal pair when materializing", () => {
    const result = fixFontImport(
      BASELINE_LAYOUT_BARE_VARIABLE,
      "app/layout.tsx",
      { scaffoldId: "landing-page", variantId: "editorial-lux" },
    );
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      "className={`${fontDisplay.variable} ${fontSans.variable}`}",
    );
    expect(result.code).not.toContain("className={inter.variable}");
  });

  it("materializes corporate-grid pair onto distinct CSS variables when both fonts share a category", () => {
    const result = fixFontImport(BASELINE_LAYOUT, "app/layout.tsx", {
      scaffoldId: "landing-page",
      variantId: "corporate-grid",
    });
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      'import { Manrope, Inter } from "next/font/google";',
    );
    expect(result.code).toContain(
      'const fontDisplay = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });',
    );
    expect(result.code).toContain(
      'const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });',
    );
    expect(result.code).not.toMatch(/\binter\.variable\b/);
  });

  it("respects preview-host Geist workaround (Geist heading => Inter substitute)", () => {
    const baselineWithVariantContext = `import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
`;
    // We don't have a fixture variant with Geist-only fontPairings checked
    // in, so we exercise the workaround directly through the legacy path:
    // a layout that already mentions Geist must be rewritten to Inter even
    // when no variant context is provided. This is the contract the
    // preview-host depends on (see TODO #4 in font-import-fixer.ts).
    const layoutWithGeist = baselineWithVariantContext.replace(
      /Inter/g,
      "Geist",
    );
    const result = fixFontImport(layoutWithGeist, "app/layout.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).not.toMatch(/\bGeist\b/);
    expect(result.code).toMatch(/\bInter\b/);
  });

  it("is a no-op when variantId is unknown", () => {
    const result = fixFontImport(BASELINE_LAYOUT, "app/layout.tsx", {
      scaffoldId: "landing-page",
      variantId: "this-variant-does-not-exist",
    });
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(BASELINE_LAYOUT);
  });

  it("is a no-op when variantId/scaffoldId are absent", () => {
    const result = fixFontImport(BASELINE_LAYOUT, "app/layout.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(BASELINE_LAYOUT);
  });

  it("is a no-op when layout does not match the baseline Inter pattern", () => {
    const layoutAlreadyShaped = `import { Cormorant_Garamond, Raleway } from "next/font/google";

const fontDisplay = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display" });
const fontSans = Raleway({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={\`\${fontDisplay.variable} \${fontSans.variable}\`}>{children}</body>
    </html>
  );
}
`;
    const result = fixFontImport(layoutAlreadyShaped, "app/layout.tsx", {
      scaffoldId: "landing-page",
      variantId: "editorial-lux",
    });
    // No materialization triggered — layout is not the baseline. The
    // existing import-augmentation path may still emit a fix, but the
    // const block must not be rewritten.
    expect(result.code).not.toContain('const inter = Inter');
    expect(result.code).toContain("const fontDisplay = Cormorant_Garamond");
  });

  it("does not run on non-layout files", () => {
    const result = fixFontImport(BASELINE_LAYOUT, "app/page.tsx", {
      scaffoldId: "landing-page",
      variantId: "editorial-lux",
    });
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(BASELINE_LAYOUT);
  });
});
