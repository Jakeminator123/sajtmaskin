import { describe, expect, it } from "vitest";
import { isGenerationAuthRequired } from "./generation-auth";

// This is the actual envelope returned by the generation credit gate.
const requiresLogin = {
  success: false,
  error: "Skapa ett konto eller logga in för att generera.",
  insufficientCredits: false,
  requiresAuth: true,
};

describe("isGenerationAuthRequired", () => {
  it("recognises the application session gate", () => {
    expect(isGenerationAuthRequired(401, requiresLogin)).toBe(true);
    expect(isGenerationAuthRequired(401, { code: "auth_required" })).toBe(true);
  });

  it.each([null, {}, "Unauthorized", { code: "unauthorized" }, { requiresAuth: false }])(
    "does not call a provider or unclassified 401 a missing app session: %j",
    (payload) => expect(isGenerationAuthRequired(401, payload)).toBe(false),
  );

  it.each([200, 402, 403, 429, 500])("does not reinterpret HTTP %i as login", (status) => {
    expect(isGenerationAuthRequired(status, requiresLogin)).toBe(false);
  });
});
