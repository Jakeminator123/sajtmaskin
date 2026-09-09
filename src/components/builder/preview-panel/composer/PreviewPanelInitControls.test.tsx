import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewPanelInitControls } from "./PreviewPanelInitControls";
import {
  getCurrentInitBuildChoices,
  resetInitBuildChoices,
} from "@/lib/builder/init-build-choices";

afterEach(() => {
  resetInitBuildChoices();
});

/** Every Byggval row renders as a Radix `radiogroup` named by its section heading. */
function choiceRow(name: string): HTMLElement {
  return screen.getByRole("radiogroup", { name });
}

describe("PreviewPanelInitControls — single-select", () => {
  /**
   * Radix clears the value when an already-active item is clicked, which would
   * leave a Byggval row with NO choice at all. `ChoiceChipRow` drops that empty
   * `next`, and this is the only thing asserting it: without the guard a second
   * click on the active chip silently wipes the user's choice from the store
   * that feeds request meta.
   */
  it("behåller valet när man klickar på det redan aktiva chippet", () => {
    render(<PreviewPanelInitControls />);
    const row = choiceRow("Komplexitet");

    fireEvent.click(within(row).getByRole("radio", { name: "Lagom" }));
    expect(getCurrentInitBuildChoices().complexity).toBe("medium");

    fireEvent.click(within(row).getByRole("radio", { name: "Lagom" }));
    expect(getCurrentInitBuildChoices().complexity).toBe("medium");
    expect(within(row).getByRole("radio", { name: "Lagom" }).dataset.state).toBe("on");
  });

  it("byter val när man klickar på ett annat chip", () => {
    render(<PreviewPanelInitControls />);
    const row = choiceRow("Stil");

    fireEvent.click(within(row).getByRole("radio", { name: "Editorial" }));
    expect(getCurrentInitBuildChoices().style).toBe("editorial");

    fireEvent.click(within(row).getByRole("radio", { name: "Corporate" }));
    expect(getCurrentInitBuildChoices().style).toBe("corporate");
  });

  /**
   * The Färg row shows "Auto" where it used to show "Av", but the value on the
   * wire is still `off`. Renaming the label must never become a value change:
   * `designTheme` is persisted in request meta.
   */
  it("skickar värdet off för Färg-radens Auto trots den nya etiketten", () => {
    const onDesignThemeChange = vi.fn();
    render(
      <PreviewPanelInitControls designTheme="blue" onDesignThemeChange={onDesignThemeChange} />,
    );

    fireEvent.click(within(choiceRow("Färg")).getByRole("radio", { name: "Auto" }));
    expect(onDesignThemeChange).toHaveBeenCalledWith("off");
  });

  it("låser Färg-raden under streaming", () => {
    const onDesignThemeChange = vi.fn();
    render(
      <PreviewPanelInitControls
        designTheme="off"
        onDesignThemeChange={onDesignThemeChange}
        themeLocked
      />,
    );

    fireEvent.click(within(choiceRow("Färg")).getByRole("radio", { name: "Havsblå" }));
    expect(onDesignThemeChange).not.toHaveBeenCalled();
  });
});

describe("PreviewPanelInitControls — tillgängliga namn", () => {
  /**
   * `ToggleGroup type="single"` renders `role="radiogroup"`, and a radiogroup
   * without an accessible name fails axe's `aria-input-field-name`. The name
   * comes from the section heading via context, so a row that stops consuming
   * it goes silently unnamed for screen readers.
   */
  it("namnger varje valrad efter sin sektionsrubrik", () => {
    render(<PreviewPanelInitControls designTheme="off" onDesignThemeChange={vi.fn()} />);

    for (const label of [
      "Hemsida eller app",
      "Typ av sajt",
      "Komplexitet",
      "Stil",
      "Ton",
      "Färg",
      "Färgläge",
    ]) {
      expect(choiceRow(label)).toBeTruthy();
    }

    // No row may fall back to an unnamed group.
    for (const row of screen.getAllByRole("radiogroup")) {
      expect(row.getAttribute("aria-labelledby")).toBeTruthy();
    }
  });

  it("ger antal sidor-slidern ett eget namn", () => {
    render(<PreviewPanelInitControls />);
    expect(screen.getByRole("slider", { name: "Antal sidor" })).toBeTruthy();
  });
});
