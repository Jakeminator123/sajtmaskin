import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { fixLayoutProviders } from "./layout-provider-fixer";

/**
 * Regression suite for the prod incident 2026-08-01 (chat e8bd3ba6,
 * "Sniglar på Mars"): the fixer wrapped the first `{children}` token —
 * inside `<main>` in scaffold layouts — so next-themes' inline theme-init
 * `<script>` landed mid-tree and broke hydration in preview. The fixer must
 * inject ThemeProvider around the <body> CONTENT instead.
 */

const PKG_WITH_NEXT_THEMES: CodeFile = {
  path: "package.json",
  content: JSON.stringify({
    dependencies: { next: "16.0.0", "next-themes": "^0.4.6" },
  }),
  language: "json",
};

const PKG_WITHOUT_NEXT_THEMES: CodeFile = {
  path: "package.json",
  content: JSON.stringify({ dependencies: { next: "16.0.0" } }),
  language: "json",
};

/** Same shape as the blog scaffold layout: children nested inside <main>. */
const SCAFFOLD_LIKE_LAYOUT: CodeFile = {
  path: "app/layout.tsx",
  language: "tsx",
  content: `import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className="min-h-screen">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
`,
};

function layoutOf(files: CodeFile[]): string {
  return files.find((f) => f.path === "app/layout.tsx")!.content;
}

