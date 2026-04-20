import { describe, expect, it } from "vitest";

import { classifyProviderError } from "./provider-error-messages";

describe("classifyProviderError (B3)", () => {
  it("maps insufficient_quota code to Swedish + permanent=true", () => {
    const result = classifyProviderError({ code: "insufficient_quota", message: "ignored" });
    expect(result.userMessage).toMatch(/OpenAI-kvoten slut/);
    expect(result.permanent).toBe(true);
    expect(result.code).toBe("insufficient_quota");
  });

  it("maps rate_limit_exceeded to Swedish + permanent=false (retry)", () => {
    const result = classifyProviderError({ code: "rate_limit_exceeded" });
    expect(result.userMessage).toMatch(/Rate limit|rate limit/);
    expect(result.permanent).toBe(false);
  });

  it("maps context_length_exceeded to Swedish", () => {
    const result = classifyProviderError({ code: "context_length_exceeded" });
    expect(result.userMessage).toMatch(/För lång prompt/);
    expect(result.permanent).toBe(true);
  });

  it("extracts code from nested data.error.code (AI SDK shape)", () => {
    const result = classifyProviderError({ data: { error: { code: "insufficient_quota" } } });
    expect(result.userMessage).toMatch(/OpenAI-kvoten slut/);
    expect(result.code).toBe("insufficient_quota");
  });

  it("falls back to status mapping when code is unknown but status matches", () => {
    const result = classifyProviderError({ status: 401, code: "unknown_code", message: "ignored" });
    expect(result.userMessage).toMatch(/Ogiltig API-nyckel/);
    expect(result.permanent).toBe(true);
  });

  it("falls back to raw message when no mapping matches", () => {
    const result = classifyProviderError({ status: 418, message: "I am a teapot" });
    expect(result.userMessage).toBe("I am a teapot");
    expect(result.permanent).toBe(false);
  });

  it("falls back to provided default when message is missing", () => {
    const result = classifyProviderError({ status: 418 }, "fallback msg");
    expect(result.userMessage).toBe("fallback msg");
  });

  it("handles plain string errors", () => {
    const result = classifyProviderError("boom");
    expect(result.userMessage).toBe("boom");
    expect(result.permanent).toBe(false);
  });
});
