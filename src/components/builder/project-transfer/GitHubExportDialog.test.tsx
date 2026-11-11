import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubExportDialog } from "./GitHubExportDialog";

vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({ isOpen, defaultMode }: { isOpen: boolean; defaultMode: "login" | "register" }) =>
    isOpen ? <div data-testid="auth-modal">{defaultMode}</div> : null,
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

  it("sends project scope and the customer-owned destination address", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ repoUrl: "https://github.com/alice/site" }), {
          status: 200,
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <GitHubExportDialog
        open
        onClose={() => {}}
        chatId="chat_1"
        versionId="ver_1"
        projectId="proj_1"
        suggestedSiteUrl="https://kund.se"
        hasGitHub
        isAuthenticated
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Exportera$/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const init = fetchMock.mock.calls.find(([, call]) => call?.method === "POST")?.[1];
    expect(init).toBeDefined();
    expect(JSON.parse(String(init?.body))).toMatchObject({
      projectId: "proj_1",
      siteUrl: "https://kund.se",
    });
  });

  it("suggests the repo the project was last exported to", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ repoUrl: "https://github.com/Alice/kund-site" }), {
          status: 200,
        });
      }
      expect(String(input)).toBe("/api/github/export?chatId=chat_1");
      return new Response(
        JSON.stringify({ success: true, lastExport: { repo: "Alice/kund-site" } }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <GitHubExportDialog
        open
        onClose={() => {}}
        chatId="chat_1"
        versionId="ver_1"
        suggestedRepoName="Nytt namn"
        hasGitHub
        isAuthenticated
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice/kund-site")).toBeTruthy();
    });
    expect(screen.getByText(/Senast exporterad till Alice\/kund-site/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Exportera$/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const body = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
    expect(JSON.parse(String(body)).repo).toBe("Alice/kund-site");
  });

  it("keeps a repo name the user already typed", async () => {
    let resolveLookup: (response: Response) => void = () => {};
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveLookup = resolve;
        }),
    ) as unknown as typeof fetch;

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

    const input = screen.getByPlaceholderText("mitt-projekt");
    fireEvent.change(input, { target: { value: "eget-namn" } });
    resolveLookup(
      new Response(JSON.stringify({ success: true, lastExport: { repo: "alice/old" } }), {
        status: 200,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Senast exporterad till alice\/old/)).toBeTruthy();
    });
    expect((input as HTMLInputElement).value).toBe("eget-namn");
  });

  it("does not look up a last export before GitHub is connected", () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <GitHubExportDialog
        open
        onClose={() => {}}
        chatId="chat_1"
        versionId="ver_1"
        hasGitHub={false}
        isAuthenticated
      />,
    );

    expect(screen.getByRole("link", { name: /Koppla GitHub/i })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
