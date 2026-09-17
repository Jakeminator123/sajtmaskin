// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
} from "@/lib/seo-landing-pages/registry";
import {
  LovableAlternativContent,
  readyRelatedSeoLandingSlugs,
} from "./lovable-alternativ-content";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("LovableAlternativContent", () => {
  it("renders one primary heading, product CTA and only ready related links", () => {
    const entry = getSeoLandingEntry("lovable-alternativ");
    render(<LovableAlternativContent />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(entry.plannedH1);

    const ctaLinks = screen.getAllByRole("link", { name: "Testa Sajtmaskin" });
    expect(ctaLinks.length).toBeGreaterThan(0);
    expect(ctaLinks.every((link) => link.getAttribute("href") === SEO_LANDING_CTA_HREF)).toBe(
      true,
    );

    expect(
      screen.getAllByRole("link", { name: "Se AI-flödet steg för steg" }).every(
        (link) => link.getAttribute("href") === "/skapa-hemsida-med-ai",
      ),
    ).toBe(true);

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/skriven av Sajtmaskin/i);
    expect(body).toContain("Överväg Lovable när");
    expect(body).toContain("Överväg Sajtmaskin när");
    expect(body).toContain("Lovable ändras snabbt");
    expect(body).toContain("Preview är inte publicering");
    expect(body).not.toMatch(/\d+\s*kr\b/i);
    expect(body).not.toMatch(/\b(?:49|99|179)\b/);
    expect(screen.getByRole("link", { name: "prissidan" }).getAttribute("href")).toBe("/#priser");
    expect(screen.queryByRole("link", { name: /wix|wordpress/i })).toBeNull();

    const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);
    expect(readyRelated).toEqual(
      expect.arrayContaining(["ai-hemsidebyggare", "skapa-hemsida-med-ai", "hemsideprogram"]),
    );
    for (const slug of readyRelated) {
      const related = getSeoLandingEntry(slug);
      expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe(
        `/${slug}`,
      );
    }
  });
});
