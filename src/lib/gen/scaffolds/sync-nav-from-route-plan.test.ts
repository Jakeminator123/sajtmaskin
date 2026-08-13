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
    });

    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(rewritten);
  });

  it("does not rewrite on follow-up even when the scaffold form still matches", () => {
    const result = syncNavItemsFromRoutePlan({
      files: [file("components/dashboard-sidebar.tsx", DASHBOARD_SIDEBAR)],
      routePlan: offertlyftetPlan(),
      isFollowUp: true,
    });

    expect(result.changedPaths).toEqual([]);
    expect(result.files[0]!.content).toBe(DASHBOARD_SIDEBAR);
  });
});
