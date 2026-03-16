import { describe, expect, it } from "vitest";
import {
  readFooterLinkGroupsDraft,
  updateFooterLinkGroupsDraft,
  type FooterLinkGroupDraft,
} from "./footer-links-editor";

describe("footer-links-editor", () => {
  describe("readFooterLinkGroupsDraft", () => {
    it("reads footer groups with label/href objects", () => {
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

      expect(readFooterLinkGroupsDraft("components/site-footer.tsx", content)).toEqual([
        { heading: "Tjänster", items: ["Webbdesign", "SEO"] },
        { heading: "Företaget", items: ["Om oss", "Kontakt"] },
      ]);
    });

    it("reads footer groups with plain string arrays", () => {
      const content = [
        "const links = {",
        '  Product: ["Features", "Pricing", "Integrations"],',
        '  Company: ["About", "Contact", "Customers"],',
        "};",
      ].join("\n");

      expect(readFooterLinkGroupsDraft("components/marketing-footer.tsx", content)).toEqual([
        { heading: "Product", items: ["Features", "Pricing", "Integrations"] },
        { heading: "Company", items: ["About", "Contact", "Customers"] },
      ]);
    });

    it("returns null for non-footer files", () => {
      const content = [
        "const links = {",
        '  Product: ["Features", "Pricing"],',
        '  Company: ["About", "Contact"],',
        "};",
      ].join("\n");

      expect(readFooterLinkGroupsDraft("components/header.tsx", content)).toBeNull();
    });
  });

  describe("updateFooterLinkGroupsDraft", () => {
    it("updates headings and item labels for object groups", () => {
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

      const nextGroups: FooterLinkGroupDraft[] = [
        { heading: "Erbjudande", items: ["Design", "Synlighet"] },
        { heading: "Bolaget", items: ["Team", "Hör av dig"] },
      ];

      const updated = updateFooterLinkGroupsDraft(content, nextGroups);
      expect(updated).toContain("Erbjudande: [");
      expect(updated).toContain("label: 'Design'");
      expect(updated).toContain("label: 'Synlighet'");
      expect(updated).toContain("Bolaget: [");
      expect(updated).toContain("label: 'Team'");
      expect(updated).toContain("label: 'Hör av dig'");
    });

    it("updates headings and item labels for string groups", () => {
      const content = [
        "const links = {",
        '  Product: ["Features", "Pricing"],',
        '  Company: ["About", "Contact"],',
        "};",
      ].join("\n");

      const nextGroups: FooterLinkGroupDraft[] = [
        { heading: "Produkt", items: ["Funktioner", "Planer"] },
        { heading: "Bolag", items: ["Om oss", "Kontakt"] },
      ];

      const updated = updateFooterLinkGroupsDraft(content, nextGroups);
      expect(updated).toContain('Produkt: ["Funktioner", "Planer"]');
      expect(updated).toContain('Bolag: ["Om oss", "Kontakt"]');
    });
  });
});
