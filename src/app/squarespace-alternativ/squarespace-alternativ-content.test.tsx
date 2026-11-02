// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
} from "@/lib/seo-landing-pages/registry";
import {
  readyRelatedSeoLandingSlugs,
  SquarespaceAlternativContent,
} from "./squarespace-alternativ-content";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("SquarespaceAlternativContent", () => {
  it("renders one H1, product CTA, updated date and no competitor prices", () => {
    const entry = getSeoLandingEntry("squarespace-alternativ");
    render(<SquarespaceAlternativContent />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(entry.plannedH1);

    const ctaLinks = screen.getAllByRole("link", { name: "Prova med er beskrivning" });
    expect(ctaLinks.length).toBeGreaterThan(0);
    expect(ctaLinks.every((link) => link.getAttribute("href") === SEO_LANDING_CTA_HREF)).toBe(
      true,
    );

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/skriven av Sajtmaskin/i);
    expect(body).toContain("Senast uppdaterad 18 oktober 2026");
    expect(body).toContain("Välj Squarespace om");
    expect(body).not.toMatch(/\d+\s*kr\b/i);
    expect(body).not.toMatch(/\b(?:49|99|179)\b/);
    expect(screen.getByRole("link", { name: "prissidan" }).getAttribute("href")).toBe("/priser");

    const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);
    for (const slug of readyRelated) {
      const related = getSeoLandingEntry(slug);
      expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe(
        `/${slug}`,
      );
    }
  });
});
