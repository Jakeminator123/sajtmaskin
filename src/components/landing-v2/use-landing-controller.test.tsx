// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());
const createProject = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));
vi.mock("@/lib/projects/project-client", () => ({
  createProject,
  deleteProject: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/landing-v2/landing-analytics", () => ({
  trackHomepageEvent: vi.fn(),
}));

import { useLandingController } from "./use-landing-controller";

function Probe() {
  const { startBuild, isSubmitting } = useLandingController();
  return (
    <button type="button" disabled={isSubmitting} onClick={() => void startBuild()}>
      starta
    </button>
  );
}

describe("useLandingController startBuild", () => {
  beforeEach(() => {
    routerPush.mockReset();
    createProject.mockReset();
    createProject.mockResolvedValue({ id: "proj_1" });
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates to /builder with new=1 so builder_start can fire", async () => {
    const view = render(<Probe />);
    await act(async () => {
      view.getByRole("button", { name: "starta" }).click();
    });
    await waitFor(() => expect(createProject).toHaveBeenCalled());
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        "/builder?project=proj_1&buildMethod=freeform&buildIntent=website&new=1",
      ),
    );
  });

  it("keeps gclid from the landing URL on the builder handoff", async () => {
    window.history.replaceState({}, "", "/?gclid=HeroClick");
    const view = render(<Probe />);
    await act(async () => {
      view.getByRole("button", { name: "starta" }).click();
    });
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        "/builder?project=proj_1&buildMethod=freeform&buildIntent=website&new=1&gclid=HeroClick",
      ),
    );
  });
});
