import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ScrollStory,
  type ScrollStoryStep,
} from "../../../../data/dossiers/soft/scroll-story-orchestrator/components/scroll-story";
import { stepIndexFromProgress } from "../../../../data/dossiers/soft/scroll-story-orchestrator/components/use-scroll-story";

const STEPS = [
  { id: "fore", title: "Före", media: <div>Före-media</div> },
  { id: "under", title: "Under arbetet", media: <div>Under-media</div> },
  { id: "resultat", title: "Resultatet", media: <div>Resultat-media</div> },
];

const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = Element.prototype.scrollIntoView;

function installMatchMedia(flags: { desktop?: boolean; reducedMotion?: boolean }) {
  const desktop = flags.desktop ?? false;
  const reducedMotion = flags.reducedMotion ?? false;
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const matchMedia = vi.fn((query: string) => {
    let matches = false;
    if (query.includes("min-width: 768px")) matches = desktop;
    else if (query.includes("prefers-reduced-motion")) matches = reducedMotion;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener,
      removeEventListener,
      dispatchEvent: () => false,
    };
  });
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
  return { addEventListener, removeEventListener };
}

function stubStartOfStoryLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1024,
    bottom: 3000,
    width: 1024,
    height: 3000,
    toJSON: () => ({}),
  } as DOMRect);
}

function renderStory(
  flags: { desktop?: boolean; reducedMotion?: boolean } = {},
  extra: { onStepChange?: (index: number, step: ScrollStoryStep) => void } = {},
) {
  const listeners = installMatchMedia(flags);
  stubStartOfStoryLayout();
  const view = render(
    <ScrollStory
      ariaLabel="Köksrenoveringens kapitel"
      steps={STEPS}
      onStepChange={extra.onStepChange}
    />,
  );
  return { ...view, ...listeners };
}

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
});

describe("scroll-story-orchestrator", () => {
  it("renders linear mode by default with each title once and no aria-hidden media", () => {
    renderStory();

    const region = screen.getByRole("region", { name: "Köksrenoveringens kapitel" });
    expect(region.getAttribute("data-scroll-story-mode")).toBe("linear");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(STEPS.length);
    expect(region.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(region.querySelectorAll("[aria-current]")).toHaveLength(0);
  });

  it("uses sticky mode on desktop when motion is allowed", () => {
    renderStory({ desktop: true, reducedMotion: false });

    const region = screen.getByRole("region", { name: "Köksrenoveringens kapitel" });
    expect(region.getAttribute("data-scroll-story-mode")).toBe("sticky");

    const articles = region.querySelectorAll("article");
    expect(articles).toHaveLength(STEPS.length);
    expect(articles[0]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(STEPS.length);

    const hiddenMedia = region.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenMedia).toHaveLength(STEPS.length - 1);

    const progress = screen.getByRole("list", { name: "Kapitel" });
    const buttons = within(progress).getAllByRole("button");
    expect(buttons).toHaveLength(STEPS.length);
    expect(buttons[0]?.getAttribute("aria-current")).toBe("step");
  });

  it("forces linear mode when reduced motion is preferred on desktop", () => {
    renderStory({ desktop: true, reducedMotion: true });

    expect(
      screen.getByRole("region", { name: "Köksrenoveringens kapitel" }).getAttribute(
        "data-scroll-story-mode",
      ),
    ).toBe("linear");
    expect(screen.queryByRole("list", { name: "Kapitel" })).toBeNull();
  });

  it("scrolls the target chapter into view when a progress button is clicked", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderStory({ desktop: true, reducedMotion: false });

    fireEvent.click(screen.getByRole("button", { name: "Kapitel 2: Under arbetet" }));

    const target = document.getElementById("under");
    expect(target).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(target);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("unmount removes matchMedia change listeners", () => {
    const { unmount, addEventListener, removeEventListener } = renderStory({
      desktop: true,
      reducedMotion: false,
    });

    expect(addEventListener.mock.calls.length).toBeGreaterThan(0);
    expect(() => unmount()).not.toThrow();
    expect(removeEventListener).toHaveBeenCalledTimes(addEventListener.mock.calls.length);
  });

  it("does not call onStepChange on mount when the active index stays 0", () => {
    const onStepChange = vi.fn();
    renderStory({ desktop: true, reducedMotion: false }, { onStepChange });
    expect(onStepChange).not.toHaveBeenCalled();
  });
});

describe("stepIndexFromProgress", () => {
  it("maps 0 to the first step", () => {
    expect(stepIndexFromProgress(0, 3)).toBe(0);
  });

  it("maps 0.999 to the last step", () => {
    expect(stepIndexFromProgress(0.999, 3)).toBe(2);
  });

  it("maps 1 to the last step", () => {
    expect(stepIndexFromProgress(1, 3)).toBe(2);
  });

  it("maps a negative value to 0", () => {
    expect(stepIndexFromProgress(-0.2, 3)).toBe(0);
  });

  it("maps NaN to 0", () => {
    expect(stepIndexFromProgress(Number.NaN, 3)).toBe(0);
  });
});
