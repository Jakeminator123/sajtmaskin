import { render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth/auth-store";
import { VersionHistory } from "../VersionHistory";

/**
 * GitHub connection status end to end, WITHOUT mocking `useAuth`: the real
 * `/api/auth/me` route serializes a DB user, the real auth store loads it, and
 * the version history renders from `hasGitHub`. Mocking `useAuth` hid that the
 * route never sent any GitHub fields (`hasGitHub` was always false).
 */
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/hooks/useVersions", () => ({
  useVersions: () => ({ versions: [], isLoading: false, mutate: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(() => undefined, {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  }),
}));

const { GET: meRoute } = await import("@/app/api/auth/me/route");

function dbUser(github: { github_token: string | null; github_username: string | null }) {
  return {
    id: "user_1",
    email: "anna@example.test",
    name: "Anna",
    image: null,
    diamonds: 5,
    free_generation_available: false,
    provider: "email",
    email_verified: true,
    ...github,
  };
}

function installServer() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") {
      return meRoute(new NextRequest("https://example.test/api/auth/me"));
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderHistory() {
  return render(
    <VersionHistory
      chatId="chat_1"
      selectedVersionId={null}
      onVersionSelect={vi.fn()}
      versions={[
        {
          id: "ver_1",
          versionId: "ver_1",
          canPin: false,
          versionNumber: 1,
          createdAt: new Date("2026-11-01T10:00:00Z").toISOString(),
          releaseState: "draft",
          verificationState: "pending",
        } as never,
      ]}
      mutateVersions={vi.fn(async () => undefined)}
    />,
  );
}

describe("VersionHistory — GitHub-koppling via riktig /api/auth/me", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ user: null, guest: null, isLoading: true, isInitialized: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("visar kopplat konto när servern har token och login", async () => {
    getCurrentUser.mockResolvedValue(
      dbUser({ github_token: "gho_secret_token", github_username: "alice" }),
    );
    installServer();

    renderHistory();

    expect(await screen.findByText(/GitHub kopplat • @alice/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Koppla GitHub/i })).toBeNull();
    expect(JSON.stringify(useAuthStore.getState().user)).not.toContain("gho_secret_token");
  });

  it("öppnar GitHub-kopplingen i samma flik när kontot inte är kopplat", async () => {
    getCurrentUser.mockResolvedValue(dbUser({ github_token: null, github_username: null }));
    const fetchMock = installServer();

    renderHistory();

    const link = await screen.findByRole("link", { name: /Koppla GitHub/i });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");
    expect(link.getAttribute("href")).toMatch(/^\/api\/auth\/github\?returnTo=/);
    expect(link.getAttribute("target")).toBeNull();
    expect(screen.queryByText(/GitHub kopplat/)).toBeNull();
  });
});
