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
});
