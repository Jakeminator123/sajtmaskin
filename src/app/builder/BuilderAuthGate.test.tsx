import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, type AuthUser } from "@/lib/auth/auth-store";
import { requestBuilderAuthentication } from "@/lib/auth/builder-auth-events";
import { BuilderAuthGate } from "./BuilderAuthGate";

const user: AuthUser = {
  id: "u1", email: "user@example.test", name: "Test", image: null, diamonds: 0,
  provider: "email", github_token: null, github_username: null,
};
vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({ isOpen, onClose, returnTo }: { isOpen: boolean; onClose: () => void; returnTo?: string }) =>
    isOpen ? <div role="dialog" aria-label="Logga in" data-return-to={returnTo}>
      <button onClick={onClose}>Avbryt inloggning</button>
      <button onClick={() => { useAuthStore.getState().setUser(user); onClose(); }}>Simulera inloggning</button>
    </div> : null,
}));

function Composer() {
  const [text, setText] = useState("");
  return <input aria-label="Utkast" value={text} onChange={(event) => setText(event.target.value)} />;
}
const originalFetchUser = useAuthStore.getState().fetchUser;
beforeEach(() => {
  window.history.replaceState({}, "", "/builder?promptId=h1&buildMethod=kostnadsfri");
  sessionStorage.clear();
  useAuthStore.setState({ user: null, isLoading: false, isInitialized: true });
});
afterEach(() => {
  useAuthStore.setState({ user: null, fetchUser: originalFetchUser });
});

describe("BuilderAuthGate", () => {
  it("does not mount builder effects from a stale local user cache", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    useAuthStore.setState({ user, fetchUser: vi.fn(() => pending) });
    render(<BuilderAuthGate><Composer /></BuilderAuthGate>);
    expect(screen.queryByRole("textbox", { name: "Utkast" })).toBeNull();
    await act(async () => { useAuthStore.getState().setUser(null); finish(); });
    expect(await screen.findByRole("dialog", { name: "Logga in" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Utkast" })).toBeNull();
    expect(screen.getByRole("dialog").getAttribute("data-return-to")).toContain("promptId=h1");
  });

  it("keeps the mounted draft when an expired session opens and closes login", async () => {
    useAuthStore.setState({ user, fetchUser: vi.fn(async () => {}) });
    render(<BuilderAuthGate><Composer /></BuilderAuthGate>);
    const input = await screen.findByRole("textbox", { name: "Utkast" });
    fireEvent.change(input, { target: { value: "Mitt utkast" } });
    act(() => requestBuilderAuthentication({ message: "Mitt utkast" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("Mitt utkast");
    fireEvent.click(screen.getByText("Avbryt inloggning"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Mitt utkast");
    act(() => requestBuilderAuthentication({ message: "Mitt utkast" }));
    fireEvent.click(await screen.findByText("Simulera inloggning"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("textbox", { name: "Utkast" })).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Mitt utkast");
  });
});
