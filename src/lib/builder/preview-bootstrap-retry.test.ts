import { describe, expect, it } from "vitest";
import { parseRetryAfterMs, shouldRetryPreviewBootstrapFetch } from "./preview-bootstrap-retry";

describe("shouldRetryPreviewBootstrapFetch", () => {
  it("does not retry when retryable is false", () => {
    expect(
      shouldRetryPreviewBootstrapFetch({ httpStatus: 503, retryable: false }),
    ).toBe(false);
  });

  it("retries 502 without body retryable", () => {
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 502 })).toBe(true);
  });

  it("retries bare 500 only when retryable true", () => {
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 500 })).toBe(false);
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 500, retryable: true })).toBe(true);
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 500, retryable: false })).toBe(false);
  });

  it("retries 429 and 408", () => {
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 429 })).toBe(true);
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 408 })).toBe(true);
  });

  it("does not retry 422 (client error)", () => {
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 422, retryable: false })).toBe(false);
    expect(shouldRetryPreviewBootstrapFetch({ httpStatus: 422 })).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  it("uses seconds from Retry-After", () => {
    const h = new Headers({ "Retry-After": "12" });
    expect(parseRetryAfterMs(h, 6000)).toBe(12_000);
  });

  it("falls back when header missing", () => {
    expect(parseRetryAfterMs(new Headers(), 6000)).toBe(6000);
  });
});
