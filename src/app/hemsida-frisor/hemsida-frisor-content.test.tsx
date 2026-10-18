// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getIndustryCopy } from "@/lib/seo-landing-pages/industry-copy";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
} from "@/lib/seo-landing-pages/registry";
import { HemsidaFrisorContent, readyRelatedSeoLandingSlugs } from "./hemsida-frisor-content";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("HemsidaFrisorContent", () => {
  it("renders unique salon copy, one H1 and a builder CTA", () => {
    const entry = getSeoLandingEntry("hemsida-frisor");
    const copy = getIndustryCopy("hemsida-frisor");
    render(<HemsidaFrisorContent />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(entry.plannedH1);
    expect(document.body.textContent).toContain(copy.lead);
    expect(document.body.textContent).toContain("Bokadirekt");
    expect(document.body.textContent).not.toMatch(/\d+\s*kr\b/i);

    const ctaLinks = screen.getAllByRole("link", { name: copy.ctaLabel });
    expect(ctaLinks.every((link) => link.getAttribute("href") === SEO_LANDING_CTA_HREF)).toBe(
      true,
    );

    for (const slug of readyRelatedSeoLandingSlugs(entry.relatedSlugs)) {
      const related = getSeoLandingEntry(slug);
      expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe(
        `/${slug}`,
      );
    }
  });
});
