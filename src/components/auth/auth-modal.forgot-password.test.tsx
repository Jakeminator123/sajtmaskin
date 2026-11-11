import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: () => ({ setUser: vi.fn() }),
}));
vi.mock("@/lib/builder/pending-builder-draft", () => ({
  currentBuilderReturnTo: () => "/",
  googleOAuthStartHref: (returnTo: string) => `/api/auth/google?redirect=${returnTo}`,
  touchPendingBuilderDraftReturnTo: vi.fn(),
}));
vi.mock("@/lib/ads/fire-google-ads-conversion", () => ({ noteGoogleAdsConversion: vi.fn() }));
vi.mock("@/lib/ads/fire-openai-ads", () => ({ noteOpenAiRegistrationCompleted: vi.fn() }));

import { AuthModal } from "./auth-modal";

describe("AuthModal — Glömt lösenord?", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the reset panel from login, keeps the typed email and shows the generic answer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, message: "Om det finns ett konto med den adressen har vi skickat en länk." }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    render(<AuthModal isOpen onClose={vi.fn()} defaultMode="login" />);

    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "owner@example.se" } });
    fireEvent.click(screen.getByRole("button", { name: "Glömt lösenord?" }));

    expect(screen.getByRole("heading", { name: "Återställ lösenord" })).toBeTruthy();
    expect(screen.queryByLabelText("Lösenord")).toBeNull();
    expect((screen.getByLabelText("E-post") as HTMLInputElement).value).toBe("owner@example.se");

    fireEvent.click(screen.getByRole("button", { name: "Skicka länk" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Om det finns ett konto"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "owner@example.se" }) }),
    );
  });

  it("is not offered while registering and returns to login", () => {
    render(<AuthModal isOpen onClose={vi.fn()} defaultMode="register" />);
    expect(screen.queryByRole("button", { name: "Glömt lösenord?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));
    fireEvent.click(screen.getByRole("button", { name: "Glömt lösenord?" }));
    fireEvent.click(screen.getByRole("button", { name: "Tillbaka till inloggning" }));
    expect(screen.getByLabelText("Lösenord")).toBeTruthy();
  });

  it("explains rate limiting", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
    );
    render(<AuthModal isOpen onClose={vi.fn()} defaultMode="login" />);
    fireEvent.click(screen.getByRole("button", { name: "Glömt lösenord?" }));
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "a@b.se" } });
    fireEvent.click(screen.getByRole("button", { name: "Skicka länk" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("För många försök"));
  });
});
