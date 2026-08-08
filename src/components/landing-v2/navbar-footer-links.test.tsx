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

describe("landing nav + footer links after marketing routes", () => {
  it("navbar links Teknik, Hur det fungerar, Priser and FAQ to own routes", () => {
    render(<Navbar />);
    expect(screen.getByRole("link", { name: "Teknik" }).getAttribute("href")).toBe("/teknik");
    expect(screen.getByRole("link", { name: "Hur det fungerar" }).getAttribute("href")).toBe(
      "/hur-det-fungerar",
    );
    expect(screen.getByRole("link", { name: "Priser" }).getAttribute("href")).toBe("/priser");
    expect(screen.getByRole("link", { name: "FAQ" }).getAttribute("href")).toBe("/faq");
  });

  it("navbar logo links back to the start page", () => {
    render(<Navbar />);
    expect(
      screen.getByRole("link", { name: /SajtMaskin — till startsidan/i }).getAttribute("href"),
    ).toBe("/");
  });

  it("footer links Funktioner/Teknik to /teknik and Priser to /priser", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: "Funktioner" }).getAttribute("href")).toBe(
      "/teknik#funktioner",
    );
    expect(screen.getByRole("link", { name: "Teknik" }).getAttribute("href")).toBe("/teknik");
    expect(screen.getByRole("link", { name: "Priser" }).getAttribute("href")).toBe("/priser");
  });
});
