import { describe, expect, it } from "vitest";

import { auditProjectSeo, findImagesWithoutAlt, PLACEHOLDER_SITE_URL } from "./audit";

const GOOD_LAYOUT = `import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://minsajt.se"),
  title: "Klippoteket — frisör i Uppsala med drop-in",
  description: "Boka klippning, färgning och styling hos Klippoteket i centrala Uppsala. Drop-in varje vardag och kvällstider på torsdagar.",
  alternates: { canonical: "/" },
  openGraph: { title: "Klippoteket", images: ["/opengraph-image"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
`;

const BARE_LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
`;

const BASELINE_ROBOTS = `import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "${PLACEHOLDER_SITE_URL}";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: \`\${siteUrl}/sitemap.xml\` };
}
`;

describe("auditProjectSeo", () => {
  it("finds nothing important in a well-formed project", () => {
    const result = auditProjectSeo([
      { path: "app/layout.tsx", content: GOOD_LAYOUT },
      { path: "app/page.tsx", content: "<h1>Klippoteket</h1>" },
      { path: "app/robots.ts", content: "export default function robots() { return {}; }" },
      { path: "app/sitemap.ts", content: "export default function sitemap() { return []; }" },
      { path: "app/jsonld.tsx", content: 'const s = "schema.org";' },
    ]);
    const critical = result.findings.filter((f) => f.severity === "critical");
    expect(critical).toEqual([]);
    expect(result.score).toBeGreaterThan(90);
    expect(result.pagesInspected).toEqual(["app/page.tsx"]);
  });

  it("reports the whole critical set for a bare layout", () => {
    const result = auditProjectSeo([{ path: "app/layout.tsx", content: BARE_LAYOUT }]);
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("missing-metadata");
    expect(ids).toContain("missing-html-lang");
    expect(ids).toContain("missing-robots");
    expect(ids).toContain("missing-sitemap");
    expect(result.score).toBeLessThan(80);
  });

  it("flags a robots file that still points at the placeholder host", () => {
    // The published-site version of this bug: robots.ts exists, so a
    // presence-only check calls it done while it tells Google to crawl
    // example.com.
    const result = auditProjectSeo([
      { path: "app/layout.tsx", content: GOOD_LAYOUT },
      { path: "app/robots.ts", content: BASELINE_ROBOTS },
    ]);
    const placeholder = result.findings.find((f) => f.id === "placeholder-site-url");
    expect(placeholder).toBeDefined();
    expect(placeholder?.severity).toBe("critical");
    expect(placeholder?.fixable).toBe(true);
    expect(result.findings.some((f) => f.id === "missing-robots")).toBe(false);
  });

  it("measures title and description length rather than only presence", () => {
    const short = GOOD_LAYOUT.replace(
      "Klippoteket — frisör i Uppsala med drop-in",
      "Hem",
    ).replace(
      /description: "[^"]*"/,
      'description: "Frisör."',
    );
    const ids = auditProjectSeo([{ path: "app/layout.tsx", content: short }]).findings.map(
      (f) => f.id,
    );
    expect(ids).toContain("title-too-short");
    expect(ids).toContain("description-too-short");
  });

  it("distinguishes no h1 from several h1", () => {
    const result = auditProjectSeo([
      { path: "app/layout.tsx", content: GOOD_LAYOUT },
      { path: "app/page.tsx", content: "<h1>Ett</h1><h1>Två</h1>" },
      { path: "app/om/page.tsx", content: "<p>Ingen rubrik</p>" },
    ]);
    expect(result.findings.find((f) => f.id === "multiple-h1")?.file).toBe("app/page.tsx");
    expect(result.findings.find((f) => f.id === "missing-h1")?.file).toBe("app/om/page.tsx");
  });

  it("marks a finding unfixable when the improver has no fix for it", () => {
    // Being honest here is the point: a report that lists an unfixable finding
    // as fixable reads as a promise the next step cannot keep.
    const result = auditProjectSeo([
      { path: "app/layout.tsx", content: GOOD_LAYOUT },
      { path: "app/page.tsx", content: '<h1>Hej</h1><img src="/a.jpg" />' },
    ]);
    expect(result.findings.find((f) => f.id === "image-missing-alt")?.fixable).toBe(false);
    expect(result.findings.find((f) => f.id === "missing-structured-data")?.fixable).toBe(false);
  });
});

describe("findImagesWithoutAlt", () => {
  it("counts images with no alt attribute", () => {
    expect(findImagesWithoutAlt('<img src="a" /><Image src="b" />')).toBe(2);
  });

  it("accepts an empty alt as a deliberate decorative image", () => {
    // alt="" is correct markup for decoration; flagging it would push the
    // improver to invent alt text for images that should stay silent.
    expect(findImagesWithoutAlt('<img src="a" alt="" />')).toBe(0);
    expect(findImagesWithoutAlt('<img src="a" alt="En katt" />')).toBe(0);
  });
});
