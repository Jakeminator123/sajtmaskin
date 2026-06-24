import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { summarizeVersionLogsForAutoFix, useAutoFix } from "./useAutoFix";

describe("summarizeVersionLogsForAutoFix", () => {
  it("prioritizes blocking diagnostics and removes noisy success/info logs", () => {
    const diagnostics = summarizeVersionLogsForAutoFix([
      {
        level: "info",
        category: "render-telemetry",
        message: "Preview rendered successfully (own-engine)",
      },
      {
        level: "warning",
        category: "seo",
        message: "SEO review hittade 5 launch-varning(ar).",
        meta: { issues: ["Missing robots", "Missing sitemap"] },
      },
      {
        level: "error",
        category: "quality-gate:build",
        message: "build failed (exit 1)",
        meta: {
          output:
            "app/page.tsx:29:6 JSX element 'div' has no corresponding closing tag.\napp/page.tsx:273:2 '</' expected.",
        },
      },
      {
        level: "error",
        category: "preview",
        message: "preview compilation failed",
        meta: {
          previewCode: "preview_compile_error",
          previewStage: "preview-script",
          message:
            "Preview compilation failed for generated code.\n- app/page.tsx: L29:6 JSX element 'div' has no corresponding closing tag.",
        },
      },
    ]);

    expect(diagnostics).toContain("[quality-gate:build] build failed (exit 1)");
    expect(
      diagnostics.some((entry) => entry.includes("JSX element 'div' has no corresponding closing tag")),
    ).toBe(true);
    expect(diagnostics).toContain("[preview] preview compilation failed");
    expect(diagnostics).toContain(
      "[preview:preview_compile_error] Previewn kunde inte kompilera genererad kod.",
    );
    expect(diagnostics).toContain("[preview:stage] preview-script");
    expect(diagnostics.some((entry) => entry.includes("Preview rendered successfully"))).toBe(false);
    expect(diagnostics.some((entry) => entry.startsWith("[seo]"))).toBe(false);
  });

  it("treats syntax diagnostics as blocking autofix context", () => {
    const diagnostics = summarizeVersionLogsForAutoFix([
      {
        level: "error",
        category: "syntax",
        message: "Syntax validation left blocking errors before preflight/preview.",
        meta: {
          syntaxStatus: "failed",
          errorsBefore: 3,
          errorsAfter: 2,
          earlyStopReason: "no_improvement",
        },
      },
      {
        level: "warning",
        category: "seo",
        message: "SEO review hittade 1 launch-varning(ar).",
      },
    ]);

    expect(diagnostics).toContain("[syntax] Syntax validation left blocking errors before preflight/preview.");
    expect(diagnostics.some((entry) => entry.startsWith("[seo]"))).toBe(false);
  });
});

describe("useAutoFix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/versions")) {
          return new Response(
            JSON.stringify({
              versions: [{ id: "ver_failed", createdAt: "2026-03-31T00:00:00.000Z" }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (url.includes("/error-log")) {
          return new Response(JSON.stringify({ logs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pins autofix follow-ups to the failing version and preserves scaffold retry overrides", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutoFix(sendMessage));

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
        repair: {
          scaffoldRetry: {
            suggestedScaffoldId: "landing-page",
            reason: "repair suggested scaffold swap",
          },
        },
      });
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        engineBaseVersionIdOverride: "ver_failed",
        scaffoldModeOverride: "manual",
        scaffoldIdOverride: "landing-page",
      }),
    );
  });

  it("does not start a second autofix while one is still in flight (no overlap)", async () => {
    let releaseFirst: (() => void) | null = null;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          // The first send hangs until released; later sends resolve at once.
          if (!releaseFirst) releaseFirst = resolve;
          else resolve();
        }),
    );
    const { result } = renderHook(() => useAutoFix(sendMessage));

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["first reason"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // A second, distinct autofix arrives while the first is still streaming.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["second reason"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // The in-flight gate blocked it — still only one send.
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Releasing the first lets a later autofix proceed normally.
    await act(async () => {
      releaseFirst?.();
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["third reason"],
      });
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not let a rapid duplicate event burn a chat-cap slot", async () => {
    let releaseFirst: (() => void) | null = null;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          if (!releaseFirst) releaseFirst = resolve;
          else resolve();
        }),
    );
    const { result } = renderHook(() => useAutoFix(sendMessage));

    // First event starts and hangs mid-send.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["reason A"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // Second event fires while first is in flight → dropped without consuming
    // the cap (the old code counted it even though it never sent).
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["reason B"],
      });
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      releaseFirst?.();
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Because the dropped event never consumed the cap, two further distinct
    // reasons still fit under MAX_AUTOFIX_PER_CHAT (3): total real sends = 3.
    for (const reason of ["reason C", "reason D"]) {
      await act(async () => {
        result.current.autoFixHandlerRef.current({
          chatId: "chat_1",
          versionId: "ver_failed",
          reasons: [reason],
        });
        await vi.runAllTimersAsync();
      });
    }
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("manual autofix bypasses the per-chat and per-reason caps but still sends", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutoFix(sendMessage));

    // Drive the per-chat cap to MAX (3) with distinct automatic reasons.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        result.current.autoFixHandlerRef.current({
          chatId: "chat_1",
          versionId: "ver_failed",
          reasons: [`auto reason ${i}`],
        });
        await vi.runAllTimersAsync();
      });
    }
    expect(sendMessage).toHaveBeenCalledTimes(3);

    // A 4th automatic event (distinct reason) is blocked by the chat cap.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["auto reason blocked"],
      });
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(3);

    // A manual trigger — even reusing an already-attempted reason — bypasses
    // both the chat cap and the per-reason cap and actually sends.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["auto reason 0"],
        manual: true,
      });
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });
});
