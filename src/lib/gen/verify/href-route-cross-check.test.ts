import { describe, expect, it } from "vitest";
import {
  crossCheckHrefsAgainstRoutes,
  crossCheckRoutesAgainstHrefs,
  extractHrefsFromFiles,
  formatMismatchMessage,
  formatUnlinkedRouteMessage,
  isNavSourceFile,
  type HrefRouteMismatch,
} from "./href-route-cross-check";
import { runFinalizePreflightAll } from "@/lib/gen/stream/finalize-preflight/passes";

const file = (path: string, content: string) => {
  const ext = path.split(".").pop() ?? "tsx";
  return { path, content, language: ext };
};

describe("extractHrefsFromFiles", () => {
  it("extracts plain string href, JSX-attribute string, and template-literal href", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/blog-card.tsx",
        [
          `import Link from "next/link";`,
          `export function BlogCard({ slug }: { slug: string }) {`,
          `  return (`,
          `    <Link href={\`/blog/\${slug}\`} className="card">`,
          `      <a href="/blogg">Listsida</a>`,
          `      <a href={"/about"}>About</a>`,
          `    </Link>`,
          `  );`,
          `}`,
        ].join("\n"),
      ),
    ]);

    const raws = hrefs.map((h) => h.raw);
    expect(raws).toContain("/blog/");
    expect(raws).toContain("/blogg");
    expect(raws).toContain("/about");
    const dynamic = hrefs.find((h) => h.raw === "/blog/");
    expect(dynamic?.isDynamic).toBe(true);
    expect(dynamic?.basePath).toBe("/blog");
    const staticOne = hrefs.find((h) => h.raw === "/blogg");
    expect(staticOne?.isDynamic).toBe(false);
  });

  it("extracts router.push and redirect targets", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "app/page.tsx",
        [
          `"use client";`,
          `import { useRouter } from "next/navigation";`,
          `export default function Page() {`,
          `  const router = useRouter();`,
          `  return <button onClick={() => router.push("/dashboard")}>Go</button>;`,
          `}`,
        ].join("\n"),
      ),
      file(
        "app/legacy/page.tsx",
        [
          `import { redirect } from "next/navigation";`,
          `export default function Legacy() {`,
          `  redirect("/blogg");`,
          `}`,
        ].join("\n"),
      ),
    ]);
    const raws = hrefs.map((h) => h.raw);
    expect(raws).toContain("/dashboard");
    expect(raws).toContain("/blogg");
  });

  it("ignores externals, mailto/tel, anchors, /api and /_next", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/footer.tsx",
        [
          `<a href="https://example.com">External</a>`,
          `<a href="mailto:hi@example.com">Mail</a>`,
          `<a href="tel:+46123">Call</a>`,
          `<a href="#top">Anchor</a>`,
          `<a href="/api/feed">API</a>`,
          `<a href="/_next/static/foo">Internal</a>`,
        ].join("\n"),
      ),
    ]);
    expect(hrefs).toEqual([]);
  });

  it("treats /#section, /# and /?query as same-page targets and skips them", () => {
    // Pure hash and query targets resolve to pathname "/" — flagging them as
    // mismatches against the actual routes is noise, not signal.
    const hrefs = extractHrefsFromFiles([
      file(
        "components/header.tsx",
        [
          `<a href="/#hero">Hero</a>`,
          `<a href="/#">Top</a>`,
          `<a href="/?ref=nav">Home with ref</a>`,
        ].join("\n"),
      ),
    ]);
    expect(hrefs).toEqual([]);
  });

  it("skips non-JSX/TSX files even if they contain href-looking strings", () => {
    const hrefs = extractHrefsFromFiles([
      file("lib/site.ts", `export const latestPostPath = "/blog/foo";`),
      file("globals.css", `a[href="/foo"] { color: red; }`),
      file("README.md", `See [the post](/blogg/foo)`),
    ]);
    expect(hrefs).toEqual([]);
  });

  it("extracts object-literal href: entries used by navItems arrays", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/dashboard-sidebar.tsx",
        `const navItems = [
  { label: "Översikt", href: "/", icon: LayoutDashboard },
  { label: "Analys", href: "/analytics", icon: BarChart3 },
];`,
      ),
    ]);
    expect(hrefs.map((h) => h.raw)).toEqual(["/", "/analytics"]);
  });

  it("extracts nav-array href: when Link only receives item.href (ecommerce-style)", () => {
    // Scaffold menus store paths in objects and render <Link href={item.href}>.
    // JSX-attribute extractors miss that; object-literal `href: "/..."` must catch it.
    const hrefs = extractHrefsFromFiles([
      file(
        "components/site-header.tsx",
        [
          `import Link from "next/link";`,
          `const navItems = [`,
          `  { label: "Hem", href: "/" },`,
          `  { label: "Produkter", href: "/products" },`,
          `  { label: "Kategorier", href : "/categories" },`,
          `  { label: "Om oss", href: "/om" },`,
          `  { label: "Åtgärder", href: "/åtgärder" },`,
          `];`,
          `export function SiteHeader() {`,
          `  return (`,
          `    <nav>`,
          `      {navItems.map((item) => (`,
          `        <Link key={item.href} href={item.href}>{item.label}</Link>`,
          `      ))}`,
          `    </nav>`,
          `  );`,
          `}`,
        ].join("\n"),
      ),
    ]);
    const raws = hrefs.map((h) => h.raw);
    expect(raws).toContain("/categories");
    expect(raws).toContain("/om");
    expect(raws).toContain("/åtgärder");
    expect(raws).toContain("/products");
    expect(raws).toContain("/");
  });

  it("captures line numbers (1-based)", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/header.tsx",
        [
          `// line 1`,
          `// line 2`,
          `<a href="/contact">Contact</a>`, // line 3
        ].join("\n"),
      ),
    ]);
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]?.line).toBe(3);
  });
});

