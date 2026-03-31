import { describe, expect, it } from "vitest";
import {
  readNavItemsDraft,
  updateNavItemsDraft,
  type NavItemDraft,
} from "./nav-items-editor";

describe("nav-items-editor", () => {
  describe("readNavItemsDraft", () => {
    it("reads nav labels from component files", () => {
      const content = [
        "const navItems = [",
        "  { label: 'Tjänster', href: '#services' },",
        "  { label: 'Priser', href: '#pricing' },",
        "  { label: 'Kontakt', href: '#contact' },",
        "];",
      ].join("\n");

      expect(readNavItemsDraft("components/site-header.tsx", content)).toEqual([
        { label: "Tjänster" },
        { label: "Priser" },
        { label: "Kontakt" },
      ]);
    });

    it("does not mistake footer link groups for nav items", () => {
      const content = [
        "const footerLinks = {",
        "  Tjänster: [",
        "    { label: 'Webbdesign', href: '#' },",
        "    { label: 'SEO', href: '#' },",
        "  ],",
        "  Företaget: [",
        "    { label: 'Om oss', href: '#' },",
        "    { label: 'Kontakt', href: '#' },",
        "  ],",
        "};",
      ].join("\n");

      expect(readNavItemsDraft("components/site-footer.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two items exist", () => {
      const content = [
        "const navItems = [",
        "  { label: 'Tjänster', href: '#services' },",
        "];",
      ].join("\n");

      expect(readNavItemsDraft("components/site-header.tsx", content)).toBeNull();
    });
  });

  describe("updateNavItemsDraft", () => {
    it("updates nav labels in place", () => {
      const content = [
        "const navItems = [",
        "  { label: 'Tjänster', href: '#services' },",
        "  { label: 'Priser', href: '#pricing' },",
        "  { label: 'Kontakt', href: '#contact' },",
        "];",
      ].join("\n");

      const nextItems: NavItemDraft[] = [
        { label: "Erbjudande" },
        { label: "Planer" },
        { label: "Boka" },
      ];

      const updated = updateNavItemsDraft(content, nextItems);
      expect(updated).toContain("label: 'Erbjudande'");
      expect(updated).toContain("label: 'Planer'");
      expect(updated).toContain("label: 'Boka'");
    });

    it("returns content unchanged when no edits exist", () => {
      const content = [
        "const navItems = [",
        "  { label: 'Tjänster', href: '#services' },",
        "  { label: 'Priser', href: '#pricing' },",
        "];",
      ].join("\n");

      const nextItems: NavItemDraft[] = [
        { label: "Tjänster" },
        { label: "Priser" },
      ];

      expect(updateNavItemsDraft(content, nextItems)).toBe(content);
    });
  });
});
