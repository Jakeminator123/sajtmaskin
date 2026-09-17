// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
} from "@/lib/seo-landing-pages/registry";
import {
  AiHemsidebyggareContent,
  readyRelatedSeoLandingSlugs,
} from "./ai-hemsidebyggare-content";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("AiHemsidebyggareContent", () => {
  it("renders one primary heading, product CTA and only ready related links", () => {
    const entry = getSeoLandingEntry("ai-hemsidebyggare");
    render(<AiHemsidebyggareContent />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(entry.plannedH1);

    const ctaLinks = screen.getAllByRole("link", { name: "Testa i byggaren" });
    expect(ctaLinks.length).toBeGreaterThan(0);
    expect(ctaLinks.every((link) => link.getAttribute("href") === SEO_LANDING_CTA_HREF)).toBe(
      true,
    );

    expect(
      screen.getAllByRole("link", { name: "Se AI-flödet steg för steg" }).every(
        (link) => link.getAttribute("href") === "/skapa-hemsida-med-ai",
      ),
    ).toBe(true);

    expect(screen.queryByText(/bästa AI-hemsidebyggaren/i)).toBeNull();

    const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);
    expect(readyRelated).toContain("skapa-hemsida-med-ai");
    for (const slug of readyRelated) {
      const related = getSeoLandingEntry(slug);
      expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe(
        `/${slug}`,
      );
    }

    for (const slug of entry.relatedSlugs) {
      if (readyRelated.includes(slug)) continue;
      const related = getSeoLandingEntry(slug);
      expect(screen.queryByRole("link", { name: related.title })).toBeNull();
    }
  });
});
