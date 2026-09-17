import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_ASSIST_MODELS,
  ASSIST_MODELS,
} from "@/lib/builder/prompt-assist";
import { validateBriefModelForHttp } from "@/lib/builder/site-brief-generation";
import {
  buildApiErrorMessage,
  buildStreamErrorMessage,
  isBriefRouteAuthRefusal,
  isMissingProviderApiKeyBody,
  isSajtmaskinAuthRequired,
  readAuthRequiredMessage,
} from "./helpers-errors";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

function withoutProviderKeys<T>(run: () => T): T {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    return run();
  } finally {
    if (openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = openai;
    if (anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anthropic;
  }
}

describe("isBriefRouteAuthRefusal", () => {
  it("opens login for app-auth 401 (requiresAuth / auth_required)", () => {
    expect(isBriefRouteAuthRefusal(401, { requiresAuth: true })).toBe(true);
    expect(isBriefRouteAuthRefusal(401, { code: "auth_required" })).toBe(true);
    expect(
      isBriefRouteAuthRefusal(401, {
        requiresAuth: true,
        error: "Skapa ett konto eller logga in för att generera.",
      }),
    ).toBe(true);
  });

  it("opens login for the brief route's stale-session 401 contract, including an empty body", () => {
    expect(isBriefRouteAuthRefusal(401, { error: "unauthorized" })).toBe(true);
    expect(isBriefRouteAuthRefusal(401, null)).toBe(true);
    expect(isBriefRouteAuthRefusal(401, {})).toBe(true);
    expect(isBriefRouteAuthRefusal(500, { error: "unauthorized" })).toBe(false);
  });

  it("does not open login for validateBriefModelForHttp missing API-key 401s", () => {
    const openaiModel = ASSIST_MODELS[0];
    const anthropicModel = ANTHROPIC_ASSIST_MODELS[0];
    expect(openaiModel).toBeTruthy();
    expect(anthropicModel).toBeTruthy();

    const { openai, anthropic } = withoutProviderKeys(() => ({
      openai: validateBriefModelForHttp(openaiModel),
      anthropic: validateBriefModelForHttp(anthropicModel),
    }));

    expect(openai?.status).toBe(401);
    expect(anthropic?.status).toBe(401);
    expect(isMissingProviderApiKeyBody(openai?.body)).toBe(true);
    expect(isMissingProviderApiKeyBody(anthropic?.body)).toBe(true);
    expect(isBriefRouteAuthRefusal(openai!.status, openai!.body)).toBe(false);
    expect(isBriefRouteAuthRefusal(anthropic!.status, anthropic!.body)).toBe(false);
  });

  it("does not open login for an explicit provider unauthorized code", () => {
    expect(isBriefRouteAuthRefusal(401, { code: "unauthorized" })).toBe(false);
    expect(
      isBriefRouteAuthRefusal(401, { code: "unauthorized", error: "invalid api key" }),
    ).toBe(false);
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
