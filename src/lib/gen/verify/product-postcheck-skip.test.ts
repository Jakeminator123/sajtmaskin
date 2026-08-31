import { describe, expect, it } from "vitest";
import {
  formatProductPostcheckSkippedMessage,
  productPostcheckSkipReasonFromMessage,
} from "./product-postcheck-skip";

describe("formatProductPostcheckSkippedMessage", () => {
  it("carries the structured kind:reason token", () => {
    expect(formatProductPostcheckSkippedMessage("preview_not_running")).toBe(
      "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
    );
  });

  it("falls back to unknown for blank input", () => {
    expect(formatProductPostcheckSkippedMessage("  ")).toBe(
      "F2 Product Postcheck skipped (product_postcheck_skipped: unknown).",
    );
  });
});

describe("productPostcheckSkipReasonFromMessage", () => {
  it("reads the structured token", () => {
    expect(
      productPostcheckSkipReasonFromMessage(
        formatProductPostcheckSkippedMessage("capture_failed"),
      ),
    ).toBe("capture_failed");
  });

  it("reads the legacy wrapped reason", () => {
    expect(
      productPostcheckSkipReasonFromMessage(
        "F2 Product Postcheck skipped (missing_preview_url).",
      ),
    ).toBe("missing_preview_url");
  });

  it("returns null when no reason is present", () => {
    expect(productPostcheckSkipReasonFromMessage("F2 Product Postcheck skipped.")).toBeNull();
    expect(productPostcheckSkipReasonFromMessage(null)).toBeNull();
  });
});
