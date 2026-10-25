import { describe, expect, it } from "vitest";
import { normalizeProviderError } from "./normalize-provider-error";

describe("normalizeProviderError", () => {
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
