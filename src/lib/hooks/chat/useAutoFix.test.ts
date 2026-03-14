import { describe, expect, it } from "vitest";

import { summarizeVersionLogsForAutoFix } from "./useAutoFix";

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
