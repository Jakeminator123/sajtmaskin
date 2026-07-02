import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionHistory } from "./VersionHistory";

// Minimal stubs so the component renders in isolation.
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "t@test.dev" },
    isAuthenticated: true,
    hasGitHub: false,
    isInitialized: true,
    fetchUser: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/useVersions", () => ({
  useVersions: () => ({ versions: [], isLoading: false, mutate: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(
    (..._args: unknown[]) => undefined,
    { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a), message: vi.fn() },
  ),
}));

describe("VersionHistory — restore → preview-resync (fas 4)", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("anropar onVersionSelect OCH onPreviewResync med den nya versionId efter lyckad restore", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/versions") && init?.method === "POST") {
        return new Response(JSON.stringify({ success: true, versionId: "ver_new" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Alla övriga (SWR: collaboration-summaries, preview-status, …) → tomt ok-svar.
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onVersionSelect = vi.fn();
    const onPreviewResync = vi.fn();

    render(
      <VersionHistory
        chatId="chat_1"
        selectedVersionId={null}
        onVersionSelect={onVersionSelect}
        onPreviewResync={onPreviewResync}
        versions={[
          {
            id: "ver_old",
            versionId: "ver_old",
            canPin: false,
            versionNumber: 1,
            createdAt: new Date("2026-07-01T10:00:00Z").toISOString(),
            releaseState: "draft",
            verificationState: "pending",
          } as never,
        ]}
        mutateVersions={vi.fn(async () => undefined)}
      />,
    );

    // Öppna bekräftelsedialogen via radens restore-knapp.
    fireEvent.click(screen.getByRole("button", { name: /Återställ som ny draftversion/i }));

    // Bekräfta i dialogen.
    const confirmButton = await screen.findByRole("button", { name: /^Återställ$/ });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onVersionSelect).toHaveBeenCalledWith("ver_new");
    });
    await waitFor(() => {
      expect(onPreviewResync).toHaveBeenCalledWith("ver_new");
    });

    // Ordning: onVersionSelect innan onPreviewResync.
    expect(onVersionSelect.mock.invocationCallOrder[0]).toBeLessThan(
      onPreviewResync.mock.invocationCallOrder[0],
    );
  });
});
