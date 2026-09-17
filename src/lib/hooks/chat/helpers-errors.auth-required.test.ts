import { describe, expect, it } from "vitest";
import { buildApiErrorMessage, buildStreamErrorMessage } from "./helpers-errors";
import { GENERATION_AUTH_REQUIRED_MESSAGE } from "@/lib/auth/generation-auth";

const messageFor = (status: number, errorData: Record<string, unknown> | null) =>
  buildApiErrorMessage({ response: new Response(null, { status }), errorData, fallbackMessage: "Failed" });

describe("authentication error copy", () => {
  it("does not label the real app-login envelope as an API key failure", () => {
    expect(messageFor(401, {
      requiresAuth: true, insufficientCredits: false, success: false,
      error: "Skapa ett konto eller logga in för att generera.",
    })).toBe(GENERATION_AUTH_REQUIRED_MESSAGE);
  });
  it("also recognises the explicit auth_required code", () => {
    expect(messageFor(401, { code: "auth_required" })).toBe(GENERATION_AUTH_REQUIRED_MESSAGE);
  });
  it("does not guess that an unclassified 401 means an invalid provider key", () => {
    expect(messageFor(401, null)).not.toContain("API-nyckel");
  });
  it("preserves an explicitly classified provider authentication error", () => {
    expect(messageFor(401, { code: "unauthorized" })).toContain("API-nyckel");
  });
  it("keeps credit failures separate from account login", () => {
    expect(messageFor(402, { error: "Du har slut på credits", insufficientCredits: true })).toBe("Du har slut på credits");
  });
  it("preserves the app/provider distinction in stream error text", () => {
    expect(buildStreamErrorMessage({ requiresAuth: true })).toBe(GENERATION_AUTH_REQUIRED_MESSAGE);
    expect(buildStreamErrorMessage({ code: "unauthorized" })).toContain("API-nyckel");
  });
});
