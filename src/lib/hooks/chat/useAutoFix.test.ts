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

// The per-chat cap is read from NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT at module
// import time (default 3). The cap-dependent assertions below assume that
// default; skip them when an env override is active (e.g. the documented
// rollback NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT=1) so a configured runtime doesn't
// produce false failures.
const capOverridden =
  process.env.NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT != null &&
  process.env.NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT !== "3";

// Mutable `/readiness` response info read by the shared fetch mock below, so a
// test can drive `isVersionUnderServerRepair` through the real nested response
// shape: `{ success, readiness: { info: { lifecycleStatus, lifecycleStage } } }`.
// Default is a non-repair state so existing tests behave exactly as before
// (autofix proceeds).
let readinessInfo: {
  lifecycleStatus?: string | null;
  lifecycleStage?: string | null;
} = { lifecycleStatus: "draft", lifecycleStage: "design" };

describe("useAutoFix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    readinessInfo = { lifecycleStatus: "draft", lifecycleStage: "design" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // Check `/readiness` before `/versions`: the readiness URL is
        // `.../readiness?versionId=...` and must not be captured by a looser
        // substring match.
        if (url.includes("/readiness")) {
          return new Response(
            JSON.stringify({ success: true, readiness: { info: readinessInfo } }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
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

  it("skips a scheduled autofix when the active chat changed since scheduling (#8)", async () => {
    const sendMessage = vi.fn(async () => undefined);
    // Active chat is now a DIFFERENT chat than the payload's chat.
    const { result } = renderHook(() => useAutoFix(sendMessage, () => "chat_other"));

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("still sends when the active chat matches the payload chat (#8 control)", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutoFix(sendMessage, () => "chat_1"));

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("skips when the user switches chat while the guard requests are in flight (Codex P1)", async () => {
    const sendMessage = vi.fn(async () => undefined);
    let activeChat = "chat_1";
    const baseFetch = globalThis.fetch;
    // Flip the active chat when the `/readiness` guard request fires: that
    // request runs INSIDE the timer callback, after the pre-await active-chat
    // sample — so only the post-await re-check can catch the switch.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/readiness")) activeChat = "chat_other";
        return baseFetch(input);
      }),
    );
    const { result } = renderHook(() => useAutoFix(sendMessage, () => activeChat));

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("never schedules an autofix while a generation stream is active (fast-edit guard)", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useAutoFix(sendMessage, () => "chat_1", () => true),
    );

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("skips a scheduled autofix when a generation starts while the guards are in flight", async () => {
    const sendMessage = vi.fn(async () => undefined);
    let generationActive = false;
    const baseFetch = globalThis.fetch;
    // The user submits a prompt while the timer callback's guard requests are
    // running: flip the flag when `/readiness` fires so only the post-await
    // re-check can catch it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/readiness")) generationActive = true;
        return baseFetch(input);
      }),
    );
    const { result } = renderHook(() =>
      useAutoFix(sendMessage, () => "chat_1", () => generationActive),
    );

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("cancelPendingAutoFix drops a scheduled-but-not-sent autofix (user prompt supersedes)", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutoFix(sendMessage));

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    // Cancel before the schedule timer fires (the user sent a new prompt).
    act(() => {
      result.current.cancelPendingAutoFix();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sendMessage).not.toHaveBeenCalled();

    // The in-flight gate was released by the cancel: a NEW autofix event
    // (e.g. from the next generation's post-check) still goes through.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["typecheck failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("cancelPendingAutoFix during the async prelude prevents a stale scheduled fix (Bugbot)", async () => {
    // The user submits a new prompt WHILE this autofix is still in its async
    // prelude (in-flight gate set, schedule timer NOT yet armed) — here modelled
    // by firing cancel when the prelude's `/versions` freshness guard runs.
    // The old cancel only cleared an already-armed timer, so the prelude went on
    // to arm a stale timer that fired ~1.5–4s later. The cancel-generation guard
    // must make the prelude bail before scheduling.
    const sendMessage = vi.fn(async () => undefined);
    let cancel: (() => void) | null = null;
    let firedCancel = false;
    const baseFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!firedCancel && String(input).includes("/versions")) {
          firedCancel = true;
          cancel?.();
        }
        return baseFetch(input);
      }),
    );
    const { result } = renderHook(() => useAutoFix(sendMessage));
    cancel = result.current.cancelPendingAutoFix;

    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["build failed"],
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // No stale fix fired despite the head not advancing.
    expect(sendMessage).not.toHaveBeenCalled();

    // The in-flight gate was still released: a fresh autofix proceeds normally.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["typecheck failed"],
      });
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it.skipIf(capOverridden)("does not start a second autofix while one is still in flight (no overlap)", async () => {
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

  it.skipIf(capOverridden)("does not let a rapid duplicate event burn a chat-cap slot", async () => {
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

  it.skipIf(capOverridden)("manual autofix bypasses the per-chat and per-reason caps but still sends", async () => {
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

  it.skipIf(capOverridden)("manual sends do not consume the automatic per-chat budget", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutoFix(sendMessage));

    // One manual fix first.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["manual reason"],
        manual: true,
      });
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // The full automatic budget (3) must still be available afterwards.
    for (const reason of ["auto 0", "auto 1", "auto 2"]) {
      await act(async () => {
        result.current.autoFixHandlerRef.current({
          chatId: "chat_1",
          versionId: "ver_failed",
          reasons: [reason],
        });
        await vi.runAllTimersAsync();
      });
    }
    // 1 manual + 3 automatic — the manual one did not eat an automatic slot.
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });

  it("does not get stuck 'busy' when a pending timer is cancelled by re-render", async () => {
    const sendMessage1 = vi.fn(async () => undefined);
    const sendMessage2 = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(({ send }) => useAutoFix(send), {
      initialProps: { send: sendMessage1 },
    });

    // Schedule an autofix but DON'T let the timer fire yet.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["reason A"],
      });
    });

    // A sendMessage-identity change re-runs the effect; its cleanup cancels the
    // still-pending timer (whose callback would otherwise have released the gate).
    await act(async () => {
      rerender({ send: sendMessage2 });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(sendMessage1).not.toHaveBeenCalled();

    // The hook must NOT be stuck busy: a new autofix still proceeds.
    await act(async () => {
      result.current.autoFixHandlerRef.current({
        chatId: "chat_1",
        versionId: "ver_failed",
        reasons: ["reason B"],
      });
      await vi.runAllTimersAsync();
    });
    expect(sendMessage2).toHaveBeenCalledTimes(1);
  });

  // Regression coverage for the `/readiness` shape bug: the guard read a
  // top-level `verificationState` that the route never returns, so it never
  // fired. These drive it through the real nested
  // `readiness.info.lifecycleStatus/Stage` shape.
  describe("server-repair guard (isVersionUnderServerRepair)", () => {
    async function triggerAutoFixOnce(sendMessage: () => Promise<void>) {
      const { result } = renderHook(() => useAutoFix(sendMessage));
      await act(async () => {
        result.current.autoFixHandlerRef.current({
          chatId: "chat_1",
          versionId: "ver_failed",
          reasons: ["build failed"],
        });
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    }

    it.each([
      ["repairing", "design"],
      ["repairing", "integrations"],
      ["repair_available", "design"],
      ["repair_available", "integrations"],
      ["verifying", "integrations"],
    ])(
      "bails out when a server repair/verify is in progress (status=%s, stage=%s)",
      async (lifecycleStatus, lifecycleStage) => {
        readinessInfo = { lifecycleStatus, lifecycleStage };
        const sendMessage = vi.fn(async () => undefined);
        await triggerAutoFixOnce(sendMessage);
        expect(sendMessage).not.toHaveBeenCalled();
      },
    );

    it("does NOT bail on a pending F2/design row (status=verifying, stage=design)", async () => {
      // F2 design rows skip server-verify and sit in `verifying` while merely
      // pending — blocking here would permanently disable client autofix on F2.
      readinessInfo = { lifecycleStatus: "verifying", lifecycleStage: "design" };
      const sendMessage = vi.fn(async () => undefined);
      await triggerAutoFixOnce(sendMessage);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it.each([["promoted"], ["draft"], ["failed"]])(
      "does NOT bail when lifecycleStatus=%s (no active server repair)",
      async (lifecycleStatus) => {
        readinessInfo = { lifecycleStatus, lifecycleStage: "integrations" };
        const sendMessage = vi.fn(async () => undefined);
        await triggerAutoFixOnce(sendMessage);
        expect(sendMessage).toHaveBeenCalledTimes(1);
      },
    );

    it("does NOT bail when the readiness payload is missing info (fail-open)", async () => {
      readinessInfo = {};
      const sendMessage = vi.fn(async () => undefined);
      await triggerAutoFixOnce(sendMessage);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
