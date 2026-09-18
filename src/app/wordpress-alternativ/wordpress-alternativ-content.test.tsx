// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
} from "@/lib/seo-landing-pages/registry";
import {
  WordpressAlternativContent,
  readyRelatedSeoLandingSlugs,
} from "./wordpress-alternativ-content";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("WordpressAlternativContent", () => {
  it("renders one primary heading, product CTA and only ready related links", () => {
    const entry = getSeoLandingEntry("wordpress-alternativ");
    render(<WordpressAlternativContent />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(entry.plannedH1);

    const ctaLinks = screen.getAllByRole("link", { name: "Prova med er beskrivning" });
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
    expect(body).toContain("Stanna på WordPress om");
    expect(body).toContain("Överväg Sajtmaskin om");
    expect(body).toContain("Är WordPress osäkert?");
    expect(body).toContain("Nej");
    expect(body).toContain("Ingen automatisk flytt");
    expect(body).toContain("Preview är inte publicering");
    expect(body).not.toMatch(/\d+\s*kr\b/i);
    expect(body).not.toMatch(/\b(?:49|99|179)\b/);
    expect(screen.getByRole("link", { name: "prissidan" }).getAttribute("href")).toBe("/#priser");
    expect(screen.queryByRole("link", { name: /wix|lovable/i })).toBeNull();

    const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);
    expect(readyRelated).toEqual(
      expect.arrayContaining(["hemsideprogram", "hemsida-utan-kod", "skapa-hemsida-med-ai"]),
    );
    for (const slug of readyRelated) {
      const related = getSeoLandingEntry(slug);
      expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe(
        `/${slug}`,
      );
    }
  });
});
