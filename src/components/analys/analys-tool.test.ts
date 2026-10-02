import { describe, expect, it } from "vitest";
import { publicAnalysErrorMessage } from "./analys-tool";

describe("publicAnalysErrorMessage", () => {
  it("describes the daily calendar quota only for its explicit code", () => {
    const message = publicAnalysErrorMessage({
      status: 429,
      code: "public_analys_daily_quota_exhausted",
      fallback: "server fallback",
    });

    expect(message).toContain("i dag");
    expect(message).not.toContain("24 timmar");
  });

  it("keeps an in-progress reservation distinct from spent daily quota", () => {
    expect(
      publicAnalysErrorMessage({
        status: 429,
        code: "public_analys_in_progress",
        fallback: "server fallback",
      }),
    ).toBe("En analys behandlas redan från den här uppkopplingen. Vänta tills den är klar.");
  });

  it("maps the short attempt guard to a retry message", () => {
    expect(
      publicAnalysErrorMessage({
        status: 429,
        code: "public_analys_attempt_rate_limited",
        fallback: "server fallback",
      }),
    ).toBe("För många analysförsök på kort tid. Vänta en stund och försök igen.");
  });

  it("never infers daily quota from an unknown 429", () => {
    expect(
      publicAnalysErrorMessage({
        status: 429,
        code: "future_rate_limit",
        fallback: "En ny servertext",
      }),
    ).toBe("En ny servertext");
  });
});
