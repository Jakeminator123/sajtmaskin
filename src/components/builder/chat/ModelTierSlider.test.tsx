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

  it("moves one selectable step on ArrowRight", () => {
    const onChange = vi.fn();
    render(<ModelTierSlider value="pro" onChange={onChange} />);

    const slider = screen.getByRole("slider", { name: "Modellväg" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith("max");
  });
});
