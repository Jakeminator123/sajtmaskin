import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Logga in-ruta</div> : null),
}));

import { PasswordResetForm } from "./password-reset-form";

function fill(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText("Nytt lösenord"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Bekräfta lösenord"), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole("button", { name: "Spara nytt lösenord" }));
}

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it("keeps mismatches on the form without calling the server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<PasswordResetForm status="ready" />);
    fill("new-secret", "other");
    expect((await screen.findByRole("alert")).textContent).toContain("stämmer inte");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts only the password and then offers login", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));
    render(<PasswordResetForm status="ready" />);
    fill("new-secret", "new-secret");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("nya lösenord"));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      password: "new-secret",
      confirmPassword: "new-secret",
    });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the server error for a used link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Länken är ogiltig." }), { status: 400 }),
    );
    render(<PasswordResetForm status="ready" />);
    fill("new-secret", "new-secret");
    expect((await screen.findByRole("alert")).textContent).toContain("ogiltig");
  });

  it("explains an invalid link instead of showing the form", () => {
    render(<PasswordResetForm status="invalid" />);
    expect(screen.getByRole("heading", { name: "Länken fungerar inte" })).toBeTruthy();
    expect(screen.queryByLabelText("Nytt lösenord")).toBeNull();
  });
});
