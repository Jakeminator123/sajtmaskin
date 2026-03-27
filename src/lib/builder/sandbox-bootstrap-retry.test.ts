import { describe, expect, it } from "vitest";
import { parseRetryAfterMs, shouldRetrySandboxBootstrapFetch } from "./sandbox-bootstrap-retry";

describe("shouldRetrySandboxBootstrapFetch", () => {
  it("does not retry when retryable is false", () => {
    expect(
      shouldRetrySandboxBootstrapFetch({ httpStatus: 503, retryable: false }),
    ).toBe(false);
  });

  it("retries 502 without body retryable", () => {
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 502 })).toBe(true);
  });

  it("retries bare 500 only when retryable true", () => {
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 500 })).toBe(false);
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 500, retryable: true })).toBe(true);
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 500, retryable: false })).toBe(false);
  });

  it("retries 429 and 408", () => {
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 429 })).toBe(true);
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 408 })).toBe(true);
  });

  it("does not retry 422 (client error)", () => {
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 422, retryable: false })).toBe(false);
    expect(shouldRetrySandboxBootstrapFetch({ httpStatus: 422 })).toBe(false);
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
