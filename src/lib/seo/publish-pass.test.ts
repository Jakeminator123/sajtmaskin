/**
 * End-to-end behaviour of the publish pass: audit → improve → report.
 *
 * The assertions that matter most are the negative ones. A report that lists
 * an improvement nobody made, or a "remaining" list derived from intentions
 * rather than from a fresh audit, is precisely the false-green this repo keeps
 * having to dig out — so the tests below check the report against the actual
 * shipped files, not against what the improver said it did.
 */

import { describe, expect, it } from "vitest";

import { auditProjectSeo, PLACEHOLDER_SITE_URL } from "./audit";
import { addHtmlLang, resolveHtmlLang } from "./improve";
import { keepOnlyRealChanges, runSeoPublishPass } from "./index";

const SITE_URL = "https://klippoteket.se";

const BASELINE_ROBOTS = `import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "${PLACEHOLDER_SITE_URL}";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: \`\${siteUrl}/sitemap.xml\` };
}
`;

const BASELINE_SITEMAP = `import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "${PLACEHOLDER_SITE_URL}";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl, lastModified: new Date() }];
}
`;

const LAYOUT = `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klippoteket — frisör i Uppsala med drop-in",
  description: "Boka klippning, färgning och styling hos Klippoteket i centrala Uppsala. Drop-in varje vardag.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
`;

function baselineProject() {
  return [
    { name: "app/layout.tsx", content: LAYOUT },
    { name: "app/page.tsx", content: "<h1>Klippoteket</h1>" },
    { name: "app/robots.ts", content: BASELINE_ROBOTS },
    { name: "app/sitemap.ts", content: BASELINE_SITEMAP },
  ];
}

describe("runSeoPublishPass", () => {
  it("replaces the placeholder host that presence-only SEO left behind", async () => {
    const files = baselineProject();
    const { files: shipped, report } = await runSeoPublishPass(files, { siteUrl: SITE_URL });

    const robots = shipped.find((f) => f.name === "app/robots.ts");
    const sitemap = shipped.find((f) => f.name === "app/sitemap.ts");
    expect(robots?.content).not.toContain(PLACEHOLDER_SITE_URL);
    expect(sitemap?.content).not.toContain(PLACEHOLDER_SITE_URL);
    expect(robots?.content).toContain(SITE_URL);

    expect(report.before.findings.some((f) => f.id === "placeholder-site-url")).toBe(true);
    expect(report.after.findings.some((f) => f.id === "placeholder-site-url")).toBe(false);
    expect(
      report.improvements.some((i) => i.findingId === "placeholder-site-url"),
    ).toBe(true);
  });

  it("improves the score and reports both numbers from real audits", async () => {
    const { report } = await runSeoPublishPass(baselineProject(), { siteUrl: SITE_URL });
    expect(report.after.score).toBeGreaterThan(report.before.score);
    // `after` must describe the shipped files, not a recomputed guess.
    expect(report.remaining).toEqual(report.after.findings);
  });

  it("sets html lang and records it as a traceable improvement", async () => {
    const { files: shipped, report } = await runSeoPublishPass(baselineProject(), {
      siteUrl: SITE_URL,
      language: "sv",
    });
    expect(shipped.find((f) => f.name === "app/layout.tsx")?.content).toContain('<html lang="sv"');
    const langFix = report.improvements.find((i) => i.findingId === "missing-html-lang");
    expect(langFix?.file).toBe("app/layout.tsx");
    expect(langFix?.by).toBe("deterministic");
  });

  it("reports no improvements when there is nothing left to fix", async () => {
    // Idempotence: running the pass twice must not invent a second round of
    // "improvements" for files it did not touch.
    const first = await runSeoPublishPass(baselineProject(), { siteUrl: SITE_URL });
    const second = await runSeoPublishPass(first.files, { siteUrl: SITE_URL });
    expect(second.report.improvements).toEqual([]);
    expect(second.files.map((f) => f.content)).toEqual(first.files.map((f) => f.content));
  });

  it("keeps findings it cannot fix in `remaining` instead of dropping them", async () => {
    const files = [
      ...baselineProject(),
      { name: "app/om/page.tsx", content: '<p>Om oss</p><img src="/team.jpg" />' },
    ];
    const { report } = await runSeoPublishPass(files, { siteUrl: SITE_URL });
    const remainingIds = report.remaining.map((f) => f.id);
    expect(remainingIds).toContain("missing-h1");
    expect(remainingIds).toContain("image-missing-alt");
    expect(report.improvements.some((i) => i.findingId === "missing-h1")).toBe(false);
  });

  it("says why the copy pass did not run", async () => {
    const { report } = await runSeoPublishPass(baselineProject(), { siteUrl: SITE_URL });
    expect(report.llmSkippedReason).toBe("copy_pass_disabled");
  });
});

