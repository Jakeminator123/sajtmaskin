import { describe, expect, it } from "vitest";
import {
  readProcessStepsDraft,
  updateProcessStepsDraft,
  type ProcessStepDraft,
} from "./process-editor";

describe("process-editor", () => {
  describe("readProcessStepsDraft", () => {
    it("reads process steps from page files", () => {
      const content = [
        "const process = [",
        "  'Steg ett',",
        "  'Steg två',",
        "  'Steg tre',",
        "];",
      ].join("\n");
      expect(readProcessStepsDraft("app/page.tsx", content)).toEqual([
        { text: "Steg ett" },
        { text: "Steg två" },
        { text: "Steg tre" },
      ]);
    });

    it("reads steps arrays too", () => {
      const content = [
        "const steps = [",
        "  'One',",
        "  'Two',",
        "];",
      ].join("\n");
      expect(readProcessStepsDraft("app/page.tsx", content)).toEqual([
        { text: "One" },
        { text: "Two" },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const process = [",
        "  'Steg ett',",
        "  'Steg två',",
        "];",
      ].join("\n");
      expect(readProcessStepsDraft("components/process.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two steps exist", () => {
      const content = [
        "const process = [",
        "  'Steg ett',",
        "];",
      ].join("\n");
      expect(readProcessStepsDraft("app/page.tsx", content)).toBeNull();
    });
  });

  describe("updateProcessStepsDraft", () => {
    it("updates steps in place", () => {
      const content = [
        "const process = [",
        "  'Steg ett',",
        "  'Steg två',",
        "  'Steg tre',",
        "];",
      ].join("\n");
      const nextItems: ProcessStepDraft[] = [
        { text: "Kartlägg nuläget" },
        { text: "Prioritera rätt CTA" },
        { text: "Förfina designen" },
      ];
      const updated = updateProcessStepsDraft(content, nextItems);
      expect(updated).toContain("'Kartlägg nuläget'");
      expect(updated).toContain("'Prioritera rätt CTA'");
      expect(updated).toContain("'Förfina designen'");
    });

    it("returns content unchanged when no edits", () => {
      const content = [
        "const process = [",
        "  'Steg ett',",
        "  'Steg två',",
        "];",
      ].join("\n");
      const nextItems: ProcessStepDraft[] = [
        { text: "Steg ett" },
        { text: "Steg två" },
      ];
      expect(updateProcessStepsDraft(content, nextItems)).toBe(content);
    });
  });
});
