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

describe("layout-provider-fixer — hoist script/Analytics out of ThemeProvider", () => {
  /** Verbatim shape from prod chat a53cf1ee (J Sickla) 2026-08-18. */
  const SICKLA_LAYOUT: CodeFile = {
    path: "app/layout.tsx",
    language: "tsx",
    content: `import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { ThemeProvider } from "next-themes";

const hotelSchema = { "@type": "Hotel", name: "J Sickla" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
        <Toaster richColors position="top-right" />
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelSchema) }}
        />
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
  };

  it("moves JSON-LD script and Analytics to siblings after ThemeProvider", () => {
    const result = fixLayoutProviders([SICKLA_LAYOUT, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]!.description).toMatch(/script.*Analytics|Analytics.*script/);
    expect(layout).toContain("<Analytics />");
    expect(layout).toContain('type="application/ld+json"');

    const providerClose = layout.indexOf("</ThemeProvider>");
    const analyticsIdx = layout.indexOf("<Analytics");
    const scriptIdx = layout.indexOf("<script");
    const bodyClose = layout.indexOf("</body>");
    expect(providerClose).toBeGreaterThan(-1);
    expect(analyticsIdx).toBeGreaterThan(providerClose);
    expect(scriptIdx).toBeGreaterThan(providerClose);
    expect(analyticsIdx).toBeLessThan(bodyClose);
    expect(scriptIdx).toBeLessThan(bodyClose);

    const inner = layout.slice(
      layout.indexOf("<ThemeProvider"),
      providerClose,
    );
    expect(inner).not.toContain("<Analytics");
    expect(inner).not.toContain("<script");
    expect(inner).toContain("<Toaster");
  });

  it("motprov: leaves script already outside ThemeProvider untouched", () => {
    const healthy: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <main>{children}</main>
        </ThemeProvider>
        <Analytics />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: "{}" }} />
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([healthy, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
    expect(layoutOf(result.files)).toBe(healthy.content);
  });

  it("after injecting ThemeProvider, hoists a pre-existing body-level script back out", () => {
    const withJsonLd: CodeFile = {
      ...SCAFFOLD_LIKE_LAYOUT,
      content: SCAFFOLD_LIKE_LAYOUT.content.replace(
        "<SiteFooter />",
        `<SiteFooter />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: "{}" }} />`,
      ),
    };
    const result = fixLayoutProviders([withJsonLd, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);
    expect(result.fixes.some((fix) => /script/.test(fix.description))).toBe(true);
    const providerClose = layout.indexOf("</ThemeProvider>");
    expect(layout.indexOf("<script")).toBeGreaterThan(providerClose);
    expect(layout.slice(layout.indexOf("<ThemeProvider"), providerClose)).not.toContain("<script");
  });

  it("does not hoist Analytics used as a JSX attribute value", () => {
    const asProp: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Widget analytics={<Analytics />} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([asProp, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
    expect(layoutOf(result.files)).toBe(asProp.content);
  });

  it("hoists from a one-line ThemeProvider without copying the opening tag into indent", () => {
    const oneLine: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem><main>{children}</main><Analytics /></ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([oneLine, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);
    expect(result.fixes).toHaveLength(1);
    expect(layout).toMatch(/<\/ThemeProvider>\s*<Analytics \/>/);
    expect(layout).not.toContain("<ThemeProvider attribute=\"class\" defaultTheme=\"system\" enableSystem><Analytics />");
    expect((layout.match(/<ThemeProvider\b/g) ?? []).length).toBe(1);
    expect((layout.match(/<Analytics \/>/g) ?? []).length).toBe(1);
  });

  it("hoists a conditional Analytics expression whole, not just the tag", () => {
    const conditional: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const enabled = true;
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <main>{children}</main>
          {enabled && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([conditional, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);
    expect(result.fixes).toHaveLength(1);
    expect(layout).toContain("{enabled && <Analytics />}");
    expect(layout).not.toMatch(/\{enabled && \s*\}/);
    const providerClose = layout.indexOf("</ThemeProvider>");
    expect(layout.indexOf("{enabled && <Analytics />}"))
      .toBeGreaterThan(providerClose);
  });

  it("ignores a ThemeProvider that exists only in a line comment", () => {
    const commentedProvider: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // <ThemeProvider><Analytics /></ThemeProvider>
  return (
    <html lang="sv">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([commentedProvider, PKG_WITHOUT_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
    expect(layoutOf(result.files)).toBe(commentedProvider.content);
  });

  it("does not treat </ThemeProvider> inside a JSX comment as the real close", () => {
    const fakeClose: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {/* closed? </ThemeProvider> no */}
          <main>{children}</main>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([fakeClose, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);
    expect(result.fixes).toHaveLength(1);
    expect(layout).toContain("{/* closed? </ThemeProvider> no */}");
    const lastClose = layout.lastIndexOf("</ThemeProvider>");
    expect(layout.indexOf("<Analytics")).toBeGreaterThan(lastClose);
  });

  it("does not hoist a script that is only mentioned in a comment", () => {
    const commented: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {/* JSON-LD lives in <script type="application/ld+json"> outside */}
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([commented, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
    expect(layoutOf(result.files)).toBe(commented.content);
  });

  it("ignores ThemeProvider mentioned only in a line comment (F-fbd7fe21edb5)", () => {
    const commentedProvider: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        {/* was: <ThemeProvider><Analytics /></ThemeProvider> */}
        // <ThemeProvider><Analytics /></ThemeProvider>
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([commentedProvider, PKG_WITH_NEXT_THEMES]);
    expect(result.fixes).toHaveLength(0);
    expect(layoutOf(result.files)).toBe(commentedProvider.content);
  });

  it("does not truncate the provider region on a commented close tag (Bugbot high #1031)", () => {
    const trickyClose: CodeFile = {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {/* do not match </ThemeProvider> here */}
          <main>{children}</main>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
`,
    };
    const result = fixLayoutProviders([trickyClose, PKG_WITH_NEXT_THEMES]);
    const layout = layoutOf(result.files);
    expect(result.fixes).toHaveLength(1);
    const providerClose = layout.indexOf("</ThemeProvider>");
    expect(layout.indexOf("<Analytics")).toBeGreaterThan(providerClose);
    expect(layout).toContain("{/* do not match </ThemeProvider> here */}");
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
