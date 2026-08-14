import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { syncNavItemsFromRoutePlan } from "./sync-nav-from-route-plan";

const DASHBOARD_SIDEBAR = readFileSync(
  join(__dirname, "dashboard/files/components/dashboard-sidebar.tsx"),
  "utf8",
);
const BLOG_SITE_HEADER = readFileSync(
  join(__dirname, "blog/files/components/site-header.tsx"),
  "utf8",
);
const LANDING_SITE_HEADER = readFileSync(
  join(__dirname, "landing-page/files/components/site-header.tsx"),
  "utf8",
);
const SAAS_MARKETING_HEADER = readFileSync(
  join(__dirname, "saas-landing/files/components/marketing-header.tsx"),
  "utf8",
);
const ECOMMERCE_SITE_HEADER = readFileSync(
  join(__dirname, "ecommerce/files/components/site-header.tsx"),
  "utf8",
);
const ECOMMERCE_SITE_FOOTER = readFileSync(
  join(__dirname, "ecommerce/files/components/site-footer.tsx"),
  "utf8",
);

const SIDEBAR_SURFACE = { navSurface: "components/dashboard-sidebar.tsx" };
const HEADER_SURFACE = { navSurface: "components/site-header.tsx" };

function file(path: string, content: string): CodeFile {
  return { path, content, language: "tsx" };
}

function offertlyftetPlan(): RoutePlan {
  return {
    provenance: { primarySource: "prompt", sources: ["prompt", "scaffold"] },
    siteType: "app-shell",
    reason: "Offertlyftet-class dashboard init",
    routes: [
      { path: "/", name: "Hem", intent: "Landing", required: true },
      { path: "/logga-in", name: "Logga in", intent: "Auth", required: true },
      { path: "/dashboard", name: "Översikt", intent: "App home", required: true },
    ],
  };
}

function onePagePlan(): RoutePlan {
  return {
    provenance: { primarySource: "prompt", sources: ["prompt"] },
    siteType: "one-page",
    reason: "explicit one-page cap",
    routes: [{ path: "/", name: "Hem", intent: "Everything on one page", required: true }],
    explicitPageCount: 1,
  };
}

function extractNavHrefs(content: string): string[] {
  const hrefs: string[] = [];
  const re = /href:\s*["'](\/[^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    hrefs.push(match[1]!);
  }
  return hrefs;
}

function extractNavLabels(content: string): string[] {
  const labels: string[] = [];
  const re = /label:\s*["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    labels.push(match[1]!);
  }
  return labels;
}

