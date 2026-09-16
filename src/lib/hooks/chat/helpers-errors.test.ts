import { describe, expect, it } from "vitest";
import {
  buildApiErrorMessage,
  buildStreamErrorMessage,
  isBriefRouteAuthRefusal,
  isSajtmaskinAuthRequired,
  readAuthRequiredMessage,
} from "./helpers-errors";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

describe("isBriefRouteAuthRefusal", () => {
  it("treats requiresAuth and the legacy brief unauthorized body as login", () => {
    expect(isBriefRouteAuthRefusal(401, { requiresAuth: true })).toBe(true);
    expect(isBriefRouteAuthRefusal(401, { error: "unauthorized" })).toBe(true);
    expect(isBriefRouteAuthRefusal(401, { code: "unauthorized" })).toBe(false);
    expect(isBriefRouteAuthRefusal(500, { error: "unauthorized" })).toBe(false);
  });
});

describe("isSajtmaskinAuthRequired", () => {
  it("matches requiresAuth and auth_required, not provider unauthorized", () => {
    expect(isSajtmaskinAuthRequired({ requiresAuth: true })).toBe(true);
    expect(isSajtmaskinAuthRequired({ code: "auth_required" })).toBe(true);
    expect(isSajtmaskinAuthRequired({ code: "unauthorized" })).toBe(false);
    expect(isSajtmaskinAuthRequired({ requiresAuth: false, code: "unauthorized" })).toBe(false);
    expect(isSajtmaskinAuthRequired(null)).toBe(false);
  });
});

describe("buildApiErrorMessage auth mapping", () => {
  it("prefers Sajtmaskin login copy over the generic 401 API-key text", () => {
    expect(
      buildApiErrorMessage({
        response: jsonResponse(401),
        errorData: {
          requiresAuth: true,
          error: "Skapa ett konto eller logga in för att generera.",
        },
        fallbackMessage: "Failed to create chat",
      }),
    ).toBe("Skapa ett konto eller logga in för att generera.");
    expect(
      buildApiErrorMessage({
        response: jsonResponse(401),
        errorData: { code: "auth_required" },
        fallbackMessage: "Failed to create chat",
      }),
    ).toBe("Skapa ett konto eller logga in för att generera.");
  });

  it("still maps a provider 401 / unauthorized to the API-key text", () => {
    expect(
      buildApiErrorMessage({
        response: jsonResponse(401),
        errorData: { code: "unauthorized" },
        fallbackMessage: "Failed to create chat",
      }),
    ).toBe("API-nyckel saknas eller är ogiltig.");
    expect(
      buildApiErrorMessage({
        response: jsonResponse(401),
        errorData: { error: "invalid api key" },
        fallbackMessage: "Failed to create chat",
      }),
    ).toBe("API-nyckel saknas eller är ogiltig.");
  });
});

describe("buildStreamErrorMessage auth mapping", () => {
  it("prefers Sajtmaskin login copy over unauthorized", () => {
    expect(
      buildStreamErrorMessage({
        requiresAuth: true,
        code: "unauthorized",
        error: "Logga in för att fortsätta bygga.",
      }),
    ).toBe("Logga in för att fortsätta bygga.");
  });

  it("keeps the API-key text for a provider unauthorized code", () => {
    expect(buildStreamErrorMessage({ code: "unauthorized" })).toBe(
      "API-nyckel saknas eller är ogiltig.",
    );
  });
});

describe("readAuthRequiredMessage", () => {
  it("uses the server error string when present", () => {
    expect(readAuthRequiredMessage({ error: "Logga in först." })).toBe("Logga in först.");
  });
});
