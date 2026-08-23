// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreviewModal } from "./preview-modal";

describe("PreviewModal", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("portals an accessible, mobile-bounded dialog above the global chat", () => {
    const onClose = vi.fn();
    const title = "En mycket lång templatetitel som måste lämna plats för stängknappen";
    const { unmount } = render(
      <PreviewModal isOpen onClose={onClose} imageUrl="/template-preview.png" title={title} />,
    );

    const dialog = screen.getByRole("dialog");
    const heading = screen.getByRole("heading", { name: title });
    const closeButton = screen.getByRole("button", { name: "Stäng preview" });

    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("z-[70]");
    expect(heading.className).toContain("min-w-0");
    expect(heading.className).toContain("flex-1");
    expect(heading.className).toContain("truncate");
    expect(closeButton.className).toContain("shrink-0");
    expect(closeButton.className).toContain("min-h-11");
    expect(document.activeElement).toBe(closeButton);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes from Escape, the close button, and the backdrop", () => {
    const onClose = vi.fn();
    render(<PreviewModal isOpen onClose={onClose} imageUrl={null} title="Preview utan bild" />);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Stäng preview" }));
    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
