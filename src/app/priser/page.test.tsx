// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { creditPackageCopy } from "@/lib/billing/credit-package-copy";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import PriserPage, { metadata } from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));

describe("/priser", () => {
  it("is indexable on the canonical origin and reuses CREDIT_PACKAGES", () => {
    expect(metadata.title).toBe("Priser – credits utan prenumeration");
    expect(metadata.alternates).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/priser`,
    });
    expect(metadata.description).toMatch(/1 kr = 1 credit/i);

    render(<PriserPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Priser" })).toBeTruthy();
    for (const pkg of CREDIT_PACKAGES) {
      expect(screen.getByRole("heading", { name: pkg.name })).toBeTruthy();
      expect(screen.getByText(new RegExp(`${pkg.price}\\s*kr`))).toBeTruthy();
      expect(screen.getByText(`${pkg.credits} credits`)).toBeTruthy();
      // Varje paket har en egen köpväg (inloggning skickar tillbaka hit).
      expect(
        screen.getByRole("link", { name: creditPackageCopy[pkg.id].cta }).getAttribute("href"),
      ).toBe(`/buy-credits?package=${pkg.id}`);
    }
    // Kostnadstabellen finns nu även på /priser, inte bara på /buy-credits.
    expect(screen.getByRole("heading", { name: "Vad kostar det?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kom igång" }).getAttribute("href")).toBe(
      "/builder?new=1",
    );
    expect(screen.getByRole("link", { name: "hemsideprogram" }).getAttribute("href")).toBe(
      "/hemsideprogram",
    );
    expect(
      screen.getByRole("link", { name: "alternativ till WordPress" }).getAttribute("href"),
    ).toBe("/wordpress-alternativ");
  });
});
