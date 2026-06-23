import { describe, expect, it } from "vitest";
import {
  collectInternalLinkPaths,
  derivePreviewRoutes,
  extractPreviewRoutesFromFileNames,
  isRouteReachable,
  normalizeLinkPath,
} from "./preview-route-helpers";

describe("normalizeLinkPath", () => {
  it("keeps a plain internal path", () => {
    expect(normalizeLinkPath("/about")).toBe("/about");
  });
  it("strips query and hash", () => {
    expect(normalizeLinkPath("/about?ref=nav#top")).toBe("/about");
  });
  it("collapses template interpolation to a trailing-slash prefix", () => {
    expect(normalizeLinkPath("/blog/${slug}")).toBe("/blog/");
  });
  it("returns / for root", () => {
    expect(normalizeLinkPath("/")).toBe("/");
  });
  it("ignores assets, api routes and external paths", () => {
    expect(normalizeLinkPath("/logo.svg")).toBeNull();
    expect(normalizeLinkPath("/api/users")).toBeNull();
    expect(normalizeLinkPath("//cdn.example.com/x")).toBeNull();
  });
});

describe("collectInternalLinkPaths", () => {
  it("collects hrefs from JSX and data arrays", () => {
    const links = collectInternalLinkPaths([
      `<Link href="/about">Om</Link>`,
      `const nav = [{ label: "Blogg", href: "/blog" }];`,
      `<a href={\`/blog/\${post.slug}\`}>Läs</a>`,
    ]);
    expect(links.has("/about")).toBe(true);
    expect(links.has("/blog")).toBe(true);
    expect(links.has("/blog/")).toBe(true);
  });
});

describe("isRouteReachable", () => {
  const links = new Set(["/", "/about", "/blog", "/blog/"]);
  it("treats home as always reachable", () => {
    expect(isRouteReachable({ route: "/", dynamic: false }, new Set())).toBe(true);
  });
  it("requires a link for a static route", () => {
    expect(isRouteReachable({ route: "/about", dynamic: false }, links)).toBe(true);
    expect(isRouteReachable({ route: "/secret", dynamic: false }, links)).toBe(false);
  });
  it("treats a dynamic route as reachable when its prefix has child links", () => {
    expect(isRouteReachable({ route: "/blog/[slug]", dynamic: true }, links)).toBe(true);
    expect(isRouteReachable({ route: "/shop/[id]", dynamic: true }, links)).toBe(false);
  });
});

describe("derivePreviewRoutes", () => {
  const files = [
    {
      name: "app/page.tsx",
      content: `import Link from "next/link";
const nav = [
  { label: "Hem", href: "/" },
  { label: "Om", href: "/about" },
  { label: "Blogg", href: "/blog" },
];
export default function Page() {
  return <a href={\`/blog/\${slug}\`}>x</a>;
}`,
    },
    { name: "app/about/page.tsx", content: "export default function P(){return null;}" },
    { name: "app/blog/page.tsx", content: "export default function P(){return null;}" },
    { name: "app/blog/[slug]/page.tsx", content: "export default function P(){return null;}" },
    // Orphan left behind by a union-merge follow-up — no internal link points here.
    { name: "app/secret/page.tsx", content: "export default function P(){return null;}" },
    { name: "components/site-header.tsx", content: "export function H(){return null;}" },
  ];

  it("includes reachable routes and excludes orphans", () => {
    const routes = derivePreviewRoutes(files);
    const byRoute = Object.fromEntries(routes.map((r) => [r.route, r]));
    expect(Object.keys(byRoute).sort()).toEqual(["/", "/about", "/blog", "/blog/[slug]"]);
    expect(byRoute["/secret"]).toBeUndefined();
  });

  it("marks dynamic routes non-navigable with a readable label", () => {
    const dynamic = derivePreviewRoutes(files).find((r) => r.route === "/blog/[slug]");
    expect(dynamic?.dynamic).toBe(true);
    expect(dynamic?.navigable).toBe(false);
    expect(dynamic?.label).toBe("/blog/:slug");
  });

  it("puts home first", () => {
    expect(derivePreviewRoutes(files)[0]?.route).toBe("/");
  });
});

describe("derivePreviewRoutes — reachability from files outside the route's own subtree", () => {
  it("excludes an orphan page whose only inbound link is its own self-link", () => {
    const routes = derivePreviewRoutes([
      { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
      // Orphan: the single link to /old lives inside /old's own page file.
      { name: "app/old/page.tsx", content: `<a href="/old">Jag själv</a>` },
    ]).map((r) => r.route);
    expect(routes).toContain("/");
    expect(routes).not.toContain("/old");
  });

  it("excludes an orphan kept alive only by a co-located page-local nav", () => {
    const routes = derivePreviewRoutes([
      { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
      { name: "app/old/page.tsx", content: "export default function P(){return null;}" },
      // Page-local nav copied into the orphan's own subtree links back to /old.
      { name: "app/old/nav.tsx", content: `<a href="/old">Tillbaka</a>` },
    ]).map((r) => r.route);
    expect(routes).not.toContain("/old");
  });

  it("includes a page linked from a shared header outside the route tree", () => {
    const routes = derivePreviewRoutes([
      { name: "app/page.tsx", content: "export default function P(){return null;}" },
      { name: "app/old/page.tsx", content: "export default function P(){return null;}" },
      // Shared header belongs to no route subtree → counts as an external source.
      { name: "components/site-header.tsx", content: `<a href="/old">Gammalt</a>` },
    ]).map((r) => r.route);
    expect(routes).toContain("/old");
  });

  it("always returns home even with no internal links at all", () => {
    const routes = derivePreviewRoutes([
      { name: "app/page.tsx", content: "export default function P(){return null;}" },
    ]).map((r) => r.route);
    expect(routes).toEqual(["/"]);
  });

  it("keeps a dynamic route reachable via a concrete link outside its own files", () => {
    const routes = derivePreviewRoutes([
      {
        name: "app/page.tsx",
        content: `const nav = [{ href: "/" }, { href: "/blog" }];`,
      },
      // Concrete post link lives in the blog index, not under [slug].
      { name: "app/blog/page.tsx", content: `<a href="/blog/hello">Läs</a>` },
      { name: "app/blog/[slug]/page.tsx", content: "export default function P(){return null;}" },
    ]).map((r) => r.route);
    expect(routes).toContain("/blog");
    expect(routes).toContain("/blog/[slug]");
  });

  it("drops a dynamic route linked only from within its own subtree", () => {
    const routes = derivePreviewRoutes([
      { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
      // /shop/[id] is referenced only by a pagination link inside itself.
      { name: "app/shop/[id]/page.tsx", content: `<a href="/shop/42">Nästa</a>` },
    ]).map((r) => r.route);
    expect(routes).not.toContain("/shop/[id]");
  });
});

describe("extractPreviewRoutesFromFileNames (legacy)", () => {
  it("still returns only static routes", () => {
    expect(
      extractPreviewRoutesFromFileNames([
        "app/page.tsx",
        "app/about/page.tsx",
        "app/blog/[slug]/page.tsx",
      ]),
    ).toEqual(["/", "/about"]);
  });
});
