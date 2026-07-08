import { describe, expect, it } from "vitest";
import {
  buildAddNavLinkOps,
  buildNewPageContent,
  buildRemoveNavLinkOps,
  defaultLabelForRoute,
  detectAppDir,
  findRouteFilePaths,
  normalizePageRouteInput,
  pageFilePathForRoute,
  routeDirForRoute,
  routeHasPageFile,
  stripRouteFromContent,
} from "./preview-page-ops";

describe("normalizePageRouteInput", () => {
  it("normalizes plain names", () => {
    expect(normalizePageRouteInput("About")).toBe("/about");
    expect(normalizePageRouteInput("/Om Oss")).toBe("/om-oss");
  });
  it("transliterates Swedish characters", () => {
    expect(normalizePageRouteInput("Tjänster")).toBe("/tjanster");
    expect(normalizePageRouteInput("Köp")).toBe("/kop");
  });
  it("supports nested segments", () => {
    expect(normalizePageRouteInput("tjanster/pris")).toBe("/tjanster/pris");
  });
  it("rejects dynamic, reserved and empty input", () => {
    expect(normalizePageRouteInput("blog/[slug]")).toBeNull();
    expect(normalizePageRouteInput("api")).toBeNull();
    expect(normalizePageRouteInput("   ")).toBeNull();
  });
});

describe("route <-> file path", () => {
  it("maps routes to page files", () => {
    expect(pageFilePathForRoute("/about")).toBe("app/about/page.tsx");
    expect(pageFilePathForRoute("/")).toBe("app/page.tsx");
    expect(routeDirForRoute("/tjanster/pris")).toBe("app/tjanster/pris");
  });
  it("honors a src/app prefix", () => {
    expect(pageFilePathForRoute("/about", "src/app")).toBe("src/app/about/page.tsx");
    expect(routeDirForRoute("/about", "src/app")).toBe("src/app/about");
  });
  it("derives a readable label", () => {
    expect(defaultLabelForRoute("/about-us")).toBe("About Us");
  });
});

describe("detectAppDir", () => {
  it("returns app for an app/-rooted project", () => {
    expect(detectAppDir([{ name: "app/page.tsx" }, { name: "app/about/page.tsx" }])).toBe("app");
  });
  it("returns src/app only when the project is exclusively src/app-rooted", () => {
    expect(detectAppDir([{ name: "src/app/page.tsx" }, { name: "src/app/about/page.tsx" }])).toBe(
      "src/app",
    );
  });
  it("defaults to app when both are present (avoids a split tree)", () => {
    expect(detectAppDir([{ name: "app/page.tsx" }, { name: "src/app/legacy/page.tsx" }])).toBe(
      "app",
    );
  });
});

describe("routeHasPageFile", () => {
  it("detects an existing page under either prefix", () => {
    expect(routeHasPageFile([{ name: "app/about/page.tsx" }], "/about")).toBe(true);
    expect(routeHasPageFile([{ name: "src/app/about/page.tsx" }], "/about")).toBe(true);
    expect(routeHasPageFile([{ name: "app/blog/page.tsx" }], "/about")).toBe(false);
  });

  it("treats a grouped route as the same page (rejects a duplicate)", () => {
    expect(routeHasPageFile([{ name: "app/(marketing)/about/page.tsx" }], "/about")).toBe(true);
    expect(routeHasPageFile([{ name: "src/app/(marketing)/about/page.tsx" }], "/about")).toBe(
      true,
    );
    // A parallel/intercept slot also contributes no URL segment.
    expect(routeHasPageFile([{ name: "app/@modal/about/page.tsx" }], "/about")).toBe(true);
  });

  it("matches a Pages Router page file", () => {
    expect(routeHasPageFile([{ name: "pages/about.tsx" }], "/about")).toBe(true);
    expect(routeHasPageFile([{ name: "pages/index.tsx" }], "/")).toBe(true);
    expect(routeHasPageFile([{ name: "pages/blog.tsx" }], "/about")).toBe(false);
  });
});

describe("findRouteFilePaths", () => {
  const files = [
    { name: "app/page.tsx" },
    { name: "app/blog/page.tsx" },
    { name: "app/blog/[slug]/page.tsx" },
    { name: "app/about/page.tsx" },
    { name: "components/site-header.tsx" },
  ];
  it("collects a route subtree", () => {
    expect(findRouteFilePaths(files, "/blog").sort()).toEqual([
      "app/blog/[slug]/page.tsx",
      "app/blog/page.tsx",
    ]);
  });
  it("never collects the home subtree", () => {
    expect(findRouteFilePaths(files, "/")).toEqual([]);
  });
});

