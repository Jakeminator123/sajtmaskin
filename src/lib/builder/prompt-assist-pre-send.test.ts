import { describe, expect, it } from "vitest";

import {
  buildPromptAssistMessages,
  parsePromptAssistResponse,
  resolvePromptRewriteModel,
} from "./prompt-assist-pre-send";

describe("prompt-assist-pre-send", () => {
  it("prefers the rewrite env over the Deep Brief assist slot", () => {
    expect(
      resolvePromptRewriteModel({
        SAJTMASKIN_PROMPT_REWRITE_MODEL: "openai/gpt-5.6-terra",
        SAJTMASKIN_ASSIST_MODEL: "openai/gpt-5.2",
      }),
    ).toBe("openai/gpt-5.6-terra");
  });

  it("asks for natural language, not a site brief", () => {
    const { system } = buildPromptAssistMessages("hej");
    expect(system).toMatch(/natural|voice|language/i);
    expect(system).toMatch(/Do not turn the draft into a spec/);
  });

  it("reads JSON text and accepts raw prose", () => {
    expect(parsePromptAssistResponse('{"text":"En café-sajt i Malmö"}')).toBe(
      "En café-sajt i Malmö",
    );
    expect(parsePromptAssistResponse("En café-sajt i Malmö")).toBe("En café-sajt i Malmö");
    expect(parsePromptAssistResponse('{"text":"   "}')).toBeNull();
    expect(parsePromptAssistResponse("")).toBeNull();
  });
});
