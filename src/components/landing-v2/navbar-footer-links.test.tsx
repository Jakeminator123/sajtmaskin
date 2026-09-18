import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("navbar links Teknik, Analys and Exempel without touching the footer contract", () => {
    render(<Navbar />);
    const teknik = screen.getAllByRole("link", { name: "Teknik" });
    expect(teknik[0]?.getAttribute("href")).toBe("/teknik");
    const analys = screen.getAllByRole("link", { name: "Analys" });
    expect(analys[0]?.getAttribute("href")).toBe("/analys");
    const exempel = screen.getAllByRole("link", { name: "Exempel" });
    expect(exempel[0]?.getAttribute("href")).toBe("/exempel");
  });

  it("keeps /exempel out of LandingFooter source", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/landing-footer.tsx"),
      "utf8",
    );
    expect(source).not.toContain("/exempel");
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

  it("footer exposes a discrete Guider section into the SEO cluster", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("heading", { name: "Guider" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Så skapar du en hemsida" }).getAttribute("href")).toBe(
      "/skapa-hemsida",
    );
    expect(screen.getByRole("link", { name: "Så fungerar AI-vägen" }).getAttribute("href")).toBe(
      "/skapa-hemsida-med-ai",
    );
    expect(screen.getByRole("link", { name: "Hemsida för företag" }).getAttribute("href")).toBe(
      "/hemsida-till-foretag",
    );
    expect(screen.getByRole("link", { name: "Bygg utan kod" }).getAttribute("href")).toBe(
      "/hemsida-utan-kod",
    );
    expect(screen.getByRole("link", { name: "Vad en hemsida kostar" }).getAttribute("href")).toBe(
      "/vad-kostar-en-hemsida",
    );
    expect(screen.getByRole("link", { name: "Jämför hemsideprogram" }).getAttribute("href")).toBe(
      "/hemsideprogram",
    );
    expect(screen.queryByRole("link", { name: /wix-alternativ/i })).toBeNull();
  });

  it("keeps the four-hub constant for callers that still read the compact set", () => {
    expect(SEO_LANDING_FOOTER_GUIDE_LINKS.map((link) => link.slug)).toEqual([
      "skapa-hemsida",
      "skapa-hemsida-med-ai",
      "vad-kostar-en-hemsida",
      "hemsideprogram",
    ]);
  });
});
