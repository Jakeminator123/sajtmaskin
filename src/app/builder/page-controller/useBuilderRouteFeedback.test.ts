/** @vitest-environment jsdom */
import { createRef } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const noteAccountCreatedIfSignup = vi.hoisted(() => vi.fn());
const noteOpenAiRegistrationIfSignup = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/ads/fire-google-ads-conversion", () => ({
  noteAccountCreatedIfSignup,
}));
vi.mock("@/lib/ads/fire-openai-ads", () => ({ noteOpenAiRegistrationIfSignup }));

import { useAuthStore } from "@/lib/auth/auth-store";
import { useBuilderRouteFeedback } from "./useBuilderRouteFeedback";

function renderFeedback(query: string, replace = vi.fn()) {
  return renderHook(() =>
    useBuilderRouteFeedback({
      chatId: null,
      isAuditEntry: false,
      isChatError: null,
      promptId: null,
      pendingBriefRef: createRef<Record<string, unknown> | null>(),
      router: { replace },
      searchParams: new URLSearchParams(query) as never,
      setAuditPromptLoaded: vi.fn(),
      setChatId: vi.fn(),
      setCurrentPreviewUrl: vi.fn(),
      setIsIntentionalReset: vi.fn(),
      setMessages: vi.fn(),
    }),
  );
}

describe("useBuilderRouteFeedback signup conversion", () => {
  beforeEach(() => {
    noteAccountCreatedIfSignup.mockClear();
    noteOpenAiRegistrationIfSignup.mockClear();
  });

  it("notes account_created from signup=1 before the query param is cleared", () => {
    const replace = vi.fn();
    const searchParams = new URLSearchParams("login=success&signup=1");

    renderHook(() =>
      useBuilderRouteFeedback({
        chatId: null,
        isAuditEntry: false,
        isChatError: null,
        promptId: null,
        pendingBriefRef: createRef<Record<string, unknown> | null>(),
        router: { replace },
        searchParams: searchParams as never,
        setAuditPromptLoaded: vi.fn(),
        setChatId: vi.fn(),
        setCurrentPreviewUrl: vi.fn(),
        setIsIntentionalReset: vi.fn(),
        setMessages: vi.fn(),
      }),
    );

    expect(noteAccountCreatedIfSignup).toHaveBeenCalledWith("1");
    expect(noteOpenAiRegistrationIfSignup).toHaveBeenCalledWith("1");
    expect(replace).toHaveBeenCalledWith("/builder");
    expect(noteAccountCreatedIfSignup.mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0],
    );
    expect(noteOpenAiRegistrationIfSignup.mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0],
    );
  });
});

describe("useBuilderRouteFeedback GitHub OAuth return", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ user: null, guest: null, isLoading: false, isInitialized: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reloads the user so the new GitHub connection shows at once", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            authenticated: true,
            user: {
              id: "user_1",
              email: "anna@example.test",
              name: null,
              image: null,
              diamonds: 0,
              provider: "email",
              github_username: "anna",
              github_connected: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const replace = vi.fn();

    renderFeedback("github_connected=true&github_username=anna", replace);

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");
    await waitFor(() => {
      expect(useAuthStore.getState().user?.github_connected).toBe(true);
    });
    expect(replace).toHaveBeenCalledWith("/builder");
  });

  it("does not reload the user after a failed connection", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderFeedback("github_error=provider_error");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
