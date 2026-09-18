// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getSeoLandingHubLinks } from "@/lib/seo-landing-pages/registry";
import FAQPage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("FAQ public guides", () => {
  it("links the SEO hub from a crawlable Guider section", () => {
    render(<FAQPage />);

    expect(screen.getByRole("heading", { name: "Läs vidare efter frågan" })).toBeTruthy();
    for (const link of getSeoLandingHubLinks()) {
      expect(screen.getByRole("link", { name: link.label }).getAttribute("href")).toBe(link.href);
    }
    expect(screen.getByRole("link", { name: "Skapa din sajt nu" }).getAttribute("href")).toBe(
      "/builder?new=1",
    );
  });
});