describe("keepOnlyRealChanges", () => {
  it("drops an improvement whose file is byte-identical", () => {
    const before = [{ name: "a.tsx", content: "same" }];
    const after = [{ name: "a.tsx", content: "same" }];
    const kept = keepOnlyRealChanges(before, after, [
      { findingId: "missing-html-lang", file: "a.tsx", change: "…", by: "deterministic" },
    ]);
    expect(kept).toEqual([]);
  });

  it("keeps a newly added file", () => {
    const kept = keepOnlyRealChanges(
      [],
      [{ name: "app/robots.ts", content: "x" }],
      [{ findingId: "missing-robots", file: "app/robots.ts", change: "…", by: "deterministic" }],
    );
    expect(kept).toHaveLength(1);
  });
});

describe("src/app routing", () => {
  it("rewrites a src/app placeholder in place instead of deleting it", async () => {
    // Deleting and letting the injector re-create the file would write
    // `app/robots.ts` next to a removed `src/app/robots.ts` — Next.js reads
    // neither, so the site would end up with no metadata route at all while
    // the post-pass audit looked clean.
    const files = [
      { name: "src/app/layout.tsx", content: LAYOUT },
      { name: "src/app/page.tsx", content: "<h1>Klippoteket</h1>" },
      { name: "src/app/robots.ts", content: BASELINE_ROBOTS },
      { name: "src/app/sitemap.ts", content: BASELINE_SITEMAP },
    ];
    const { files: shipped } = await runSeoPublishPass(files, { siteUrl: SITE_URL });

    const robots = shipped.find((f) => f.name === "src/app/robots.ts");
    expect(robots, "src/app/robots.ts must survive the pass").toBeDefined();
    expect(robots?.content).toContain(SITE_URL);
    expect(robots?.content).not.toContain(PLACEHOLDER_SITE_URL);
    expect(shipped.find((f) => f.name === "src/app/sitemap.ts")?.content).toContain(SITE_URL);
  });

  it("injects into src/app rather than creating a second app directory", async () => {
    // Next.js refuses a project with both `app/` and `src/app/`. Writing the
    // injector's hardcoded `app/robots.ts` next to `src/app/` would break the
    // build of a site that was merely missing a sitemap.
    const files = [
      { name: "src/app/layout.tsx", content: LAYOUT },
      { name: "src/app/page.tsx", content: "<h1>Klippoteket</h1>" },
    ];
    const { files: shipped, report } = await runSeoPublishPass(files, { siteUrl: SITE_URL });

    expect(shipped.some((f) => f.name.startsWith("app/"))).toBe(false);
    expect(shipped.find((f) => f.name === "src/app/robots.ts")?.content).toContain(SITE_URL);
    expect(shipped.find((f) => f.name === "src/app/sitemap.ts")).toBeDefined();
    expect(report.improvements.every((i) => !i.file.startsWith("app/"))).toBe(true);
  });
});

describe("resolveHtmlLang", () => {
  it("prefers an explicit language", () => {
    expect(resolveHtmlLang("en", "sv_SE")).toBe("en");
  });

  it("falls back to the brand locale, converted to BCP-47", () => {
    // Brand locale allows the Open Graph underscore form; `lang` does not.
    expect(resolveHtmlLang(undefined, "en_US")).toBe("en-US");
    expect(resolveHtmlLang(undefined, "en-GB")).toBe("en-GB");
  });

  it("falls back to Swedish only when nothing says otherwise", () => {
    expect(resolveHtmlLang(undefined, undefined)).toBe("sv");
    expect(resolveHtmlLang(undefined, "   ")).toBe("sv");
  });
});

describe("brand locale reaches html lang", () => {
  it("does not stamp lang=sv on an English-branded site", async () => {
    const { files: shipped } = await runSeoPublishPass(baselineProject(), {
      siteUrl: SITE_URL,
      brand: { locale: "en_US" },
    });
    const layout = shipped.find((f) => f.name === "app/layout.tsx");
    expect(layout?.content).toContain('<html lang="en-US"');
    expect(layout?.content).not.toContain('<html lang="sv"');
  });
});

describe("addHtmlLang", () => {
  it("adds lang when missing and preserves other attributes", () => {
    expect(addHtmlLang('<html className="dark">', "sv")).toBe(
      '<html lang="sv" className="dark">',
    );
  });

  it("leaves an existing lang alone", () => {
    // Overriding a deliberate choice on a site whose language we cannot read
    // would be worse than the finding.
    const source = '<html lang="en">';
    expect(addHtmlLang(source, "sv")).toBe(source);
  });
});

describe("audit and pass agree", () => {
  it("the pass's before-audit equals a standalone audit of the same files", () => {
    const files = baselineProject();
    const standalone = auditProjectSeo(files.map((f) => ({ path: f.name, content: f.content })));
    return runSeoPublishPass(files, { siteUrl: SITE_URL }).then(({ report }) => {
      expect(report.before.findings.map((f) => f.id)).toEqual(
        standalone.findings.map((f) => f.id),
      );
    });
  });
});
