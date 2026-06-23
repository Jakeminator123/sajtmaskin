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
});
