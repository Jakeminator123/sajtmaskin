// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AuthUser } from "@/lib/auth/auth-store";
import {
  KONTO_LOAD_OLDER_LABEL,
  KONTO_SIGNED_OUT_TITLE,
  kontoOlderHistoryNotice,
} from "@/lib/konto/account";

vi.mock("@/components/layout/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));
vi.mock("@/components/layout/shader-background", () => ({
  ShaderBackground: () => null,
}));
vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="auth-modal">Auth modal</div> : null,
}));

const { useAuthStore } = await import("@/lib/auth/auth-store");
const { default: KontoPage } = await import("./page");

function authUser(overrides: Partial<AuthUser> & Pick<AuthUser, "id" | "email">): AuthUser {
  return {
    name: overrides.name ?? "Anna",
    image: null,
    diamonds: 42,
    provider: "email",
    github_token: null,
    github_username: null,
    ...overrides,
  };
}

function payload(input: {
  email: string;
  name: string;
  transactions?: Array<{ id: string; description: string }>;
  hasMore?: boolean;
  limit?: number;
  offset?: number;
}) {
  return {
    success: true,
    account: {
      name: input.name,
      email: input.email,
      loginMethod: "E-post och lösenord",
    },
    credits: { balance: 42 },
    transactions: (input.transactions ?? [{ id: "tx_1", description: "Köp: starter" }]).map(
      (row) => ({
        id: row.id,
        type: "purchase",
        amount: 100,
        balanceAfter: 42,
        description: row.description,
        createdAt: "2026-09-10T08:00:00.000Z",
      }),
    ),
    hasMore: input.hasMore ?? false,
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function resetAuth() {
  useAuthStore.setState({
    user: null,
    guest: null,
    isLoading: false,
    isInitialized: true,
  });
}

describe("KontoPage auth and history", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    resetAuth();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    resetAuth();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("clears previous account data on logout and refetches after switch", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/logout")) return Promise.resolve(jsonResponse({ success: true }));
      const current = useAuthStore.getState().user;
      if (current?.id === "user_a") {
        return Promise.resolve(jsonResponse(payload({ email: "anna@example.com", name: "Anna" })));
      }
      if (current?.id === "user_b") {
        return Promise.resolve(jsonResponse(payload({ email: "bertil@example.com", name: "Bertil" })));
      }
      return Promise.resolve(jsonResponse({ success: false, error: "Du måste vara inloggad." }, 401));
    });

    act(() => {
      useAuthStore.getState().setUser(authUser({ id: "user_a", email: "anna@example.com", name: "Anna" }));
    });
    render(<KontoPage />);

    expect(await screen.findByText("anna@example.com")).toBeTruthy();

    act(() => {
      useAuthStore.getState().logout();
    });

    await waitFor(() => {
      expect(screen.queryByText("anna@example.com")).toBeNull();
      expect(screen.getByText(KONTO_SIGNED_OUT_TITLE)).toBeTruthy();
    });

    act(() => {
      useAuthStore.getState().setUser(
        authUser({ id: "user_b", email: "bertil@example.com", name: "Bertil" }),
      );
    });

    expect(await screen.findByText("bertil@example.com")).toBeTruthy();
    expect(screen.queryByText("anna@example.com")).toBeNull();
  });

  it("ignores a late response from the previous user", async () => {
    let resolvePrevious: ((value: unknown) => void) | undefined;
    const previousResponse = new Promise((resolve) => {
      resolvePrevious = resolve;
    });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/api/konto")) return Promise.resolve(jsonResponse({}));
      const current = useAuthStore.getState().user?.id;
      if (current === "user_a" && resolvePrevious) return previousResponse;
      return Promise.resolve(jsonResponse(payload({ email: "bertil@example.com", name: "Bertil" })));
    });

    act(() => {
      useAuthStore.getState().setUser(authUser({ id: "user_a", email: "anna@example.com" }));
    });
    render(<KontoPage />);

    await act(async () => {
      useAuthStore.getState().setUser(authUser({ id: "user_b", email: "bertil@example.com", name: "Bertil" }));
    });

    expect(await screen.findByText("bertil@example.com")).toBeTruthy();

    await act(async () => {
      resolvePrevious?.(jsonResponse(payload({ email: "anna@example.com", name: "Anna" })));
    });

    expect(screen.queryByText("anna@example.com")).toBeNull();
    expect(screen.getByText("bertil@example.com")).toBeTruthy();
  });

  it("clears account cards when /api/konto returns 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: "Du måste vara inloggad." }, 401));

    act(() => {
      useAuthStore.getState().setUser(authUser({ id: "user_a", email: "anna@example.com" }));
    });
    render(<KontoPage />);

    await waitFor(() => {
      expect(screen.queryByText("anna@example.com")).toBeNull();
      expect(screen.getByText(KONTO_SIGNED_OUT_TITLE)).toBeTruthy();
    });
  });

  it("refetches /api/konto after re-login with the same user id", async () => {
    const user = authUser({ id: "user_a", email: "anna@example.com", name: "Anna" });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/api/konto")) return Promise.resolve(jsonResponse({}));
      const kontoCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/api/konto"),
      ).length;
      if (kontoCalls <= 1) {
        return Promise.resolve(jsonResponse({ success: false, error: "Du måste vara inloggad." }, 401));
      }
      return Promise.resolve(jsonResponse(payload({ email: "anna@example.com", name: "Anna" })));
    });

    act(() => {
      useAuthStore.getState().setUser(user);
    });
    render(<KontoPage />);

    await waitFor(() => {
      expect(screen.getByText(KONTO_SIGNED_OUT_TITLE)).toBeTruthy();
    });

    act(() => {
      useAuthStore.getState().setUser(authUser({ id: "user_a", email: "anna@example.com", name: "Anna" }));
    });

    expect(await screen.findByText("anna@example.com")).toBeTruthy();
    expect(screen.queryByText(KONTO_SIGNED_OUT_TITLE)).toBeNull();
  });

  it("appends older history instead of dropping it", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("offset=50")) {
        return Promise.resolve(
          jsonResponse(
            payload({
              email: "anna@example.com",
              name: "Anna",
              transactions: [{ id: "tx_old", description: "Köp: older" }],
              hasMore: false,
              offset: 50,
            }),
          ),
        );
      }
      return Promise.resolve(
        jsonResponse(
          payload({
            email: "anna@example.com",
            name: "Anna",
            transactions: [{ id: "tx_new", description: "Köp: latest" }],
            hasMore: true,
            offset: 0,
          }),
        ),
      );
    });

    act(() => {
      useAuthStore.getState().setUser(authUser({ id: "user_a", email: "anna@example.com" }));
    });
    render(<KontoPage />);

    expect(await screen.findByText("Köp: latest")).toBeTruthy();
    expect(screen.getByText(kontoOlderHistoryNotice(1))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: KONTO_LOAD_OLDER_LABEL }));

    expect(await screen.findByText("Köp: older")).toBeTruthy();
    expect(screen.getByText("Köp: latest")).toBeTruthy();
    expect(screen.queryByText(KONTO_LOAD_OLDER_LABEL)).toBeNull();
  });
});
