import { describe, expect, it } from "vitest";
import {
  extractFirstJsonObject,
  parseOpenClawEditOps,
} from "./ops-schema";

describe("extractFirstJsonObject", () => {
  it("returns a bare JSON object unchanged", () => {
    const raw = '{"ops":[],"summary":"x"}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  it("pulls the object out of surrounding prose", () => {
    const raw = 'Here you go:\n{"ops":[]}\nHope that helps.';
    expect(extractFirstJsonObject(raw)).toBe('{"ops":[]}');
  });

  it("pulls the object out of a ```json fence", () => {
    const raw = '```json\n{"ops":[],"summary":"y"}\n```';
    expect(extractFirstJsonObject(raw)).toBe('{"ops":[],"summary":"y"}');
  });

  it("is string-aware: braces inside a string literal don't end the object early", () => {
    const raw = '{"ops":[{"kind":"replace_text","path":"a.css","find":"a{b}","replace":"c"}]}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  it("returns null when there is no object", () => {
    expect(extractFirstJsonObject("no json here")).toBeNull();
    expect(extractFirstJsonObject("")).toBeNull();
  });
});

describe("parseOpenClawEditOps", () => {
  it("parses a valid replace_text payload", () => {
    const raw = JSON.stringify({
      ops: [
        { kind: "replace_text", path: "app/globals.css", find: "pink", replace: "blue" },
      ],
      summary: "Byter rosa mot blå",
    });
    const result = parseOpenClawEditOps(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ops).toHaveLength(1);
      expect(result.ops[0]).toMatchObject({ kind: "replace_text", find: "pink", replace: "blue" });
      expect(result.summary).toBe("Byter rosa mot blå");
    }
  });

  it("parses ops wrapped in a fence + prose", () => {
    const raw =
      'Visst!\n```json\n{"ops":[{"kind":"replace_content","path":"a.tsx","content":"x"}]}\n```';
    const result = parseOpenClawEditOps(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ops[0].kind).toBe("replace_content");
  });

  it("treats an empty ops array as a valid decline (no ops, no error)", () => {
    const raw = '{"ops":[],"summary":"Kan inte göras med visade filer"}';
    const result = parseOpenClawEditOps(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ops).toHaveLength(0);
      expect(result.summary).toContain("Kan inte");
    }
  });

  it("rejects a replace_text op missing the required find", () => {
    const raw = '{"ops":[{"kind":"replace_text","path":"a.css","replace":"blue"}]}';
    const result = parseOpenClawEditOps(raw);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown op kind", () => {
    const raw = '{"ops":[{"kind":"rename","path":"a.css"}]}';
    const result = parseOpenClawEditOps(raw);
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON output", () => {
    const result = parseOpenClawEditOps("sorry, I can't do that");
    expect(result.ok).toBe(false);
  });

  it("rejects more than 50 ops", () => {
    const ops = Array.from({ length: 51 }, (_, i) => ({
      kind: "replace_text",
      path: `f${i}.css`,
      find: "a",
      replace: "b",
    }));
    const result = parseOpenClawEditOps(JSON.stringify({ ops }));
    expect(result.ok).toBe(false);
  });
});
