import { describe, it, expect } from "vitest";

import { parseOpenClawMessage } from "./text-field-actions";

describe("parseOpenClawMessage — request_repair action", () => {
  it("parses a request_repair action block", () => {
    const content = [
      "Jag startar en reparation av de typecheck-fel jag ser.",
      "<openclaw-action>",
      '{"type":"request_repair","label":"Laga typecheck-fel","reason":"TS2322 i app/page.tsx"}',
      "</openclaw-action>",
    ].join("\n");

    const parsed = parseOpenClawMessage(content);
    expect(parsed.action).toEqual({
      type: "request_repair",
      label: "Laga typecheck-fel",
      reason: "TS2322 i app/page.tsx",
    });
    expect(parsed.visibleContent).toContain("Jag startar en reparation");
    expect(parsed.hasIncompleteAction).toBe(false);
  });

  it("still parses a fill_text_field action (regression)", () => {
    const content = [
      "Här är ett förslag.",
      "<openclaw-action>",
      '{"type":"fill_text_field","target":"builder.chat.primary","value":"Hej"}',
      "</openclaw-action>",
    ].join("\n");

    const parsed = parseOpenClawMessage(content);
    expect(parsed.action?.type).toBe("fill_text_field");
    if (parsed.action?.type === "fill_text_field") {
      expect(parsed.action.target).toBe("builder.chat.primary");
      expect(parsed.action.value).toBe("Hej");
    }
  });

  it("ignores an unknown action type", () => {
    const content = [
      "text",
      "<openclaw-action>",
      '{"type":"delete_everything"}',
      "</openclaw-action>",
    ].join("\n");
    expect(parseOpenClawMessage(content).action).toBeNull();
  });

  it("treats an unterminated action block as incomplete", () => {
    const content = 'Förklaring...\n<openclaw-action>\n{"type":"request_repair"';
    const parsed = parseOpenClawMessage(content);
    expect(parsed.action).toBeNull();
    expect(parsed.hasIncompleteAction).toBe(true);
  });
});
