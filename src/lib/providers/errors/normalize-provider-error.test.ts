import { describe, expect, it } from "vitest";
import { normalizeProviderError } from "./normalize-provider-error";

describe("normalizeProviderError", () => {
  it.each([
    "Failed query: insert into generation_plans values (...)",
    "database row id 40122 missing",
    "plan parsing failed for request 42905",
    "SQL field billing_plan missing (40322)",
    "request api key column failed",
  ])("keeps application diagnostic %s a generic server failure", (message) => {
    expect(normalizeProviderError(new Error(message))).toMatchObject({
      status: 500, code: "error", message: "Ett oväntat fel uppstod. Försök igen.",
    });
  });

  it("accepts a structured provider code without text heuristics", () => {
    expect(normalizeProviderError({ code: "insufficient_quota", message: "quota" }))
      .toMatchObject({ status: 402, code: "quota_exceeded" });
    expect(normalizeProviderError({ code: "rate_limit_exceeded", retryAfter: 12 }))
      .toMatchObject({ status: 429, code: "rate_limit", retryAfter: 12 });
  });
  it.each([
    new Error("postgres://user:secret@internal-db.example/app"),
    Object.assign(new Error("provider request-id secret"), { status: 503 }),
  ])("masks unclassified server failures", (error) => {
    const result = normalizeProviderError(error);

    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(result.code).toBe("error");
    expect(result.message).toBe("Ett oväntat fel uppstod. Försök igen.");
    expect(result.message).not.toContain("secret");
  });

  it("masks raw authentication details while preserving setup guidance", () => {
    const result = normalizeProviderError(
      Object.assign(new Error("Incorrect API key sk-secret-value"), { status: 401 }),
    );

    expect(result).toMatchObject({
      status: 401,
      code: "unauthorized",
      message: "API-nyckel saknas eller är ogiltig. Kontrollera API-nycklar i miljövariabler.",
    });
    expect(result.message).not.toContain("sk-secret-value");
  });

  it.each([
    [429, "rate_limit", "Rate limit mot AI-tjänsten."],
    [402, "quota_exceeded", "Kvoten är slut för AI-tjänsten. Kontrollera plan eller billing."],
    [403, "forbidden", "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter."],
  ] as const)("preserves the safe %s classification", (status, code, message) => {
    expect(normalizeProviderError({ status })).toMatchObject({ status, code, message });
  });

  it("preserves an intentional client-error message", () => {
    expect(normalizeProviderError({ status: 400, message: "Invalid prompt shape" })).toMatchObject({
      status: 400,
      code: "error",
      message: "Invalid prompt shape",
    });
  });
});
