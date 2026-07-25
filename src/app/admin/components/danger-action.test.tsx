/**
 * The destructive-action guard in the admin console.
 *
 * Locks the behaviour that replaced the old two-click pattern (every dangerous
 * button shared ONE `confirmAction` string in the page state, so a stray second
 * click could fire a table wipe):
 * - confirm stays disabled until the exact word is typed;
 * - typing the wrong word never triggers the action;
 * - opening the dialog runs nothing.
 *
 * Assertions use plain DOM properties on purpose — this repo does not install
 * `@testing-library/jest-dom`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DangerAction } from "./danger-action";

function setup(onConfirm = vi.fn()) {
  render(
    <DangerAction
      label="Rensa sidvisningar"
      title="Rensa sidvisningar?"
      description="Besöksstatistiken nollställs."
      impact="1 234 rader raderas."
      confirmWord="page_views"
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /rensa sidvisningar/i }));
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /ja, genomför/i }) as HTMLButtonElement;
}

function confirmInput(): HTMLInputElement {
  return screen.getByLabelText(/skriv/i) as HTMLInputElement;
}

describe("DangerAction", () => {
  it("does not run the action when the dialog is merely opened", () => {
    const onConfirm = setup();
    openDialog();

    expect(screen.getByText("Rensa sidvisningar?")).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps confirm disabled for a wrong confirmation word", () => {
    const onConfirm = setup();
    openDialog();

    fireEvent.change(confirmInput(), { target: { value: "page_view" } });
    expect(confirmButton().disabled).toBe(true);

    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action once the exact word is typed", async () => {
    const onConfirm = setup();
    openDialog();

    fireEvent.change(confirmInput(), { target: { value: "page_views" } });
    expect(confirmButton().disabled).toBe(false);

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("shows the consequence text so the operator sees what disappears", () => {
    setup();
    openDialog();

    expect(screen.getByText(/1 234 rader raderas/)).toBeTruthy();
  });
});
