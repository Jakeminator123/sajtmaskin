import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CubeToolsFace, type CubeToolsFaceProps } from "./CubeToolsFace";

function setup(overrides: Partial<CubeToolsFaceProps> = {}) {
  const props: CubeToolsFaceProps = {
    selectedModelTier: "pro",
    onSelectedModelTierChange: vi.fn(),
    digestEnabled: true,
    onDigestEnabledChange: vi.fn(),
    enableThinking: false,
    onEnableThinkingChange: vi.fn(),
    enableImageGenerations: true,
    onEnableImageGenerationsChange: vi.fn(),
    imageGenerationsSupported: true,
    locked: false,
    agentConfigured: true,
    ...overrides,
  };
  render(<CubeToolsFace {...props} />);
  return props;
}

describe("CubeToolsFace", () => {
  it("writes each control back to the value it mirrors", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("switch", { name: "Kommenterar efter varje bygge" }));
    expect(props.onDigestEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("switch", { name: "Resonemang" }));
    expect(props.onEnableThinkingChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("switch", { name: "AI-bilder" }));
    expect(props.onEnableImageGenerationsChange).toHaveBeenCalledWith(false);

    const slider = screen.getByRole("slider", { name: "Modellväg" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(props.onSelectedModelTierChange).toHaveBeenCalledWith("max");
  });

  it("locks the build choices while a build runs", () => {
    setup({ locked: true });
    for (const name of ["Kommenterar efter varje bygge", "Resonemang", "AI-bilder"]) {
      expect((screen.getByRole("switch", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("says why AI images cannot be switched on where they are unsupported", () => {
    const props = setup({ imageGenerationsSupported: false });
    const images = screen.getByRole("switch", { name: "AI-bilder" }) as HTMLButtonElement;
    expect(images.disabled).toBe(true);
    expect(images.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Inte tillgängligt i den här miljön.")).toBeTruthy();
    fireEvent.click(images);
    expect(props.onEnableImageGenerationsChange).not.toHaveBeenCalled();
  });

  it("leaves the agent section out where the agent is not configured", () => {
    setup({ agentConfigured: false });
    expect(screen.queryByText(/Vad Sajtagenten får göra/)).toBeNull();
    expect(screen.queryByRole("switch", { name: "Kommenterar efter varje bygge" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Resonemang" })).toBeTruthy();
  });
});
