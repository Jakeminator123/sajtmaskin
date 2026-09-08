import { describe, expect, it } from "vitest";
import {
  CHAT_DISPLAY_TITLE_EXCERPT_LENGTH,
  excerptFirstUserPrompt,
  resolveChatDisplayTitle,
} from "./chat-display-title";

describe("resolveChatDisplayTitle", () => {
  it("prefers a populated title over project name and prompt", () => {
    expect(
      resolveChatDisplayTitle({
        title: "  Sparad titel  ",
        projectName: "Stilla Rum",
        firstUserPrompt: "Bygg en sajt för stillhet",
      }),
    ).toBe("Sparad titel");
  });

  it("falls back to app_projects.name when title is empty", () => {
    expect(
      resolveChatDisplayTitle({
        title: "   ",
        projectName: "Stilla Rum",
        firstUserPrompt: "Bygg en sajt för stillhet",
      }),
    ).toBe("Stilla Rum");
  });

  it("falls back to the first user-prompt excerpt when title and project are empty", () => {
    expect(
      resolveChatDisplayTitle({
        title: null,
        projectName: "",
        firstUserPrompt: "  Bygg en sajt för stillhet\noch meditation  ",
      }),
    ).toBe("Bygg en sajt för stillhet och meditation");
  });

  it("returns null when no source is set", () => {
    expect(resolveChatDisplayTitle({ title: null, projectName: null, firstUserPrompt: null })).toBe(
      null,
    );
  });
});

describe("excerptFirstUserPrompt", () => {
  it("truncates long prompts at the display-title budget", () => {
    const long = "x".repeat(CHAT_DISPLAY_TITLE_EXCERPT_LENGTH + 20);
    const excerpt = excerptFirstUserPrompt(long);
    expect(excerpt).toHaveLength(CHAT_DISPLAY_TITLE_EXCERPT_LENGTH);
    expect(excerpt?.endsWith("…")).toBe(true);
  });
});
