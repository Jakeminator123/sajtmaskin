/** @vitest-environment jsdom */
import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const noteAccountCreatedIfSignup = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/ads/fire-google-ads-conversion", () => ({
  noteAccountCreatedIfSignup,
}));

import { useBuilderRouteFeedback } from "./useBuilderRouteFeedback";

describe("useBuilderRouteFeedback signup conversion", () => {
  beforeEach(() => {
    noteAccountCreatedIfSignup.mockClear();
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
    expect(replace).toHaveBeenCalledWith("/builder");
    expect(noteAccountCreatedIfSignup.mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0],
    );
  });
});
