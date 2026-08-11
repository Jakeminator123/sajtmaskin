import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegistryItemThumb } from "./RegistryItemThumb";

describe("RegistryItemThumb", () => {
  it("renderar bild när en förhandsbild finns", () => {
    render(<RegistryItemThumb src="https://ui.example/login-light.png" alt="Login" />);

    expect(screen.getByAltText("Login")).toBeTruthy();
    expect(screen.queryByTestId("registry-thumbnail-load-error")).toBeNull();
    expect(screen.queryByTestId("registry-thumbnail-kind-layout")).toBeNull();
  });

  it("renderar registry-typens ikon när bild saknas by design", () => {
    render(
      <RegistryItemThumb
        src={null}
        alt="Button"
        previewKind="inputs"
        iconKey="inputs"
        fallbackLabel="Ingen förhandsbild"
      />,
    );

    expect(screen.getByTestId("registry-thumbnail-kind-inputs")).toBeTruthy();
    expect(screen.queryByTestId("registry-thumbnail-load-error")).toBeNull();
    expect(screen.queryByAltText("Button")).toBeNull();
  });

  it("renderar ImageOff när en befintlig förhandsbild inte går att ladda", () => {
    render(
      <RegistryItemThumb
        src="https://ui.example/chart-bar-light.png"
        alt="Chart Bar"
        previewKind="data"
        iconKey="data"
      />,
    );

    fireEvent.error(screen.getByAltText("Chart Bar"));

    expect(screen.getByTestId("registry-thumbnail-load-error")).toBeTruthy();
    expect(screen.queryByTestId("registry-thumbnail-kind-data")).toBeNull();
    expect(screen.queryByAltText("Chart Bar")).toBeNull();
  });

  it("säger att hämtningen misslyckades, inte att bilden saknas", () => {
    render(
      <RegistryItemThumb
        src="https://ui.example/chart-bar-light.png"
        alt="Chart Bar"
        previewKind="data"
        iconKey="data"
        fallbackLabel="Ingen förhandsbild"
      />,
    );

    fireEvent.error(screen.getByAltText("Chart Bar"));

    expect(screen.getByText("Förhandsbilden kunde inte laddas")).toBeTruthy();
    expect(screen.queryByText("Ingen förhandsbild")).toBeNull();
  });
});