describe("findRouteFilePaths (route-aware)", () => {
  it("collects a grouped route subtree incl. colocated + nested descendants", () => {
    const files = [
      { name: "app/(marketing)/page.tsx" }, // home via group — must not be swept
      { name: "app/(marketing)/about/page.tsx" },
      { name: "app/(marketing)/about/Hero.tsx" },
      { name: "app/(marketing)/about/team/page.tsx" },
      { name: "components/nav.tsx" },
    ];
    expect(findRouteFilePaths(files, "/about")).toEqual([
      "app/(marketing)/about/Hero.tsx",
      "app/(marketing)/about/page.tsx",
      "app/(marketing)/about/team/page.tsx",
    ]);
  });

  it("collects a grouped src/app route subtree", () => {
    const files = [
      { name: "src/app/(shop)/about/page.tsx" },
      { name: "src/app/(shop)/about/parts/Card.tsx" },
      { name: "src/app/(shop)/page.tsx" },
    ];
    expect(findRouteFilePaths(files, "/about")).toEqual([
      "src/app/(shop)/about/page.tsx",
      "src/app/(shop)/about/parts/Card.tsx",
    ]);
  });

  it("collects a Pages Router file plus its nested subtree", () => {
    const files = [
      { name: "pages/index.tsx" },
      { name: "pages/about.tsx" },
      { name: "pages/about/team.tsx" },
      { name: "pages/blog.tsx" },
    ];
    expect(findRouteFilePaths(files, "/about")).toEqual([
      "pages/about.tsx",
      "pages/about/team.tsx",
    ]);
  });

  it("includes every grouped page file that maps to the same route", () => {
    const files = [
      { name: "app/(a)/about/page.tsx" },
      { name: "app/(b)/about/page.tsx" },
    ];
    expect(findRouteFilePaths(files, "/about")).toEqual([
      "app/(a)/about/page.tsx",
      "app/(b)/about/page.tsx",
    ]);
  });

  it("never collects the home subtree even under a route group", () => {
    const files = [{ name: "app/(marketing)/page.tsx" }, { name: "app/page.tsx" }];
    expect(findRouteFilePaths(files, "/")).toEqual([]);
  });
});

describe("buildNewPageContent", () => {
  it("produces a valid default export page", () => {
    const content = buildNewPageContent("/om", "Om");
    expect(content).toContain("export default function Page()");
    expect(content).toContain("Om");
    expect(content).toContain('href="/"');
  });
});

describe("stripRouteFromContent", () => {
  it("removes a data-array nav entry", () => {
    const content = `const nav = [
  { label: "Hem", href: "/" },
  { label: "Blogg", href: "/blog" },
  { label: "Om", href: "/about" },
];`;
    const next = stripRouteFromContent(content, "/blog");
    expect(next).not.toContain('href: "/blog"');
    expect(next).toContain('href: "/about"');
    expect(next).toContain('href: "/"');
  });

  it("removes a JSX Link element", () => {
    const content = `<nav><Link href="/blog">Blogg</Link><Link href="/about">Om</Link></nav>`;
    const next = stripRouteFromContent(content, "/blog");
    expect(next).not.toContain('href="/blog"');
    expect(next).toContain('href="/about"');
  });

  it("removes normalized href variants (trailing slash / query / hash)", () => {
    const content = `<nav>
  <Link href="/blog">Blogg</Link>
  <Link href="/blog/">Trailing</Link>
  <Link href="/blog?ref=nav">Query</Link>
  <Link href="/blog#top">Hash</Link>
  <Link href="/blogger">Blogger</Link>
</nav>`;
    const next = stripRouteFromContent(content, "/blog");
    expect(next).not.toContain('href="/blog"');
    expect(next).not.toContain('href="/blog/"');
    expect(next).not.toContain('href="/blog?ref=nav"');
    expect(next).not.toContain('href="/blog#top"');
    // A longer sibling segment must survive.
    expect(next).toContain('href="/blogger"');
  });

  it("leaves a standalone href object intact but removes an array element", () => {
    const standalone = `const cta = { label: "Book", href: "/x" };`;
    expect(stripRouteFromContent(standalone, "/x")).toBe(standalone);

    const arr = `const nav = [ { label: "Home", href: "/" }, { label: "X", href: "/x" } ];`;
    const next = stripRouteFromContent(arr, "/x");
    expect(next).not.toContain('href: "/x"');
    expect(next).toContain('href: "/"');
  });

  // Radix Slot regression (prod 2026-07-08, chat fb11f6b0): an empty
  // `<Button asChild></Button>` crashes at runtime with "Slot failed to slot
  // onto its children" — the wrapper must be removed together with its link.
  it("removes an asChild wrapper together with its sole-child link", () => {
    const content = `<nav>
      <Button asChild>
        <Link href="/blog">Blogg</Link>
      </Button>
      <Button asChild>
        <Link href="/about">Om</Link>
      </Button>
    </nav>`;
    const next = stripRouteFromContent(content, "/blog");
    expect(next).not.toContain('href="/blog"');
    // The now-childless wrapper must be gone too — an empty Slot crashes.
    expect(next.match(/<Button asChild>/g)).toHaveLength(1);
    expect(next).toContain('href="/about"');
  });

  it("removes only the link when the asChild wrapper has other children", () => {
    const content = `<Button asChild><Icon /><Link href="/blog">Blogg</Link></Button>`;
    const next = stripRouteFromContent(content, "/blog");
    expect(next).not.toContain('href="/blog"');
    // Wrapper is NOT the link's sole parent-child pairing → wrapper survives.
    expect(next).toContain("<Button asChild>");
    expect(next).toContain("<Icon />");
  });
});

