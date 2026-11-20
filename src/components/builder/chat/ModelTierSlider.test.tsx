import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModelTierSlider } from "./ModelTierSlider";

describe("ModelTierSlider", () => {
  it("names the thumb and exposes the current label as valuetext", () => {
    const onChange = vi.fn();
    render(<ModelTierSlider value="pro" onChange={onChange} />);

    const slider = screen.getByRole("slider", { name: "Modellväg" });
    expect(slider.getAttribute("aria-valuetext")).toBe("Låg");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders persisted codex as Mellan without mutating", () => {
    const onChange = vi.fn();
    render(<ModelTierSlider value="codex" onChange={onChange} />);

    expect(screen.getByRole("slider", { name: "Modellväg" }).getAttribute("aria-valuetext")).toBe(
      "Mellan",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  // Värdet stod förut ovanpå reglaget och täcktes av tummen (16 px mot ett
  // 6 px högt spår). Nu står etikett, reglage och värde på en rad, och
  // reglaget har tummens höjd.
  it("shows the level beside the slider, with room for the thumb", () => {
    render(<ModelTierSlider value="ultra" onChange={vi.fn()} />);

    const root = screen.getByTestId("model-tier-slider");
    expect(root.className).toContain("items-center");
    expect(root.className).not.toContain("flex-col");
    expect(screen.getByTestId("model-tier-value").textContent).toBe("Extra hög");
    const sliderRoot = root.querySelector('[data-slot="slider"]');
    expect(sliderRoot?.className).toContain("h-4");
    // Värdet läses upp som valuetext på tummen, inte en gång till som text.
    expect(screen.getByTestId("model-tier-value").getAttribute("aria-hidden")).toBe("true");
  });

  it("moves one selectable step on ArrowRight", () => {
    const onChange = vi.fn();
    render(<ModelTierSlider value="pro" onChange={onChange} />);

    const slider = screen.getByRole("slider", { name: "Modellväg" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith("max");
  });
});
