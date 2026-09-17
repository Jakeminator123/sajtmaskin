// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  SEO_LANDING_CTA_HREF,
  SEO_LANDING_PLACEHOLDER_READY_MESSAGE,
  assertSeoLandingPlaceholderAllowed,
  getSeoLandingEntry,
} from "@/lib/seo-landing-pages/registry";
import { SeoLandingPlaceholder } from "./seo-landing-placeholder";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/seo-landing-pages/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seo-landing-pages/registry")>();
  return {
    ...actual,
    assertSeoLandingPlaceholderAllowed: vi.fn(actual.assertSeoLandingPlaceholderAllowed),
    getSeoLandingEntry: vi.fn(actual.getSeoLandingEntry),
  };
});

describe("SeoLandingPlaceholder", () => {
  it("renders the shared test heading, slug and product CTA", () => {
    render(<SeoLandingPlaceholder slug="wix-alternativ" />);

    expect(screen.getByRole("heading", { level: 1, name: "Testsida Sajtmaskin" })).toBeTruthy();
    expect(
      screen.getByText("Wix-alternativ – jämför arbetssätt innan du byter"),
    ).toBeTruthy();
    expect(screen.getByText("/wix-alternativ")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Skapa hemsida" })[0]?.getAttribute("href")).toBe(
      "/builder?new=1",
    );
    expect(screen.getByRole("link", { name: "Öppna Sajtmaskin" }).getAttribute("href")).toBe(
      "/builder?new=1",
    );
  });

  it("runs the ready-guard before painting the blue test surface", () => {
    render(<SeoLandingPlaceholder slug="wix-alternativ" />);

    expect(assertSeoLandingPlaceholderAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "wix-alternativ",
        status: "placeholder",
      }),
    );
  });

  it("refuses to construct a ready registry entry as a placeholder", () => {
    vi.mocked(getSeoLandingEntry).mockReturnValueOnce({
      slug: "skapa-hemsida-med-ai",
      title: "Skapa hemsida med AI – se hur det fungerar",
      description: "Riktig landningssida.",
      plannedH1: "Skapa hemsida med AI – från beskrivning till första version",
      intent: "Hur man skapar en hemsida med AI",
      relatedSlugs: ["ai-hemsidebyggare", "skapa-hemsida", "hemsida-utan-kod"],
      status: "ready",
      ctaHref: SEO_LANDING_CTA_HREF,
    });

    expect(() => SeoLandingPlaceholder({ slug: "skapa-hemsida-med-ai" })).toThrow(
      SEO_LANDING_PLACEHOLDER_READY_MESSAGE,
    );
  });
});