describe("syncNavItemsFromRoutePlan", () => {
  it("rewrites dashboard-scaffold navItems to the route plan (Offertlyftet)", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", DASHBOARD_SIDEBAR)],
      routePlan: offertlyftetPlan(),
      scaffold: SIDEBAR_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/dashboard-sidebar.tsx"]);
    const sidebar = result.files[0]!.content;
    expect(extractNavHrefs(sidebar)).toEqual(["/", "/logga-in", "/dashboard"]);
    expect(extractNavLabels(sidebar)).toEqual(["Hem", "Logga in", "Översikt"]);
    expect(sidebar).not.toContain("/users");
    expect(sidebar).not.toContain("/analytics");
    expect(sidebar).not.toContain("/settings");
    expect(sidebar).toMatch(/import\s*\{\s*LayoutDashboard\s*\}\s*from\s*["']lucide-react["']/);
    expect(sidebar).not.toContain("Users");
    expect(sidebar).not.toContain("BarChart3");
  });

  // Granskningsfynd på diffen: import-synken ersatte hela lucide-importen —
  // en ikon som används utanför navItems (LogOut) tappades och gav en
  // runtime-ReferenceError. Behåll refererade namn, släpp bara oanvända.
  it("keeps lucide icons used outside navItems and drops only unused ones", () => {
    const withLogout = DASHBOARD_SIDEBAR.replace(
      /import \{ LayoutDashboard, BarChart3, Settings, Users \} from "lucide-react";/,
      'import { LayoutDashboard, BarChart3, Settings, Users, LogOut } from "lucide-react";',
    ).concat('\n\nexport const logoutGlyph = <LogOut className="h-4 w-4" />;\n');
    expect(withLogout).toContain("LogOut");

    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", withLogout)],
      routePlan: offertlyftetPlan(),
      scaffold: SIDEBAR_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/dashboard-sidebar.tsx"]);
    const sidebar = result.files[0]!.content;
    expect(extractNavHrefs(sidebar)).toEqual(["/", "/logga-in", "/dashboard"]);
    const importLine = sidebar.match(/import\s*\{[^}]*\}\s*from\s*["']lucide-react["'];?/)?.[0] ?? "";
    expect(importLine).toContain("LogOut");
    expect(importLine).toContain("LayoutDashboard");
    expect(importLine).not.toContain("Users");
    expect(importLine).not.toContain("BarChart3");
  });

  it("keeps \"use client\" as the first statement when lucide import is inserted", () => {
    const withoutLucide = [
      `"use client";`,
      ``,
      `import Link from "next/link";`,
      ``,
      `const navItems = [`,
      `  { label: "Översikt", href: "/", icon: LayoutDashboard },`,
      `];`,
      ``,
      `export function DashboardSidebar() {`,
      `  return <Link href="/">Hem</Link>;`,
      `}`,
    ].join("\n");

    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", withoutLucide)],
      routePlan: offertlyftetPlan(),
      scaffold: SIDEBAR_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/dashboard-sidebar.tsx"]);
    const sidebar = result.files[0]!.content;
    expect(sidebar.trimStart().startsWith('"use client"')).toBe(true);
    expect(sidebar).toMatch(
      /^(\s*)"use client";?\s*\r?\nimport \{[^}]*\} from "lucide-react";/,
    );
    expect(extractNavHrefs(sidebar)).toEqual(["/", "/logga-in", "/dashboard"]);
  });

  it("keeps aliased lucide specifiers used outside navItems", () => {
    const withAlias = DASHBOARD_SIDEBAR.replace(
      /import \{ LayoutDashboard, BarChart3, Settings, Users \} from "lucide-react";/,
      'import { LayoutDashboard, BarChart3, Settings, Users, LogOut as LogoutIcon } from "lucide-react";',
    ).concat('\n\nexport const logoutGlyph = <LogoutIcon className="h-4 w-4" />;\n');

    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", withAlias)],
      routePlan: offertlyftetPlan(),
      scaffold: SIDEBAR_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/dashboard-sidebar.tsx"]);
    const importLine =
      result.files[0]!.content.match(/import\s*\{[^}]*\}\s*from\s*["']lucide-react["'];?/)?.[0] ??
      "";
    expect(importLine).toContain("LogOut as LogoutIcon");
    expect(importLine).toContain("LayoutDashboard");
    expect(importLine).not.toContain("Users");
    expect(importLine).not.toContain("BarChart3");
  });

  it("leaves a user-rewritten sidebar (other form) untouched", () => {
    const rewritten = [
      `"use client";`,
      `import Link from "next/link";`,
      `export function DashboardSidebar() {`,
      `  return (`,
      `    <aside>`,
      `      <Link href="/">Hem</Link>`,
      `      <Link href="/custom">Anpassad</Link>`,
      `    </aside>`,
      `  );`,
      `}`,
    ].join("\n");

    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", rewritten)],
      routePlan: offertlyftetPlan(),
      scaffold: SIDEBAR_SURFACE,
    });

    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(rewritten);
  });

  it("does not rewrite on follow-up even when the scaffold form still matches", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", DASHBOARD_SIDEBAR)],
      routePlan: offertlyftetPlan(),
      isFollowUp: true,
      scaffold: SIDEBAR_SURFACE,
    });

    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(DASHBOARD_SIDEBAR);
  });

  // SM-048/SM-051: the manifest points the surface out. Without a
  // `navSurface` (auth-pages, portfolio, base-nextjs, projekt-bas-app, or a
  // scaffold-less run) nothing is guessed from filenames and nothing changes.
  it("is a no-op when the scaffold has no navSurface", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", DASHBOARD_SIDEBAR)],
      routePlan: offertlyftetPlan(),
      scaffold: {},
    });
    expect(result.changedPaths).toEqual([]);

    const noScaffold = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", DASHBOARD_SIDEBAR)],
      routePlan: offertlyftetPlan(),
      scaffold: null,
    });
    expect(noScaffold.changedPaths).toEqual([]);
  });

  it("only touches the file the navSurface points at", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [
        file("components/dashboard-sidebar.tsx", DASHBOARD_SIDEBAR),
        file("components/site-header.tsx", BLOG_SITE_HEADER),
      ],
      routePlan: offertlyftetPlan(),
      scaffold: SIDEBAR_SURFACE,
    });
    expect(result.changedPaths).toEqual(["components/dashboard-sidebar.tsx"]);
    expect(result.files[1]!.content).toBe(BLOG_SITE_HEADER);
  });
});