describe("layout-provider-fixer — ThemeProvider injection point", () => {
  it("wraps the <body> content, never a nested {children}", () => {
    const result = fixLayoutProviders([SCAFFOLD_LIKE_LAYOUT, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]!.fixer).toBe("layout-provider-fixer");
    expect(layout).toContain('import { ThemeProvider } from "next-themes";');

    // Provider opens as a direct child of <body>, before the header…
    const bodyIdx = layout.indexOf("<body");
    const providerOpenIdx = layout.indexOf(
      '<ThemeProvider attribute="class" defaultTheme="system" enableSystem>',
    );
    const headerIdx = layout.indexOf("<SiteHeader />");
    expect(providerOpenIdx).toBeGreaterThan(bodyIdx);
    expect(providerOpenIdx).toBeLessThan(headerIdx);

    // …and closes after the footer, before </body>.
    const providerCloseIdx = layout.indexOf("</ThemeProvider>");
    const footerIdx = layout.indexOf("<SiteFooter />");
    const bodyCloseIdx = layout.indexOf("</body>");
    expect(providerCloseIdx).toBeGreaterThan(footerIdx);
    expect(providerCloseIdx).toBeLessThan(bodyCloseIdx);

    // The exact prod failure shape must not be produced.
    expect(layout).not.toContain("<main className=\"flex-1\"><ThemeProvider");
    expect(layout).toContain('<main className="flex-1">{children}</main>');
  });

  it("regression: multi-line <main> wrapper keeps {children} untouched", () => {
    const layoutFile: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([layoutFile, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    expect(layout).not.toMatch(/<main[^>]*><ThemeProvider/);
    // {children} still sits directly inside <main>, provider outside it.
    expect(layout.indexOf("<ThemeProvider")).toBeLessThan(layout.indexOf("<div"));
  });

  it("does nothing when the layout already has a ThemeProvider", () => {
    const layoutFile: CodeFile = {
      ...SCAFFOLD_LIKE_LAYOUT,
      content: SCAFFOLD_LIKE_LAYOUT.content.replace(
        "<body className=\"min-h-screen\">",
        "<body className=\"min-h-screen\"><ThemeProvider attribute=\"class\">",
      ).replace("</body>", "</ThemeProvider></body>"),
    };
    const result = fixLayoutProviders([layoutFile, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
  });

  it("does nothing when next-themes is not a dependency", () => {
    const result = fixLayoutProviders([SCAFFOLD_LIKE_LAYOUT, PKG_WITHOUT_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
  });

  it("does nothing without a theme signal or theme usage", () => {
    const layoutFile: CodeFile = {
      ...SCAFFOLD_LIKE_LAYOUT,
      content: SCAFFOLD_LIKE_LAYOUT.content.replace(" suppressHydrationWarning", ""),
    };
    const result = fixLayoutProviders([layoutFile, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
  });

  it("ignores <body> mentions in comments and wraps the real JSX tag", () => {
    const layoutFile: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import "./globals.css";

// The <body> element carries the theme class via suppressHydrationWarning.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  {/* the <body> below is the real one */}
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className="min-h-screen">
        <main>{children}</main>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([layoutFile, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    // The comment lines stay intact…
    expect(layout).toContain("// The <body> element carries the theme class");
    expect(layout).toContain("{/* the <body> below is the real one */}");
    // …and the provider wraps the JSX body content, not comment text.
    expect(layout).toMatch(/<body className="min-h-screen">\s*<ThemeProvider attribute="class"/);
    expect(layout.indexOf("</ThemeProvider>")).toBeLessThan(layout.indexOf("</body>"));
  });

  it("handles a <body> tag whose attributes span multiple lines", () => {
    const layoutFile: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        data-theme="base"
      >
        <main>{children}</main>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([layoutFile, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    // Provider opens after the multi-line body tag closes, before <main>.
    expect(layout.indexOf("<ThemeProvider")).toBeGreaterThan(layout.indexOf('data-theme="base"'));
    expect(layout.indexOf("<ThemeProvider")).toBeLessThan(layout.indexOf("<main>"));
    expect(layout.indexOf("</ThemeProvider>")).toBeLessThan(layout.indexOf("</body>"));
  });

  it("skips injection when the layout has no <body> section", () => {
    const layoutFile: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <div suppressHydrationWarning>{children}</div>;
}
`,
    };
    const result = fixLayoutProviders([layoutFile, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
    expect(layoutOf(result.files)).not.toContain("ThemeProvider");
  });
});

describe("layout-provider-fixer — heal of legacy mid-tree injection", () => {
  /** Verbatim shape from prod chat e8bd3ba6 v1 (persisted by the old fixer). */
  const BROKEN_PROD_LAYOUT: CodeFile = {
    path: "app/layout.tsx",
    language: "tsx",
    content: `import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className="min-h-screen">
        <div className="relative flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1"><ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider></main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
`,
  };

  it("relocates the previously injected ThemeProvider to <body> level", () => {
    const result = fixLayoutProviders([BROKEN_PROD_LAYOUT, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]!.description).toContain("Relocated");
    expect(layout).not.toContain("<main className=\"flex-1\"><ThemeProvider");
    expect(layout).toContain('<main className="flex-1">{children}</main>');
    expect(layout).toMatch(/<body\b[^>]*>\s*<ThemeProvider attribute="class"/);
    // Exactly one provider — the relocation must not duplicate it.
    expect(layout.match(/<ThemeProvider\b/g)).toHaveLength(1);
    expect(layout.match(/import \{ ThemeProvider \}/g)).toHaveLength(1);
  });

  it("leaves a correctly placed body-level provider alone", () => {
    const healthy = fixLayoutProviders([SCAFFOLD_LIKE_LAYOUT, PKG_WITH_NEXT_THEMES]);
    const second = fixLayoutProviders([...healthy.files]);
    expect(second.fixes).toHaveLength(0);
    expect(layoutOf(second.files)).toBe(layoutOf(healthy.files));
  });

  it("strips the inner legacy wrap when a body-level provider already exists", () => {
    const doubleProvider: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import "./globals.css";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <main className="flex-1"><ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider></main>
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([doubleProvider, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]!.description).toContain("Removed legacy nested");
    // Exactly one provider left, at body level, and children back in <main>.
    expect(layout.match(/<ThemeProvider\b/g)).toHaveLength(1);
    expect(layout).toMatch(/<body\b[^>]*>\s*<ThemeProvider attribute="class"/);
    expect(layout).toContain('<main className="flex-1">{children}</main>');
  });

  it("does not touch a hand-written provider with different attrs", () => {
    const custom: CodeFile = {
      ...BROKEN_PROD_LAYOUT,
      content: BROKEN_PROD_LAYOUT.content.replace(
        'attribute="class" defaultTheme="system" enableSystem',
        'attribute="class" defaultTheme="dark"',
      ),
    };
    const result = fixLayoutProviders([custom, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
  });
});

describe("layout-provider-fixer — Toaster injection (unchanged behavior)", () => {
  it("still inserts <Toaster /> before </body> when toasts are used", () => {
    const pageWithToast: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: `"use client";
import { toast } from "sonner";
export default function Page() {
  return <button onClick={() => toast("hi")}>Toast</button>;
}
`,
    };
    const layoutWithoutSignals: CodeFile = {
      ...SCAFFOLD_LIKE_LAYOUT,
      content: SCAFFOLD_LIKE_LAYOUT.content.replace(" suppressHydrationWarning", ""),
    };
    const result = fixLayoutProviders([
      layoutWithoutSignals,
      pageWithToast,
      PKG_WITHOUT_NEXT_THEMES,
    ]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    expect(layout).toContain('import { Toaster } from "@/components/ui/sonner";');
    expect(layout.indexOf("<Toaster />")).toBeLessThan(layout.indexOf("</body>"));
  });
});
