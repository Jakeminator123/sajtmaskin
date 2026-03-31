import { describe, expect, it } from "vitest";
import {
  sanitizeChatMessageContentForDisplay,
  toAIElementsFormat,
} from "./messageAdapter";

describe("messageAdapter user prompt sanitizing", () => {
  it("unwraps stored follow-up prompt wrappers for display", () => {
    const wrappedPrompt = [
      "## Follow-up Editing Mode",
      "",
      "You are editing an existing project, not starting over.",
      "Apply the user's requested changes directly to the current files below.",
      "",
      "## Requested Changes",
      "",
      "## Continuity (from previous generation)",
      "",
      "- Previous model tier: max",
      "",
      "Apply the user's new request below. Do not discard previous work unless the user asks to.",
      "",
      "---",
      "",
      "Jag vill ha en hemsida som handlar om ett bageri med mycket bilder och en 3D-animation.",
    ].join("\n");

    expect(
      sanitizeChatMessageContentForDisplay({
        role: "user",
        content: wrappedPrompt,
      }),
    ).toBe(
      "Jag vill ha en hemsida som handlar om ett bageri med mycket bilder och en 3D-animation.",
    );

    expect(
      toAIElementsFormat({
        id: "msg_1",
        role: "user",
        content: wrappedPrompt,
      }).parts.at(-1),
    ).toEqual({
      type: "text",
      text: "Jag vill ha en hemsida som handlar om ett bageri med mycket bilder och en 3D-animation.",
    });
  });

  it("leaves assistant content untouched", () => {
    const content = "## Follow-up Editing Mode";

    expect(
      sanitizeChatMessageContentForDisplay({
        role: "assistant",
        content,
      }),
    ).toBe(content);
  });
});
