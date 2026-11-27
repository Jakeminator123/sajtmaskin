import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { usePreviewSurfaceMode } from "@/components/builder/preview-panel/usePreviewSurfaceMode";
import { useMobilePreviewInspection } from "./use-preview-layout";

function InspectionFlow({ isDesktop }: { isDesktop: boolean }) {
  const [tab, setMobileTab] = useState<"chat" | "preview">("chat");
  const surface = usePreviewSurfaceMode({ previewUrl: "https://example.test", canShowCode: false, inspectorEnabled: true });
  const { previewTabRef, toggleInspectFromChat, returnToMobileChat } = useMobilePreviewInspection({
    isDesktop, hasPreview: true, surface, setMobileTab,
  });
  return (
    <>
      <button type="button" onClick={returnToMobileChat}>Chatt</button>
      <button type="button" ref={previewTabRef}>Förhandsvisning</button>
      <section aria-label="Chattpanel" hidden={!isDesktop && tab !== "chat"}>
        <textarea aria-label="Utkast" />
        <button type="button" onClick={toggleInspectFromChat} aria-pressed={surface.inspectMode}>Markera element</button>
      </section>
      <section aria-label="Preview" hidden={!isDesktop && tab !== "preview"}>
        {surface.inspectMode ? "Markeringsläge" : "Sajt"}
      </section>
    </>
  );
}

describe("Markera element från chatten", () => {
  it("öppnar preview på mobil och behåller samma utkast vid återgång till chatten", () => {
    render(<InspectionFlow isDesktop={false} />);
    const draft = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Utkast" });
    fireEvent.change(draft, { target: { value: "Behåll min fråga" } });
    fireEvent.click(screen.getByRole("button", { name: "Markera element" }));
    expect(screen.getByRole("region", { name: "Preview" }).textContent).toBe("Markeringsläge");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Förhandsvisning" }));
    expect(screen.queryByRole("textbox", { name: "Utkast" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Chatt" }));
    expect(screen.getByRole("textbox", { name: "Utkast" })).toBe(draft);
    expect(draft.value).toBe("Behåll min fråga");
    expect(screen.getByRole("button", { name: "Markera element" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("låter chatten behålla fokus på desktop medan previewläget ändras", () => {
    render(<InspectionFlow isDesktop />);
    const button = screen.getByRole("button", { name: "Markera element" });
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("region", { name: "Preview" }).textContent).toBe("Markeringsläge");
    expect(screen.getByRole("textbox", { name: "Utkast" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Förhandsvisning" })).not.toBe(document.activeElement);
  });
});