describe("crossCheckHrefsAgainstRoutes", () => {
  it("flags /blog/${slug} when only /blogg and /blog/slug literal routes exist", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/blog-card.tsx",
        `<Link href={\`/blog/\${post.slug}\`}>Read</Link>`,
      ),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, [
      "/",
      "/blogg",
      "/blog/slug", // literal segment, NOT dynamic
    ]);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.basePath).toBe("/blog");
    expect(mismatches[0]?.suggestion).toBe("/blogg");
  });

  it("does NOT flag /blogg/${slug} when /blogg/[slug] dynamic route exists", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "app/page.tsx",
        `<Link href={\`/blogg/\${slug}\`}>Read</Link>`,
      ),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, [
      "/",
      "/blogg",
      "/blogg/[slug]",
    ]);
    expect(mismatches).toEqual([]);
  });

  it("does NOT flag static href /about when /about route exists", () => {
    const hrefs = extractHrefsFromFiles([
      file("components/header.tsx", `<a href="/about">About</a>`),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, ["/", "/about"]);
    expect(mismatches).toEqual([]);
  });

  it("flags static /blog when only /blogg exists, with suggestion", () => {
    const hrefs = extractHrefsFromFiles([
      file("components/header.tsx", `<a href="/blog">Blog</a>`),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, ["/", "/blogg"]);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.suggestion).toBe("/blogg");
  });

  it("returns null suggestion when no known route is within Levenshtein 2", () => {
    const hrefs = extractHrefsFromFiles([
      file("components/header.tsx", `<a href="/totally-unrelated-path">Go</a>`),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, ["/", "/blogg"]);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.suggestion).toBeNull();
  });

  it("does NOT flag static href when matching dynamic route covers it", () => {
    // href="/blogg/foo" against dynamic /blogg/[slug] — pure static href, should match.
    const hrefs = extractHrefsFromFiles([
      file("components/seed.tsx", `<a href="/blogg/foo">Seeded link</a>`),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, [
      "/",
      "/blogg",
      "/blogg/[slug]",
    ]);
    expect(mismatches).toEqual([]);
  });

  it("does NOT flag /about?ref=foo or /about#cta when /about route exists", () => {
    // Query strings and hash fragments are irrelevant to Next.js route
    // resolution — the cross-check must strip them before matching, otherwise
    // every CTA tracking-param link on a real route looks like a typo.
    const hrefs = extractHrefsFromFiles([
      file(
        "components/cta.tsx",
        [
          `<a href="/about?ref=nav">About</a>`,
          `<a href="/about#cta">About CTA</a>`,
          `<a href="/about?ref=nav#cta">Both</a>`,
        ].join("\n"),
      ),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, ["/", "/about"]);
    expect(mismatches).toEqual([]);
  });

  it("still flags /unknown?ref=foo when no matching route exists", () => {
    // Stripping query/hash must not blind the check to genuine typos.
    const hrefs = extractHrefsFromFiles([
      file("components/cta.tsx", `<a href="/about?ref=nav">About</a>`),
    ]);
    const mismatches = crossCheckHrefsAgainstRoutes(hrefs, ["/", "/om"]);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.basePath).toBe("/about");
  });

  it("does NOT crash on empty inputs", () => {
    expect(crossCheckHrefsAgainstRoutes([], [])).toEqual([]);
    expect(crossCheckHrefsAgainstRoutes([], ["/", "/blogg"])).toEqual([]);
  });
});

