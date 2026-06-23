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

  it("returns all routes and flags orphans as unreachable (listed after reachable)", () => {
    const routes = derivePreviewRoutes(files);
    const byRoute = Object.fromEntries(routes.map((r) => [r.route, r]));
    expect(Object.keys(byRoute).sort()).toEqual([
      "/",
      "/about",
      "/blog",
      "/blog/[slug]",
      "/secret",
    ]);
    expect(byRoute["/about"]?.reachable).toBe(true);
    // The orphan page file is still listed, flagged unreachable, and sorted last.
    expect(byRoute["/secret"]?.reachable).toBe(false);
    expect(routes[routes.length - 1]?.route).toBe("/secret");
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
  it("flags an orphan whose only inbound link is its own self-link as unreachable", () => {
    const byRoute = Object.fromEntries(
      derivePreviewRoutes([
        { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
        // Orphan: the single link to /old lives inside /old's own page file.
        { name: "app/old/page.tsx", content: `<a href="/old">Jag själv</a>` },
      ]).map((r) => [r.route, r]),
    );
    expect(byRoute["/"]?.reachable).toBe(true);
    expect(byRoute["/old"]).toBeDefined();
    expect(byRoute["/old"]?.reachable).toBe(false);
  });

  it("flags an orphan kept alive only by a co-located page-local nav as unreachable", () => {
    const byRoute = Object.fromEntries(
      derivePreviewRoutes([
        { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
        { name: "app/old/page.tsx", content: "export default function P(){return null;}" },
        // Page-local nav copied into the orphan's own subtree links back to /old.
        { name: "app/old/nav.tsx", content: `<a href="/old">Tillbaka</a>` },
      ]).map((r) => [r.route, r]),
    );
    expect(byRoute["/old"]).toBeDefined();
    expect(byRoute["/old"]?.reachable).toBe(false);
  });

  it("marks a page linked from a shared header (outside the route tree) reachable", () => {
    const byRoute = Object.fromEntries(
      derivePreviewRoutes([
        { name: "app/page.tsx", content: "export default function P(){return null;}" },
        { name: "app/old/page.tsx", content: "export default function P(){return null;}" },
        // Shared header belongs to no route subtree → counts as an external source.
        { name: "components/site-header.tsx", content: `<a href="/old">Gammalt</a>` },
      ]).map((r) => [r.route, r]),
    );
    expect(byRoute["/old"]?.reachable).toBe(true);
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

  it("flags a dynamic route linked only from within its own subtree as unreachable", () => {
    const byRoute = Object.fromEntries(
      derivePreviewRoutes([
        { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
        // /shop/[id] is referenced only by a pagination link inside itself.
        { name: "app/shop/[id]/page.tsx", content: `<a href="/shop/42">Nästa</a>` },
      ]).map((r) => [r.route, r]),
    );
    expect(byRoute["/shop/[id]"]).toBeDefined();
    expect(byRoute["/shop/[id]"]?.reachable).toBe(false);
  });

  it("surfaces a freshly added page that has no inbound nav link (BB-1)", () => {
    // Reproduces the add-page-without-auto-nav case: the new page exists but
    // nothing links to it. It must still be listed (flagged unreachable) so the
    // user can see/open/remove it instead of it becoming an invisible dead end.
    const byRoute = Object.fromEntries(
      derivePreviewRoutes([
        { name: "app/page.tsx", content: `<a href="/">Hem</a>` },
        { name: "app/about/page.tsx", content: `<a href="/">Tillbaka</a>` },
      ]).map((r) => [r.route, r]),
    );
    expect(byRoute["/about"]).toBeDefined();
    expect(byRoute["/about"]?.reachable).toBe(false);
    expect(byRoute["/about"]?.navigable).toBe(true);
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
