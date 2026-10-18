import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePreviewSurfaceMode } from "@/components/builder/preview-panel/usePreviewSurfaceMode";
import { BuilderPreviewTools } from "./BuilderPreviewTools";

// The code menu and its shared surface owner stay real. These unrelated
// controls load their own dossiers/readiness and are outside this gate contract.
vi.mock("@/components/builder/preview-panel/PreviewPanelDossiers", () => ({
  PreviewPanelDossiers: () => null,
}));
vi.mock("@/components/builder/preview-panel/PreviewPanelF3Trigger", () => ({
  PreviewPanelF3Trigger: () => null,
}));

function Harness({
  previewUrl = null,
  canShowCode = false,
  onClear,
  clearDisabled = false,
}: {
  previewUrl?: string | null;
  canShowCode?: boolean;
  onClear?: () => void;
  clearDisabled?: boolean;
}) {
  const surface = usePreviewSurfaceMode({
    previewUrl,
    canShowCode,
    inspectorEnabled: false,
  });
  return (
    <>
      <output aria-label="Aktiv vy">{surface.viewMode}</output>
      <BuilderPreviewTools
        surface={surface}
        chatId={canShowCode ? "chat_saved" : null}
        versionId={canShowCode ? "ver_saved" : null}
        previewUrl={previewUrl}
        onClear={onClear}
        clearDisabled={clearDisabled}
      />
    </>
  );
}

describe("BuilderPreviewTools — saved code without a preview session", () => {
  it.each([
    ["Kodvy", "code"],
    ["Elementregister", "registry"],
  ])("opens and closes %s through the real menu without a preview URL", (label, mode) => {
    const onClear = vi.fn();
    render(<Harness canShowCode onClear={onClear} />);

    expect(screen.getByLabelText("Aktiv vy").textContent).toBe("preview");
    const codeButton = screen.getByRole("button", { name: "Kod" });
    expect(codeButton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Öppna i ny flik" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Rensa preview" })).toBeNull();

    fireEvent.click(codeButton);
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(screen.getByLabelText("Aktiv vy").textContent).toBe(mode);

    fireEvent.click(codeButton);
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(screen.getByLabelText("Aktiv vy").textContent).toBe("preview");
    expect(codeButton.hasAttribute("disabled")).toBe(false);
    expect(onClear).not.toHaveBeenCalled();
  });

  it("keeps tools hidden until a preview or code owner is available", () => {
    const { rerender } = render(<Harness />);

    expect(screen.queryByLabelText("Previewverktyg")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kod" })).toBeNull();

    rerender(<Harness canShowCode />);
    expect(screen.getByRole("button", { name: "Kod" }).hasAttribute("disabled")).toBe(false);
  });

  it("preserves preview-only open/clear controls and disables code without a code owner", () => {
    const onClear = vi.fn();
    const previewUrl = "https://preview.example/ver_1";
    const { rerender } = render(<Harness previewUrl={previewUrl} onClear={onClear} />);

    expect(screen.getByRole("button", { name: "Kod" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Öppna i ny flik" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Rensa preview" }));
    expect(onClear).toHaveBeenCalledOnce();

    rerender(<Harness previewUrl={previewUrl} onClear={onClear} clearDisabled />);
    expect(screen.getByRole("button", { name: "Rensa preview" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Rensa preview" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("keeps saved code reachable when the preview session disappears", () => {
    const { rerender } = render(
      <Harness previewUrl="https://preview.example/ver_1" canShowCode />,
    );

    rerender(<Harness canShowCode />);
    fireEvent.click(screen.getByRole("button", { name: "Kod" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Kodvy" }));

    expect(screen.getByLabelText("Aktiv vy").textContent).toBe("code");
    expect(screen.getByRole("button", { name: "Öppna i ny flik" }).hasAttribute("disabled")).toBe(true);
  });
});