describe("syncNavItemsFromRoutePlan — header form ({ label, href })", () => {
  it("removes the blog header link when the plan drops /blog, keeping '/'", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-header.tsx", BLOG_SITE_HEADER)],
      routePlan: onePagePlan(),
      scaffold: HEADER_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/site-header.tsx"]);
    const header = result.files[0]!.content;
    expect(extractNavHrefs(header)).toEqual(["/"]);
    expect(header).not.toContain('href: "/blog"');
    expect(header).not.toContain("Blogg\", href");
    // Rest of the component is untouched — only the navItems array changed.
    expect(header).toContain('aria-label="Öppna meny"');
  });

  it("keeps the blog header link when the plan includes /blog", () => {
    const plan: RoutePlan = {
      ...onePagePlan(),
      routes: [
        { path: "/", name: "Hem", intent: "Landing", required: true },
        { path: "/blog", name: "Blogg", intent: "Articles", required: true },
      ],
    };
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-header.tsx", BLOG_SITE_HEADER)],
      routePlan: plan,
      scaffold: HEADER_SURFACE,
    });
    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(BLOG_SITE_HEADER);
  });

  it("never touches in-page anchors: landing-page header is a no-op", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-header.tsx", LANDING_SITE_HEADER)],
      routePlan: onePagePlan(),
      scaffold: HEADER_SURFACE,
    });
    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(LANDING_SITE_HEADER);
    expect(result.files[0]!.content).toContain("#erbjudande");
  });

  it("never touches in-page anchors: saas-landing marketing header is a no-op", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/marketing-header.tsx", SAAS_MARKETING_HEADER)],
      routePlan: onePagePlan(),
      scaffold: { navSurface: "components/marketing-header.tsx" },
    });
    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(SAAS_MARKETING_HEADER);
    expect(result.files[0]!.content).toContain("#pricing");
  });

  it("keeps mailto:, external, template and hash-on-root hrefs while dropping unplanned pages", () => {
    const header = [
      `const navItems = [`,
      `  { label: "Start", href: "/" },`,
      `  { label: "Om", href: "/om" },`,
      `  { label: "Kontakt", href: "mailto:hej@example.com" },`,
      `  { label: "Extern", href: "https://example.com" },`,
      // Protocol-relative URL is external — must survive the filter
      // (PR #986 AI-review finding F-5d7cbff1a261).
      `  { label: "CDN", href: "//cdn.example.com" },`,
      `  { label: "Sektion", href: "/#kontakt" },`,
      "  { label: \"Dynamisk\", href: `/product/${1}` },",
      `];`,
      `export function SiteHeader() { return null; }`,
    ].join("\n");
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-header.tsx", header)],
      routePlan: onePagePlan(),
      scaffold: HEADER_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/site-header.tsx"]);
    const next = result.files[0]!.content;
    expect(next).not.toContain('href: "/om"');
    expect(next).toContain('href: "/"');
    expect(next).toContain("mailto:hej@example.com");
    expect(next).toContain("https://example.com");
    expect(next).toContain("//cdn.example.com");
    expect(next).toContain('href: "/#kontakt"');
    expect(next).toContain("/product/${1}");
  });
});

