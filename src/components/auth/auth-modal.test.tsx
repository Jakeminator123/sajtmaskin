import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: () => ({ setUser }),
}));
vi.mock("@/lib/builder/pending-builder-draft", () => ({
  currentBuilderReturnTo: () => "/",
  googleOAuthStartHref: (returnTo: string) => `/api/auth/google?redirect=${returnTo}`,
  touchPendingBuilderDraftReturnTo: vi.fn(),
}));
vi.mock("@/lib/ads/fire-google-ads-conversion", () => ({
  noteGoogleAdsConversion: vi.fn(),
}));

import { AuthModal } from "./auth-modal";

const user = {
  id: "user_1",
  email: "test@example.se",
  name: "Test",
  image: null,
  diamonds: 0,
  provider: "email" as const,
  github_token: null,
  github_username: null,
};

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "test@example.se" } });
  fireEvent.change(screen.getByLabelText("Lösenord"), { target: { value: "secret123" } });
  fireEvent.click(screen.getByRole("button", { name: "Logga in" }));
}

describe("AuthModal onSuccess", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUser.mockReset();
  });

  it("fires exactly once after a successful login and store update", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, user }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <AuthModal isOpen onClose={onClose} defaultMode="login" onSuccess={onSuccess} />,
    );

    fillAndSubmit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith(user);
    expect(setUser).toHaveBeenCalledWith(user);
    expect(setUser.mock.invocationCallOrder[0]).toBeLessThan(
      onSuccess.mock.invocationCallOrder[0],
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fire for failed login or registration awaiting verification", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const onSuccess = vi.fn();
    const view = render(
      <AuthModal isOpen onClose={vi.fn()} defaultMode="login" onSuccess={onSuccess} />,
    );

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "Fel lösenord" })),
    );
    fillAndSubmit();
    await screen.findByRole("alert");
    expect(onSuccess).not.toHaveBeenCalled();

    view.rerender(
      <AuthModal isOpen onClose={vi.fn()} defaultMode="register" onSuccess={onSuccess} />,
    );
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "new@example.se" } });
    fireEvent.change(screen.getByLabelText("Lösenord"), { target: { value: "secret123" } });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          requiresEmailVerification: true,
          emailVerificationSent: true,
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Skapa konto" }));
    await screen.findByRole("status");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not turn an async continuation failure into an auth error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, user })),
    );
    render(
      <AuthModal
        isOpen
        onClose={vi.fn()}
        defaultMode="login"
        onSuccess={() => Promise.reject(new Error("continuation failed"))}
      />,
    );

    fillAndSubmit();
    await waitFor(() => expect(setUser).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByText("Kunde inte ansluta till servern")).toBeNull();
  });
});
