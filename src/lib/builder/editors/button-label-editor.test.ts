import { describe, expect, it } from "vitest";
import {
  readButtonLabelsDraft,
  updateButtonLabelsDraft,
  type ButtonLabelDraft,
} from "./button-label-editor";

describe("button-label-editor", () => {
  describe("readButtonLabelsDraft", () => {
    it("reads direct Button labels from component files", () => {
      const content = [
        "<Button size=\"lg\">",
        "  Starta projekt <ArrowRight className=\"ml-2 h-4 w-4\" />",
        "</Button>",
        "<Button variant=\"outline\">",
        "  Se upplägget",
        "</Button>",
      ].join("\n");

      expect(readButtonLabelsDraft("components/cta.tsx", content)).toEqual([
        { label: "Starta projekt" },
        { label: "Se upplägget" },
      ]);
    });

    it("skips asChild buttons with nested links", () => {
      const content = [
        "<Button asChild>",
        "  <Link href=\"/blog\">Read posts</Link>",
        "</Button>",
      ].join("\n");

      expect(readButtonLabelsDraft("components/cta.tsx", content)).toBeNull();
    });
  });

  describe("updateButtonLabelsDraft", () => {
    it("updates labels while preserving trailing icons", () => {
      const content = [
        "<Button size=\"lg\">",
        "  Starta projekt <ArrowRight className=\"ml-2 h-4 w-4\" />",
        "</Button>",
        "<Button variant=\"outline\">",
        "  Se upplägget",
        "</Button>",
      ].join("\n");

      const nextItems: ButtonLabelDraft[] = [
        { label: "Boka demo" },
        { label: "Utforska mer" },
      ];

      const updated = updateButtonLabelsDraft(content, nextItems);
      expect(updated).toContain("Boka demo <ArrowRight");
      expect(updated).toContain("Utforska mer");
    });

    it("returns content unchanged when no edits exist", () => {
      const content = [
        "<Button size=\"lg\">",
        "  Starta projekt",
        "</Button>",
      ].join("\n");

      const nextItems: ButtonLabelDraft[] = [{ label: "Starta projekt" }];
      expect(updateButtonLabelsDraft(content, nextItems)).toBe(content);
    });
  });
});
