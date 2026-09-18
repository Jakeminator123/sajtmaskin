// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
} from "@/lib/seo-landing-pages/registry";
import { SkapaHemsidaMedAiContent } from "./skapa-hemsida-med-ai-content";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("SkapaHemsidaMedAiContent", () => {
  it("renders one primary heading, product CTA and related topic links", () => {
    const entry = getSeoLandingEntry("skapa-hemsida-med-ai");
    render(<SkapaHemsidaMedAiContent />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(entry.plannedH1);

    const ctaLinks = screen.getAllByRole("link", { name: "Skapa hemsida med AI" });
    expect(ctaLinks.some((link) => link.getAttribute("href") === SEO_LANDING_CTA_HREF)).toBe(true);
    expect(ctaLinks.some((link) => link.getAttribute("href") === "/skapa-hemsida-med-ai")).toBe(
      true,
    );

    for (const slug of entry.relatedSlugs) {
      const related = getSeoLandingEntry(slug);
      expect(related.status).toBe("ready");
      expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe(
        `/${slug}`,
      );
    }

    expect(screen.queryByText(/reserverade/i)).toBeNull();
    expect(screen.queryByText(/fylls på/i)).toBeNull();
    expect(screen.queryByText(/färdiga guider/i)).toBeNull();
  });
});
