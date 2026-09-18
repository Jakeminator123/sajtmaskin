import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Navbar pulls in next/image (AnimatedLogo), auth state and the router; stub
// the pieces that are irrelevant to the link targets under test.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({ isAuthenticated: false, isInitialized: true, logout: () => {} }),
}));

import { SEO_LANDING_FOOTER_GUIDE_LINKS } from "@/lib/seo-landing-pages/registry";
import { Navbar } from "./navbar";
import { LandingFooter } from "./landing-footer";

afterEach(() => cleanup());

describe("landing nav + footer links after /teknik move", () => {
  it("navbar links Teknik to /teknik and Analys to /analys", () => {
    render(<Navbar />);
    const teknik = screen.getAllByRole("link", { name: "Teknik" });
    expect(teknik[0]?.getAttribute("href")).toBe("/teknik");
    const analys = screen.getAllByRole("link", { name: "Analys" });
    expect(analys[0]?.getAttribute("href")).toBe("/analys");
  });

  it("footer links Funktioner to /teknik#funktioner, Teknik to /teknik and Analys to /analys", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: "Funktioner" }).getAttribute("href")).toBe(
      "/teknik#funktioner",
    );
    expect(screen.getByRole("link", { name: "Teknik" }).getAttribute("href")).toBe("/teknik");
    expect(screen.getByRole("link", { name: "Analys" }).getAttribute("href")).toBe("/analys");
  });

  it("navbar stays slim and does not list SEO landing slugs", () => {
    render(<Navbar />);
    expect(screen.queryByRole("link", { name: "Skapa hemsida" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Hemsideprogram" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Wix-alternativ" })).toBeNull();
  });

  it("footer Guider column links four hubs and not the full cluster", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("heading", { name: "Guider" })).toBeTruthy();
    for (const link of SEO_LANDING_FOOTER_GUIDE_LINKS) {
      expect(screen.getByRole("link", { name: link.label }).getAttribute("href")).toBe(
        `/${link.slug}`,
      );
    }
    expect(screen.queryByRole("link", { name: "Wix-alternativ" })).toBeNull();
    expect(screen.queryByRole("link", { name: "WordPress-alternativ" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Lovable-alternativ" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Hemsida till företag" })).toBeNull();
  });
});
