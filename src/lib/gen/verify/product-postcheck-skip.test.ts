import { describe, expect, it } from "vitest";
import {
  classifyProductPostcheckSkipReason,
  formatProductPostcheckSkippedMessage,
  isInfrastructureSkipReason,
  isNonFinalProductPostcheckSkipReason,
  productPostcheckSkipReasonFromMessage,
  retryableProductPostcheckUnavailableReason,
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

describe("classifyProductPostcheckSkipReason — SM-072", () => {
  it("klassar kontrollkedjans egna haverier som infrastruktur", () => {
    for (const reason of [
      "playwright_unavailable",
      "browser_crashed",
      "capture_failed",
      "feature_disabled",
      "claim_busy",
      "claim_unavailable",
      "lease_unavailable",
      "claim_settled",
    ]) {
      expect(classifyProductPostcheckSkipReason(reason), reason).toBe("infrastructure");
      expect(isInfrastructureSkipReason(reason), reason).toBe(true);
    }
  });

  it("behåller produktbärande orsaker som product", () => {
    for (const reason of [
      "preview_not_running",
      "preview_not_ready",
      "missing_preview_url",
      "url_not_allowed",
      "navigation_failed",
      "timeout",
      "preview_superseded",
    ]) {
      expect(classifyProductPostcheckSkipReason(reason), reason).toBe("product");
      expect(isInfrastructureSkipReason(reason), reason).toBe(false);
    }
  });

  it("runtime_error är catch-all och får aldrig bli advisory", () => {
    // `productPostcheckSkipReasonFromError` returnerar runtime_error för varje
    // oidentifierat fel. Ett okänt fel kan vara ett riktigt produktfel som
    // kastade, så det bevisade browser-dödsfallet har egen orsak i stället.
    expect(classifyProductPostcheckSkipReason("runtime_error")).toBe("product");
  });

  it("log_read_error är fail-closed — vi vet inte vad loggen dolde", () => {
    // En misslyckad loggläsning kan ha dolt ett product_postcheck_blocked.
    expect(classifyProductPostcheckSkipReason("log_read_error")).toBe("product");
  });

  it("faller tillbaka på product för okänt, tomt och null", () => {
    // Allowlist, inte denylist: en ny orsak får aldrig tyst bli advisory.
    expect(classifyProductPostcheckSkipReason("nagot_helt_nytt")).toBe("product");
    expect(classifyProductPostcheckSkipReason("")).toBe("product");
    expect(classifyProductPostcheckSkipReason(null)).toBe("product");
    expect(classifyProductPostcheckSkipReason(undefined)).toBe("product");
  });

  it("claim_busy/unavailable är icke-final; claim_settled är slut för tupeln", () => {
    expect(isNonFinalProductPostcheckSkipReason("claim_busy")).toBe(true);
    expect(isNonFinalProductPostcheckSkipReason("claim_unavailable")).toBe(true);
    expect(isNonFinalProductPostcheckSkipReason("lease_unavailable")).toBe(true);
    expect(isNonFinalProductPostcheckSkipReason("claim_settled")).toBe(false);
    expect(isNonFinalProductPostcheckSkipReason("preview_not_running")).toBe(false);
  });

  it("känner igen 503-koder claim_unavailable och lease_unavailable", () => {
    expect(retryableProductPostcheckUnavailableReason("claim_unavailable")).toBe(
      "claim_unavailable",
    );
    expect(retryableProductPostcheckUnavailableReason("lease_unavailable")).toBe(
      "lease_unavailable",
    );
    expect(retryableProductPostcheckUnavailableReason("row_contention")).toBeNull();
  });

  it("normaliserar skiftläge och blanksteg", () => {
    expect(classifyProductPostcheckSkipReason("  Playwright_Unavailable ")).toBe(
      "infrastructure",
    );
  });
});
