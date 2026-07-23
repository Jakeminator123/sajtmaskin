// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Samma stubbdisciplin som navbar-footer-links.test.tsx — men med styrbar
// auth-state så hydration-fönstret (isInitialized=false) kan testas.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const authState = {
  isAuthenticated: false,
  isInitialized: true,
  logout: () => {},
};

vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => authState,
}));

import { Navbar } from "./navbar";

afterEach(() => {
  cleanup();
  authState.isAuthenticated = false;
  authState.isInitialized = true;
});

/**
 * Regressionstest för auth-hydration-glappet (backlog /logg-internet 2026-07-09
 * fynd #22): headern renderade "Logga in"/"Kom igång gratis" i ~1 render trots
 * aktiv session, innan auth-state hunnit läsas. Auth-beroende CTA:er får inte
 * renderas förrän `isInitialized` är sann.
 */
describe("Navbar auth-hydration", () => {
  it("renders no guest CTAs before auth state is initialized", () => {
    authState.isInitialized = false;
    render(<Navbar />);
    expect(screen.queryByText("Logga in")).toBeNull();
    expect(screen.queryByText("Kom igång gratis")).toBeNull();
    expect(screen.queryByText("Mina projekt")).toBeNull();
    expect(screen.queryByText("Öppna builder")).toBeNull();
  });

  it("renders guest CTAs once initialized and unauthenticated", () => {
    render(<Navbar />);
    expect(screen.getByText("Logga in")).toBeTruthy();
    expect(screen.getByText("Kom igång gratis")).toBeTruthy();
  });

  it("renders authenticated CTAs once initialized and authenticated", () => {
    authState.isAuthenticated = true;
    render(<Navbar />);
    expect(screen.getByText("Mina projekt")).toBeTruthy();
    expect(screen.getByText("Öppna builder")).toBeTruthy();
    expect(screen.queryByText("Logga in")).toBeNull();
  });
});
