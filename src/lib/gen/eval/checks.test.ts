import { describe, expect, it } from "vitest";
import type { CodeFile } from "../parser";
import {
  checkNoBracketPlaceholders,
  checkProjectSanity,
  checkSeoPublishReadiness,
  checkTier2Readiness,
  checkVisualQuality,
  findBracketPlaceholderHits,
  findCriticalPlaceholderHits,
} from "./checks";

describe("checkProjectSanity", () => {
  it("passes for a minimal valid App Router project", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            next: "16.2.3",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
        }),
        language: "json",
      },
      {
        path: "app/layout.tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      },
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <main>Hello</main>; }",
        language: "tsx",
      },
      {
        path: "app/globals.css",
        content: "@theme inline { --color-background: 0 0% 100%; }",
        language: "css",
      },
    ];

    const result = checkProjectSanity(files);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when code imports an unpinned third-party package", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            next: "16.2.3",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
        }),
        language: "json",
      },
      {
        path: "app/layout.tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      },
      {
        path: "app/page.tsx",
        content:
          'import confetti from "canvas-confetti"; export default function Page() { return <button onClick={() => confetti()}>Celebrate</button>; }',
        language: "tsx",
      },
      {
        path: "app/globals.css",
        content: "@theme inline { --color-background: 0 0% 100%; }",
        language: "css",
      },
    ];

    const result = checkProjectSanity(files);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("canvas-confetti");
  });
});

describe("checkNoBracketPlaceholders", () => {
  it("passes when no known bracket placeholders remain", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <main>Acme Partners</main>; }",
        language: "tsx",
      },
    ];

    const result = checkNoBracketPlaceholders(files);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when known bracket placeholders remain in content", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <main>[Company Name]</main>; }",
        language: "tsx",
      },
    ];

    const result = checkNoBracketPlaceholders(files);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("bracket placeholder");
  });

  it("detects Swedish scaffold placeholders like [Butiksnamn] and [Rubrik]", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content:
          "export default function Page(){return <main><h1>[Rubrik som säger vad företaget gör]</h1><p>[Butiksnamn]</p></main>}",
        language: "tsx",
      },
    ];
    const hits = findBracketPlaceholderHits(files);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.count).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.samples.join(" ")).toContain("Rubrik");
  });

  it("does NOT flag benign JSX patterns like items[0] or dynamic route segments", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content:
          "export default function Page(){ const items=['a','b']; return <main>{items[0]}<a href='/blog/[slug]'>link</a></main>}",
        language: "tsx",
      },
    ];
    const hits = findBracketPlaceholderHits(files);
    expect(hits).toHaveLength(0);
  });

  it("treats app/page.tsx as critical and app/components/Foo.tsx as non-critical", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "<h1>[Huvudrubrik]</h1>",
        language: "tsx",
      },
      {
        path: "app/components/Foo.tsx",
        content: "<p>[Ingress]</p>",
        language: "tsx",
      },
    ];
    const critical = findCriticalPlaceholderHits(files);
    expect(critical.map((entry) => entry.file)).toEqual(["app/page.tsx"]);
  });
});

describe("checkTier2Readiness", () => {
  it("passes when tier-2 can start even if only warnings remain", () => {
    const result = checkTier2Readiness({
      previewStart: {
        canStartPreview: true,
        blockingCategories: [],
      },
      previewBlockingReason: null,
      preflightIssues: [
        {
          file: "next-env.d.ts",
          severity: "warning",
          message: "Missing next-env.d.ts with TypeScript sources",
          category: "non_blocking_quality_warning",
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.message).toContain("non-blocking");
  });

  it("fails when preflight blocks tier-2 startup", () => {
    const result = checkTier2Readiness({
      previewStart: {
        canStartPreview: false,
        blockingCategories: ["dependency_install_failure"],
      },
      previewBlockingReason: null,
      preflightIssues: [
        {
          file: "package.json",
          severity: "error",
          message: "Missing `next` in dependencies",
          category: "dependency_install_failure",
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain("Missing `next`");
    expect(result.message).toContain("dependency_install_failure");
  });
});

describe("checkSeoPublishReadiness", () => {
  it("fails when SEO preflight reports blocking metadata errors", () => {
    const result = checkSeoPublishReadiness([
      {
        file: "app/layout.tsx",
        severity: "error",
        code: "missing-metadata",
        message: "Layouten saknar export av metadata för title/description.",
        category: "non_blocking_quality_warning",
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("metadata");
  });

  it("stays passing with only SEO warnings but lowers score", () => {
    const result = checkSeoPublishReadiness([
      {
        file: "seo",
        severity: "warning",
        code: "missing-sitemap",
        message: "Projektet saknar app/sitemap.ts.",
        category: "non_blocking_quality_warning",
      },
    ]);

    expect(result.passed).toBe(true);
    expect(result.score).toBeLessThan(1);
  });
});

describe("checkVisualQuality", () => {
  it("passes for a reasonably complete marketing page", () => {
    const files: CodeFile[] = [
      {
        path: "app/layout.tsx",
        content:
          "export const metadata = { title: 'Acme', description: 'Acme Consulting' }; export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      },
      {
        path: "app/globals.css",
        content:
          "@theme inline { --color-primary: oklch(0.62 0.18 250); --color-secondary: oklch(0.71 0.12 180); --color-accent: oklch(0.8 0.15 40); }",
        language: "css",
      },
      {
        path: "app/page.tsx",
        content:
          "export default function Page(){ return <main><section className='py-24 bg-muted'><h1 className='text-5xl'>Acme</h1><p>Long descriptive subtext that explains the offer in a serious way for business buyers and gives context for the service.</p><button>Boka möte</button><img src='/placeholder.svg?width=800&height=600&text=consulting+team' /></section><section className='bg-card'><p>Section two</p></section><section className='bg-secondary'><p>Section three</p></section></main>; }",
        language: "tsx",
      },
    ];

    const result = checkVisualQuality(files);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it("fails for thin pages with weak visual structure", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page(){ return <main><h1>Hi</h1></main>; }",
        language: "tsx",
      },
    ];

    const result = checkVisualQuality(files);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("hero-quality");
  });
});
