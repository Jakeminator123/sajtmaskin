import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Navbar pulls in next/image (AnimatedLogo), auth state and the router; stub
// the pieces that are irrelevant to the link targets under test.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({ isAuthenticated: false, isInitialized: true, logout: () => {} }),
}));

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

  it("footer links Funktioner to /teknik#funktioner, Teknik to /teknik and Analys to /analys", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: "Funktioner" }).getAttribute("href")).toBe(
      "/teknik#funktioner",
    );
    expect(screen.getByRole("link", { name: "Teknik" }).getAttribute("href")).toBe("/teknik");
    expect(screen.getByRole("link", { name: "Analys" }).getAttribute("href")).toBe("/analys");
  });
});
