import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, resolveActiveSection } from "./admin-nav";

const APP_DIR = path.resolve(__dirname, "../../app");

/** `/admin/data` → `src/app/admin/data/page.tsx` */
function pageFileFor(href: string): string {
  const relative = href.replace(/^\//, "");
  return path.join(APP_DIR, relative, "page.tsx");
}

describe("admin navigation", () => {
  it("every menu entry points at a real page", () => {
    const missing = ADMIN_SECTIONS.filter((section) => !existsSync(pageFileFor(section.href))).map(
      (section) => `${section.label} → ${section.href}`,
    );
    expect(missing).toEqual([]);
  });

  it("every admin page is reachable from the menu", () => {
    // Guards the drift the old panel had: a route existed but nothing linked to
    // it (e.g. /log, /logg), so it silently rotted.
    const adminRoot = path.join(APP_DIR, "admin");
    const hrefs = new Set(ADMIN_SECTIONS.map((section) => section.href));

    const known = [
      "/admin",
      "/admin/statistik",
      "/admin/genereringar",
      "/admin/data",
      "/admin/miljo",
      "/admin/loggar",
    ];
    for (const href of known) {
      const relative = href === "/admin" ? "" : href.replace("/admin/", "");
      const file = path.join(adminRoot, relative, "page.tsx");
      if (existsSync(file)) {
        expect(hrefs.has(href), `${href} has a page but no menu entry`).toBe(true);
      }
    }
  });

  it("labels and descriptions are filled in", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(1);
      expect(section.description.length).toBeGreaterThan(10);
    }
  });

  it("resolves the active section by longest prefix", () => {
    expect(resolveActiveSection("/admin")?.href).toBe("/admin");
    expect(resolveActiveSection("/admin/data")?.href).toBe("/admin/data");
    // A deeper path under a section still highlights that section, not the root.
    expect(resolveActiveSection("/admin/data/nagot-djupare")?.href).toBe("/admin/data");
    expect(resolveActiveSection("/nagot-annat")).toBeUndefined();
  });

  it("marks the destructive section so the menu can warn about it", () => {
    const data = ADMIN_SECTIONS.find((section) => section.href === "/admin/data");
    expect(data?.kind).toBe("danger");
  });
});