describe("syncNavItemsFromRoutePlan — footerLinks form + multiple surfaces (SM-055)", () => {
  const ECOMMERCE_SURFACES = {
    navSurface: ["components/site-header.tsx", "components/site-footer.tsx"],
  };
  const FOOTER_ONLY = { navSurface: "components/site-footer.tsx" };

  function productsPlan(): RoutePlan {
    return {
      provenance: { primarySource: "prompt", sources: ["prompt", "scaffold"] },
      siteType: "brochure",
      reason: "ecommerce default catalog",
      routes: [
        { path: "/", name: "Hem", intent: "Landing", required: true },
        { path: "/products", name: "Produkter", intent: "Catalog", required: true },
      ],
    };
  }

  function storefrontPlan(): RoutePlan {
    return {
      provenance: { primarySource: "prompt", sources: ["prompt", "scaffold"] },
      siteType: "brochure",
      reason: "ecommerce with declared extras planned",
      routes: [
        { path: "/", name: "Hem", intent: "Landing", required: true },
        { path: "/products", name: "Produkter", intent: "Catalog", required: true },
        { path: "/categories", name: "Kategorier", intent: "Browse", required: false },
        { path: "/om", name: "Om oss", intent: "About", required: false },
      ],
    };
  }

  it("filters unplanned ecommerce footer links on a one-page plan and keeps '/'", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-footer.tsx", ECOMMERCE_SITE_FOOTER)],
      routePlan: onePagePlan(),
      scaffold: FOOTER_ONLY,
    });

    expect(result.changedPaths).toEqual(["components/site-footer.tsx"]);
    const footer = result.files[0]!.content;
    expect(footer).toContain('href: "/"');
    expect(footer).not.toContain('href: "/products"');
    expect(footer).not.toContain('href: "/categories"');
    expect(footer).not.toContain('href: "/om"');
    expect(footer).not.toContain("/category/category-1");
    expect(footer).not.toContain("/category/category-2");
    expect(footer).not.toContain("Butik:");
    expect(footer).toContain("Info:");
    expect(footer).toContain("[Butiksnamn]");
  });

  it("keeps /products on the default catalog plan and still drops undeclared category slugs", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-footer.tsx", ECOMMERCE_SITE_FOOTER)],
      routePlan: productsPlan(),
      scaffold: FOOTER_ONLY,
    });

    expect(result.changedPaths).toEqual(["components/site-footer.tsx"]);
    const footer = result.files[0]!.content;
    expect(footer).toContain('href: "/products"');
    expect(footer).toContain('href: "/"');
    expect(footer).not.toContain('href: "/categories"');
    expect(footer).not.toContain('href: "/om"');
    expect(footer).not.toContain("/category/category-1");
    expect(footer).not.toContain("/category/category-2");
  });

  it("drops only example category slugs when /products, /categories and /om are planned", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-footer.tsx", ECOMMERCE_SITE_FOOTER)],
      routePlan: storefrontPlan(),
      scaffold: FOOTER_ONLY,
    });

    expect(result.changedPaths).toEqual(["components/site-footer.tsx"]);
    const footer = result.files[0]!.content;
    expect(footer).toContain('href: "/products"');
    expect(footer).toContain('href: "/categories"');
    expect(footer).toContain('href: "/om"');
    expect(footer).toContain('href: "/"');
    expect(footer).not.toContain("/category/category-1");
    expect(footer).not.toContain("/category/category-2");
  });

  it("syncs header and footer together when navSurface is a list, leaving other files alone", () => {
    const extra = file("components/cart-drawer.tsx", "export function CartDrawer(){ return null; }");
    const result = syncNavItemsFromRoutePlan({
      files: [
        file("components/site-header.tsx", ECOMMERCE_SITE_HEADER),
        file("components/site-footer.tsx", ECOMMERCE_SITE_FOOTER),
        extra,
      ],
      routePlan: onePagePlan(),
      scaffold: ECOMMERCE_SURFACES,
    });

    expect(result.changedPaths).toEqual([
      "components/site-header.tsx",
      "components/site-footer.tsx",
    ]);
    const header = result.files[0]!.content;
    const footer = result.files[1]!.content;
    expect(extractNavHrefs(header)).toEqual(["/"]);
    expect(header).not.toContain('href: "/products"');
    expect(footer).toContain('href: "/"');
    expect(footer).not.toContain('href: "/products"');
    expect(result.files[2]!.content).toBe(extra.content);
  });

  it("does not touch footerLinks when the footer is not in navSurface", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [
        file("components/site-header.tsx", ECOMMERCE_SITE_HEADER),
        file("components/site-footer.tsx", ECOMMERCE_SITE_FOOTER),
      ],
      routePlan: onePagePlan(),
      scaffold: HEADER_SURFACE,
    });

    expect(result.changedPaths).toEqual(["components/site-header.tsx"]);
    expect(result.files[1]!.content).toBe(ECOMMERCE_SITE_FOOTER);
  });

  it("does not rewrite footerLinks on follow-up", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-footer.tsx", ECOMMERCE_SITE_FOOTER)],
      routePlan: onePagePlan(),
      isFollowUp: true,
      scaffold: FOOTER_ONLY,
    });

    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(ECOMMERCE_SITE_FOOTER);
  });

  it("keeps mailto and external footer hrefs while dropping unplanned pages", () => {
    const footer = [
      `const footerLinks = {`,
      `  Butik: [`,
      `    { label: "Produkter", href: "/products" },`,
      `    { label: "Kontakt", href: "mailto:hej@example.com" },`,
      `  ],`,
      `  Extra: [`,
      `    { label: "Extern", href: "https://example.com" },`,
      `    { label: "CDN", href: "//cdn.example.com" },`,
      `  ],`,
      `};`,
      `export function SiteFooter() { return null; }`,
    ].join("\n");
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/site-footer.tsx", footer)],
      routePlan: onePagePlan(),
      scaffold: FOOTER_ONLY,
    });

    expect(result.changedPaths).toEqual(["components/site-footer.tsx"]);
    const next = result.files[0]!.content;
    expect(next).not.toContain('href: "/products"');
    expect(next).toContain("Butik:");
    expect(next).toContain("mailto:hej@example.com");
    expect(next).toContain("https://example.com");
    expect(next).toContain("//cdn.example.com");
  });
});