describe("buildRemoveNavLinkOps", () => {
  it("emits a replace op for files that link to the route", () => {
    const files = [
      {
        name: "components/site-header.tsx",
        content: `const navItems = [{ label: "Blogg", href: "/blog" }, { label: "Om", href: "/about" }];`,
      },
      { name: "app/page.tsx", content: "export default function P(){return null;}" },
    ];
    const ops = buildRemoveNavLinkOps(files, "/blog");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "replace_content", path: "components/site-header.tsx" });
    if (ops[0]?.kind === "replace_content") {
      expect(ops[0].content).not.toContain('href: "/blog"');
    }
  });
});

describe("buildAddNavLinkOps", () => {
  it("inserts a new entry into a data-driven nav array", () => {
    const files = [
      {
        name: "components/site-header.tsx",
        content: `const navItems = [
  { label: "Home", href: "/" },
  { label: "Blog", href: "/blog" },
];`,
      },
    ];
    const result = buildAddNavLinkOps(files, "/kontakt", "Kontakt");
    expect(result.navUpdated).toBe(true);
    expect(result.ops).toHaveLength(1);
    if (result.ops[0]?.kind === "replace_content") {
      expect(result.ops[0].content).toContain('href: "/kontakt"');
      expect(result.ops[0].content).toContain('label: "Kontakt"');
    }
  });

  it("inserts a sibling Link when nav is literal JSX", () => {
    const files = [
      {
        name: "components/site-header.tsx",
        content: `export function H(){return <nav><Link href="/">Home</Link><Link href="/blog">Blog</Link></nav>;}`,
      },
    ];
    const result = buildAddNavLinkOps(files, "/kontakt", "Kontakt");
    expect(result.navUpdated).toBe(true);
    if (result.ops[0]?.kind === "replace_content") {
      expect(result.ops[0].content).toContain('href="/kontakt"');
    }
  });

  it("reports navUpdated false when no nav exists", () => {
    const files = [{ name: "app/page.tsx", content: "export default function P(){return <h1>Hi</h1>;}" }];
    const result = buildAddNavLinkOps(files, "/kontakt", "Kontakt");
    expect(result.navUpdated).toBe(false);
    expect(result.ops).toHaveLength(0);
  });

  it("does not corrupt a file whose only href is a standalone object", () => {
    // `insertDataNavEntry` must not append `, {…}` after a standalone object
    // (that would yield invalid JS); with no array/JSX nav it falls through.
    const files = [
      { name: "components/cta.tsx", content: `const cta = { label: "Book", href: "/x" };` },
    ];
    const result = buildAddNavLinkOps(files, "/kontakt", "Kontakt");
    expect(result.navUpdated).toBe(false);
    expect(result.ops).toHaveLength(0);
  });

  it("still inserts into a real array even when a standalone object precedes it", () => {
    const files = [
      {
        name: "components/site-header.tsx",
        content: `const cta = { label: "Book", href: "/book" };
const navItems = [
  { label: "Home", href: "/" },
  { label: "Blog", href: "/blog" },
];`,
      },
    ];
    const result = buildAddNavLinkOps(files, "/kontakt", "Kontakt");
    expect(result.navUpdated).toBe(true);
    if (result.ops[0]?.kind === "replace_content") {
      expect(result.ops[0].content).toContain('href: "/kontakt"');
      // The standalone object must be untouched.
      expect(result.ops[0].content).toContain('const cta = { label: "Book", href: "/book" };');
    }
  });

  // Radix Slot regression (prod 2026-07-08, chat fb11f6b0): inserting a
  // sibling <Link> INSIDE `<Button asChild>…</Button>` gives Slot two children
  // and crashes the preview ("Slot failed to slot onto its children" → 500).
  it("inserts AFTER an asChild wrapper, never inside it", () => {
    const files = [
      {
        name: "components/site-header.tsx",
        content: `export function H() {
  return (
    <nav>
      <Link href="/">Hem</Link>
      <Button asChild>
        <Link href="/kontakt-oss">Kontakt</Link>
      </Button>
    </nav>
  );
}`,
      },
    ];
    const result = buildAddNavLinkOps(files, "/skidor", "Skidor");
    expect(result.navUpdated).toBe(true);
    expect(result.ops[0]?.kind).toBe("replace_content");
    if (result.ops[0]?.kind === "replace_content") {
      const content = result.ops[0].content;
      expect(content).toContain('href="/skidor"');
      // The wrapper must still have exactly one child: the new link goes
      // between </Link> and </Button> in NO case.
      const wrapperInner = content.match(/<Button asChild>([\s\S]*?)<\/Button>/)?.[1] ?? "";
      expect(wrapperInner).not.toContain("/skidor");
      // New link lands after the closing wrapper tag instead.
      expect(content.indexOf('href="/skidor"')).toBeGreaterThan(content.indexOf("</Button>"));
    }
  });
});
