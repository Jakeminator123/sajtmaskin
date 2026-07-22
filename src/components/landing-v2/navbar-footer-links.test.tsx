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
  it("navbar links Teknik to /teknik", () => {
    render(<Navbar />);
    const teknik = screen.getByRole("link", { name: "Teknik" });
    expect(teknik.getAttribute("href")).toBe("/teknik");
  });

  it("footer links Funktioner to /teknik#funktioner and Teknik to /teknik", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: "Funktioner" }).getAttribute("href")).toBe(
      "/teknik#funktioner",
    );
    expect(screen.getByRole("link", { name: "Teknik" }).getAttribute("href")).toBe("/teknik");
  });
});