describe("formatMismatchMessage", () => {
  it("includes file:line, raw href, and suggestion when available", () => {
    const mismatch: HrefRouteMismatch = {
      file: "components/blog-card.tsx",
      line: 12,
      raw: "/blog/",
      basePath: "/blog",
      isDynamic: true,
      suggestion: "/blogg",
    };
    const msg = formatMismatchMessage(mismatch);
    expect(msg).toContain("components/blog-card.tsx:12");
    expect(msg).toContain("/blog/");
    expect(msg).toContain('Did you mean "/blogg"?');
  });

  it("omits suggestion clause when none was found", () => {
    const mismatch: HrefRouteMismatch = {
      file: "components/header.tsx",
      line: 4,
      raw: "/foo-bar-baz",
      basePath: "/foo-bar-baz",
      isDynamic: false,
      suggestion: null,
    };
    const msg = formatMismatchMessage(mismatch);
    expect(msg).toContain("/foo-bar-baz");
    expect(msg).not.toContain("Did you mean");
  });
});

describe("crossCheckRoutesAgainstHrefs", () => {
  it("flags a planned route that no navigation href points to", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/dashboard-sidebar.tsx",
        `const navItems = [
  { label: "Hem", href: "/", icon: LayoutDashboard },
];`,
      ),
    ]);
    const unlinked = crossCheckRoutesAgainstHrefs(["/", "/dashboard"], hrefs);
    expect(unlinked.map((entry) => entry.path)).toEqual(["/dashboard"]);
    expect(formatUnlinkedRouteMessage(unlinked[0]!)).toContain("/dashboard");
  });

  it("does not flag a planned route that appears as href: in navItems", () => {
    const hrefs = extractHrefsFromFiles([
      file(
        "components/dashboard-sidebar.tsx",
        `const navItems = [
  { label: "Hem", href: "/", icon: LayoutDashboard },
  { label: "Översikt", href: "/dashboard", icon: LayoutDashboard },
];`,
      ),
    ]);
    expect(crossCheckRoutesAgainstHrefs(["/", "/dashboard"], hrefs)).toEqual([]);
  });

  it("counts hrefs from components/navigation/index.tsx in the reverse check", () => {
    expect(isNavSourceFile("components/navigation/index.tsx")).toBe(true);
    expect(isNavSourceFile("components/widgets/index.tsx")).toBe(false);
    const hrefs = extractHrefsFromFiles([
      file(
        "components/navigation/index.tsx",
        `export function Nav() { return <a href="/about">Om</a>; }`,
      ),
    ]).filter((entry) => isNavSourceFile(entry.file));
    expect(hrefs.map((entry) => entry.basePath)).toEqual(["/about"]);
    expect(
      crossCheckRoutesAgainstHrefs(["/", "/about"], hrefs).map((entry) => entry.path),
    ).toEqual(["/"]);
  });
});

describe("runFinalizePreflightAll reverse nav gate", () => {
  it("warns per unlinked planned route when a nav file has no hrefs", () => {
    const result = runFinalizePreflightAll({
      files: [
        file(
          "components/dashboard-sidebar.tsx",
          `export function DashboardSidebar() { return <aside>Ingen länk</aside>; }`,
        ),
      ],
      actualRoutes: ["/", "/dashboard"],
      plannedRoutePaths: ["/", "/dashboard"],
    });
    expect(result.unlinkedPlannedRoutes.map((entry) => entry.path)).toEqual([
      "/",
      "/dashboard",
    ]);
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        formatUnlinkedRouteMessage({ path: "/" }),
        formatUnlinkedRouteMessage({ path: "/dashboard" }),
      ]),
    );
  });
});
