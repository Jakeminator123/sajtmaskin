import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewBackdropStage } from "./PreviewBackdropStage";

const animate = vi.fn();
const getAnimations = vi.fn<() => Animation[]>();

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  animate.mockReset();
  getAnimations.mockReset().mockReturnValue([]);
  HTMLMediaElement.prototype.play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  Element.prototype.animate = animate as unknown as Element["animate"];
  Element.prototype.getAnimations = getAnimations as unknown as Element["getAnimations"];
  setReducedMotion(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PreviewBackdropStage", () => {
  it("renderar produktens egna kontroller ovanpå dekorationen", () => {
    render(
      <PreviewBackdropStage motion statusKey="Startar VM-preview">
        <p>Sajten startar</p>
        <button type="button">Försök reparera preview</button>
      </PreviewBackdropStage>,
    );
    expect(screen.getByText("Sajten startar")).toBeTruthy();
    const action = screen.getByRole("button", { name: "Försök reparera preview" });
    const clicks = vi.fn();
    action.addEventListener("click", clicks);
    fireEvent.click(action);
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("animerar inte första ritningen", () => {
    render(
      <PreviewBackdropStage motion statusKey="Genererar kod">
        <p>AI tänker...</p>
      </PreviewBackdropStage>,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("glider in 16 px under 380 ms vid ett statusbyte", () => {
    const { rerender } = render(
      <PreviewBackdropStage motion statusKey="Genererar kod">
        <p>AI tänker...</p>
      </PreviewBackdropStage>,
    );
    rerender(
      <PreviewBackdropStage motion statusKey="Startar VM-preview">
        <p>Sajten startar</p>
      </PreviewBackdropStage>,
    );
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes[0]?.transform).toBe("translateY(16px) scale(0.99)");
    expect(options.duration).toBe(380);
  });

  // Ingen kontinuerlig rörelse: samma status om och om igen får inte animeras.
  it("animerar inte om statusen är oförändrad", () => {
    const { rerender } = render(
      <PreviewBackdropStage motion statusKey="Genererar kod">
        <p>AI tänker...</p>
      </PreviewBackdropStage>,
    );
    rerender(
      <PreviewBackdropStage motion statusKey="Genererar kod">
        <p>AI tänker... fortfarande</p>
      </PreviewBackdropStage>,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("animerar inte vid minskad rörelse", () => {
    setReducedMotion(true);
    const { rerender } = render(
      <PreviewBackdropStage motion statusKey="Genererar kod">
        <p>AI tänker...</p>
      </PreviewBackdropStage>,
    );
    rerender(
      <PreviewBackdropStage motion statusKey="Startar VM-preview">
        <p>Sajten startar</p>
      </PreviewBackdropStage>,
    );
    expect(animate).not.toHaveBeenCalled();
  });
});
