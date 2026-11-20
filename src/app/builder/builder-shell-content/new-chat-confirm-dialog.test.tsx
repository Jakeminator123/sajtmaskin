import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewChatConfirmDialog } from "./new-chat-confirm-dialog";

describe("NewChatConfirmDialog (V-07)", () => {
  it("säger sanningen på svenska och startar ny chatt först vid bekräftelse", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<NewChatConfirmDialog open onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByText("Starta en ny chatt?")).toBeTruthy();
    expect(screen.getByText(/finns kvar i historiken/)).toBeTruthy();
    expect(screen.queryByText(/Osparade ändringar försvinner/)).toBeNull();
    expect(screen.queryByText(/\bchat\b/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Starta ny chatt" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("avbryter utan att starta ny chatt", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<NewChatConfirmDialog open onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("visas inte när den är stängd", () => {
    render(<NewChatConfirmDialog open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText("Starta en ny chatt?")).toBeNull();
  });
});
