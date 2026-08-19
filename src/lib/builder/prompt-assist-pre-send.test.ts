import { describe, expect, it } from "vitest";

import {
  buildPromptAssistMessages,
  buildPromptAssistModelOptions,
  parsePromptAssistResponse,
  PROMPT_REWRITE_MAX_CHARS,
  PROMPT_REWRITE_MAX_OUTPUT_TOKENS,
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
    expect(system).toContain(`${PROMPT_REWRITE_MAX_CHARS} characters`);
  });

  it("reads JSON text and accepts raw prose", () => {
    expect(parsePromptAssistResponse('{"text":"En café-sajt i Malmö"}')).toBe(
      "En café-sajt i Malmö",
    );
    expect(parsePromptAssistResponse("En café-sajt i Malmö")).toBe("En café-sajt i Malmö");
    expect(parsePromptAssistResponse('{"text":"   "}')).toBeNull();
    expect(parsePromptAssistResponse("")).toBeNull();
  });

  it("unwraps fenced JSON and rejects broken JSON wrappers", () => {
    expect(
      parsePromptAssistResponse('```json\n{"text":"En café-sajt i Malmö"}\n```'),
    ).toBe("En café-sajt i Malmö");
    expect(parsePromptAssistResponse('{"text":')).toBeNull();
    expect(parsePromptAssistResponse("```\nEn café-sajt i Malmö\n```")).toBe(
      "En café-sajt i Malmö",
    );
  });

  it("extracts JSON after a preamble and keeps prose that only has braces", () => {
    expect(
      parsePromptAssistResponse(
        'Här är det rättade utkastet:\n{"text":"En café-sajt i Malmö"}',
      ),
    ).toBe("En café-sajt i Malmö");
    expect(
      parsePromptAssistResponse("En sajt med {namn} i titeln"),
    ).toBe("En sajt med {namn} i titeln");
    expect(
      parsePromptAssistResponse('Förklaring:\n```js\nconsole.log(1)\n```\noch en kontaktform'),
    ).toBe("Förklaring:\n```js\nconsole.log(1)\n```\noch en kontaktform");
    expect(parsePromptAssistResponse('Här är JSON:\n{"text":')).toBeNull();
  });

  it("clamps oversized rewrites without splitting a Unicode surrogate pair", () => {
    const prefix = "a".repeat(PROMPT_REWRITE_MAX_CHARS - 1);
    const parsed = parsePromptAssistResponse(JSON.stringify({ text: `${prefix}😀tail` }));

    expect(parsed).toBe(prefix);
    expect(parsed).toHaveLength(PROMPT_REWRITE_MAX_CHARS - 1);
    expect(parsed).not.toContain("�");
  });

  it("keeps normal rewrites unchanged at and below the writeback boundary", () => {
    const atBoundary = "ö".repeat(PROMPT_REWRITE_MAX_CHARS);
    expect(parsePromptAssistResponse(JSON.stringify({ text: atBoundary }))).toBe(atBoundary);
    expect(parsePromptAssistResponse('{"text":"En vanlig rättning"}')).toBe("En vanlig rättning");
  });

  it("caps provider output and forces GPT-5.6 off thinking", () => {
    expect(buildPromptAssistModelOptions("openai/gpt-5.6-terra")).toEqual({
      maxOutputTokens: PROMPT_REWRITE_MAX_OUTPUT_TOKENS,
      providerOptions: { openai: { reasoningEffort: "none" } },
    });
  });
});
