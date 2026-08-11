import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubExportDialog } from "./GitHubExportDialog";

vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({
    isOpen,
    defaultMode,
  }: {
    isOpen: boolean;
    defaultMode: "login" | "register";
  }) => (isOpen ? <div data-testid="auth-modal">{defaultMode}</div> : null),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GitHubExportDialog", () => {
  it("shows login and register CTAs for guests", () => {
    render(
      <GitHubExportDialog
        open
        onClose={() => {}}
        chatId="chat_1"
        versionId="ver_1"
        hasGitHub={false}
        isAuthenticated={false}
      />,
    );

    expect(screen.getByRole("button", { name: /Logga in/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Skapa gratis konto/i })).toBeTruthy();
  });

  it("opens auth modal when guest clicks register", () => {
    render(
      <GitHubExportDialog
        open
        onClose={() => {}}
        chatId="chat_1"
        versionId="ver_1"
        hasGitHub={false}
        isAuthenticated={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Skapa gratis konto/i }));
    expect(screen.getByTestId("auth-modal").textContent).toBe("register");
  });

  it("surfaces an error when export returns 200 without repoUrl", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <GitHubExportDialog
        open
        onClose={() => {}}
        chatId="chat_1"
        versionId="ver_1"
        hasGitHub
        isAuthenticated
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Exportera/i }));

    await waitFor(() => {
      expect(screen.getByText(/inget repo returnerades/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Koden exporterades till GitHub/i)).toBeNull();
  });
});
