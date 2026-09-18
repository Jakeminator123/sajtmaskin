// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchUser = vi.fn(async () => undefined);

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isInitialized: false,
    logout: () => {},
    fetchUser,
  }),
}));
vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: () => null,
}));
vi.mock("@/components/landing-v2/landing-footer", () => ({
  LandingFooter: () => <footer>footer</footer>,
}));
vi.mock("@/components/layout/site-background", () => ({
  SiteBackground: () => null,
}));
vi.mock("@/components/landing-v2/navbar", () => ({
  Navbar: ({
    onLoginClick,
    onRegisterClick,
  }: {
    onLoginClick?: () => void;
    onRegisterClick?: () => void;
  }) => (
    <nav>
      <button type="button" onClick={onLoginClick}>
        Logga in
      </button>
      <button type="button" onClick={onRegisterClick}>
        Kom igång gratis
      </button>
    </nav>
  ),
}));

import { ExempelShell } from "./exempel-shell";

afterEach(() => {
  cleanup();
  fetchUser.mockClear();
});

describe("ExempelShell", () => {
  it("hydrates auth so landing-nav CTAs can leave the skeleton", () => {
    render(
      <ExempelShell>
        <p>innehåll</p>
      </ExempelShell>,
    );
    expect(fetchUser).toHaveBeenCalled();
  });
});
