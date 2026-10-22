import { describe, expect, it } from "vitest";
import { buildOpenClawNavigationSystemPrompt } from "./navigation-system-prompt";
import { parseOpenClawMessage } from "./text-field-actions";

describe("buildOpenClawNavigationSystemPrompt", () => {
  it("beskriver manifestet, read_files, taken och svarsprefixet", () => {
    const prompt = buildOpenClawNavigationSystemPrompt();
    expect(prompt).toContain("[FILMANIFEST]");
    expect(prompt).toContain('"type":"read_files"');
    expect(prompt).toContain("Högst 6 filer per runda och högst 2 rundor");
    expect(prompt).toContain("[Filinnehåll]");
  });

  it("innehåller ett exempelblock som parsern godtar", () => {
    const prompt = buildOpenClawNavigationSystemPrompt();
    const start = prompt.indexOf("<openclaw-action>");
    const end = prompt.indexOf("</openclaw-action>") + "</openclaw-action>".length;
    const parsed = parseOpenClawMessage(prompt.slice(start, end));
    expect(parsed.action).toEqual({
      type: "read_files",
      paths: ["app/page.tsx", "components/hero.tsx"],
      reason: "Kort motivering",
    });
  });
});
