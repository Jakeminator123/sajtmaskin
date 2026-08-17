import { describe, expect, it } from "vitest";

import { classifyProviderError } from "./provider-error-messages";

describe("classifyProviderError (B3)", () => {
  it("maps insufficient_quota code to Swedish + permanent=true", () => {
    const result = classifyProviderError({ code: "insufficient_quota", message: "ignored" });
    expect(result.userMessage).toMatch(/OpenAI-kvoten slut/);
    expect(result.permanent).toBe(true);
    expect(result.code).toBe("insufficient_quota");
  });

  // Weekly eval run 2026-08-17: the Responses API answered every codegen call
  // with `code: credit_balance_exhausted`, which had no row here, so the run was
  // billed and reported as an ordinary failure instead of a provider fault.
  it("maps credit_balance_exhausted to a permanent provider fault", () => {
    const result = classifyProviderError({
      data: { error: { type: "insufficient_quota", code: "credit_balance_exhausted" } },
      message: "You have no credits remaining.",
    });
    expect(result.userMessage).toMatch(/OpenAI-krediten är slut/);
    expect(result.permanent).toBe(true);
    expect(result.providerFault).toBe(true);
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

  // Prod 2026-07-28: a revoked OPENAI_API_KEY reached users as the AI SDK's
  // English "No output generated" wrapper, because the 401 sat one `cause`
  // level down. Nothing told them the key was the problem.
  it("reads status through the cause chain (AI SDK NoOutputGeneratedError wrapper)", () => {
    const apiError = Object.assign(new Error("Incorrect API key provided: sk-proj-***"), {
      statusCode: 401,
    });
    const wrapper = Object.assign(new Error("No output generated. Check the stream for errors."), {
      cause: apiError,
    });

    const result = classifyProviderError(wrapper, "Engine streaming failed");

    expect(result.userMessage).toMatch(/Ogiltig API-nyckel/);
    expect(result.permanent).toBe(true);
    expect(result.providerFault).toBe(true);
    // The raw provider text echoes the key prefix — it must not become the
    // user-facing message.
    expect(result.userMessage).not.toMatch(/sk-proj/);
  });

  it("reads a provider code nested two causes deep", () => {
    const inner = Object.assign(new Error("quota"), { code: "insufficient_quota" });
    const middle = Object.assign(new Error("wrapped"), { cause: inner });
    const outer = Object.assign(new Error("wrapped twice"), { cause: middle });

    const result = classifyProviderError(outer);

    expect(result.code).toBe("insufficient_quota");
    expect(result.providerFault).toBe(true);
  });

  it("does not spin on a self-referencing cause", () => {
    const looping = new Error("loop") as Error & { cause?: unknown };
    looping.cause = looping;

    const result = classifyProviderError(looping);

    expect(result.userMessage).toBe("loop");
    expect(result.providerFault).toBe(false);
  });

  it("maps 429 to a retryable provider fault", () => {
    const result = classifyProviderError({ status: 429 });
    expect(result.userMessage).toMatch(/rate limit/i);
    expect(result.permanent).toBe(false);
    expect(result.providerFault).toBe(true);
  });

  it("treats an over-long request as the user's scope, not a provider fault", () => {
    const result = classifyProviderError({ code: "context_length_exceeded" });
    expect(result.providerFault).toBe(false);
  });

  it("leaves unmapped errors chargeable (no false provider fault)", () => {
    const result = classifyProviderError({ status: 418, message: "I am a teapot" });
    expect(result.providerFault).toBe(false);
  });

  // Granskning 2026-07-29: att ta första FUNNA koden lät en transportkod på
  // wrappern dölja en mappad kvot-kod längre in — körningen debiterades då som
  // ett vanligt fel i stället för provider-fault.
  it("prefers a mapped code over an outer transport code", () => {
    const inner = Object.assign(new Error("quota"), { code: "insufficient_quota" });
    const outer = Object.assign(new Error("socket hang up"), {
      code: "UND_ERR_SOCKET",
      cause: inner,
    });

    const result = classifyProviderError(outer);

    expect(result.code).toBe("insufficient_quota");
    expect(result.providerFault).toBe(true);
  });

  it("prefers a mapped status over an outer unmapped one", () => {
    const inner = Object.assign(new Error("unauthorized"), { status: 401 });
    const outer = Object.assign(new Error("gateway"), { status: 418, cause: inner });

    const result = classifyProviderError(outer);

    expect(result.userMessage).toMatch(/Ogiltig API-nyckel/);
    expect(result.providerFault).toBe(true);
  });

  it("still reports the outermost code when nothing maps", () => {
    const inner = Object.assign(new Error("inner"), { code: "also_unknown" });
    const outer = Object.assign(new Error("outer"), { code: "unknown_code", cause: inner });

    expect(classifyProviderError(outer).code).toBe("unknown_code");
  });

  // En prototypnyckel gav en truthy icke-mappning, så `userMessage` blev
  // `undefined` fast typen lovade en sträng.
  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "does not treat the prototype key %s as a mapping",
    (code) => {
      const result = classifyProviderError({ code, message: "raw provider text" });

      expect(typeof result.userMessage).toBe("string");
      expect(result.userMessage).toBe("raw provider text");
      expect(result.providerFault).toBe(false);
    },
  );
});
