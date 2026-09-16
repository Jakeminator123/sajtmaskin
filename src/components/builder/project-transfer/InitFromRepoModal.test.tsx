import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { InitFromRepoModal } from "./InitFromRepoModal";

const fetchUser = vi.fn();

vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({
    user: { github_username: "acme" },
    isAuthenticated: true,
    hasGitHub: true,
    isInitialized: true,
    fetchUser,
  }),
}));

vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="auth-modal" /> : null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("InitFromRepoModal", () => {
  beforeEach(() => {
    fetchUser.mockReset();
    window.sessionStorage.clear();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands the server project id to onSuccess and does not keep the old project", async () => {
    const onSuccess = vi.fn();
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          id: "chat_new",
          chatId: "chat_new",
          projectId: "proj_new",
          versionId: "ver_new",
          previewUrl: "https://preview.test",
          preview: { status: "starting", runtimeReady: false, retryable: true },
          source: "github",
          lockedFiles: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<InitFromRepoModal isOpen onClose={() => {}} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/Repository-adress/i), {
      target: { value: "https://github.com/acme/site" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Importera projekt/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj_new", chatId: "chat_new" }),
      );
    });
    expect(screen.queryByText(/Public repos work without login/i)).toBeNull();
    expect(screen.queryByText(/Use ZIP import/i)).toBeNull();
  });

  it("fills a dropped GitHub link without starting import", () => {
    const onSuccess = vi.fn();
    render(<InitFromRepoModal isOpen onClose={() => {}} onSuccess={onSuccess} />);

    fireEvent.drop(screen.getByTestId("import-drop-root"), {
      dataTransfer: {
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://github.com/acme/dropped" : "",
      },
    });

    expect((screen.getByLabelText(/Repository-adress/i) as HTMLInputElement).value).toBe(
      "https://github.com/acme/dropped",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("surfaces a 413 without JSON as a usable size error", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Payload Too Large", {
        status: 413,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    render(<InitFromRepoModal isOpen onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^ZIP$/i }));
    fireEvent.change(screen.getByLabelText(/ZIP-adress/i), {
      target: { value: "https://example.com/big.zip" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Importera projekt/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/för stor/i));
    });
  });
});
